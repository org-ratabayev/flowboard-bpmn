// Live collaboration: presence, cursors, selections and the shared unsaved diagram.
//
// Browsers subscribe with Server-Sent Events (GET /api/projects/:id/live?client=…) and
// report their own activity with POST /api/projects/:id/live. Each project has an
// in-memory room; its `doc` is the latest diagram anyone produced, saved or not.
// Concurrent edits are last-writer-wins on the whole diagram.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { looksLikeBpmn } from './bpmn.ts';

const COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#0fa3b1', '#f032e6', '#469990', '#9a6324', '#800000'];
const CLIENT_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const EDITING_WINDOW_MS = 60 * 1000;
const HEARTBEAT_MS = 25 * 1000;
const MAX_DOC_BYTES = 20 * 1024 * 1024;

interface Client {
  id: string;
  res: ServerResponse;
  /** The signed-in user (users.id) and their current role on the project. */
  userId: string;
  role: string;
  name: string;
  color: string;
  cursor: { x: number; y: number } | null;
  selection: string[];
  viewing: string | null;
  active: boolean;
  lastEdit: number;
}

interface Room {
  clients: Map<string, Client>;
  doc: { xml: string } | null;
  rev: number;
  savedRev: number;
  guests: number;
}

export interface LiveResult {
  status: number;
  body: unknown;
}

function cleanName(name: unknown): string {
  return String(name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40);
}

function status(client: Client): string {
  if (!client.active) return 'away';
  if (client.viewing) return 'viewing-old';
  if (Date.now() - client.lastEdit < EDITING_WINDOW_MS) return 'editing';
  return 'viewing';
}

function participants(room: Room) {
  return [...room.clients.values()].map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    status: status(c),
    selection: c.selection,
    cursor: c.cursor
  }));
}

function sse(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcast(room: Room, event: string, data: unknown, exceptId?: string): void {
  for (const c of room.clients.values()) {
    if (c.id !== exceptId) sse(c.res, event, data);
  }
}

function broadcastPresence(room: Room): void {
  broadcast(room, 'presence', { participants: participants(room) });
}

function pickColor(room: Room): string {
  const used = new Map(COLORS.map((c) => [c, 0]));
  for (const c of room.clients.values()) used.set(c.color, (used.get(c.color) || 0) + 1);
  return [...used.entries()].sort((a, b) => a[1] - b[1])[0][0];
}

export type LiveHub = ReturnType<typeof createLiveHub>;

export function createLiveHub() {
  const rooms = new Map<string, Room>();

  function getRoom(projectId: string): Room {
    let room = rooms.get(projectId);
    if (!room) {
      room = { clients: new Map(), doc: null, rev: 0, savedRev: 0, guests: 0 };
      rooms.set(projectId, room);
    }
    return room;
  }

  return {
    /** GET …/live: open the event stream for one browser tab. */
    /** `user` is the signed-in user: their name is shown to the others; their role may change while connected. */
    handleStream(req: IncomingMessage, res: ServerResponse, projectId: string, url: URL, user: { id: string; name: string; role: string }): void {
      const name = user.name;
      const id = url.searchParams.get('client') || '';
      if (!CLIENT_ID_RE.test(id)) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Bad client id');
        return;
      }
      const room = getRoom(projectId);
      const previous = room.clients.get(id);
      if (previous) previous.res.end();

      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      res.write('retry: 2000\n\n');

      const client: Client = {
        id,
        res,
        userId: user.id,
        role: user.role,
        name: cleanName(name) || `Guest ${++room.guests}`,
        color: previous?.color || pickColor(room),
        cursor: null,
        selection: [],
        viewing: null,
        active: true,
        lastEdit: previous?.lastEdit || 0
      };
      room.clients.set(id, client);

      sse(res, 'hello', {
        you: { id, name: client.name, color: client.color, role: client.role },
        participants: participants(room),
        rev: room.rev,
        savedRev: room.savedRev,
        xml: room.doc ? room.doc.xml : null
      });
      broadcastPresence(room);

      // keeps proxies/tunnels from closing the stream and refreshes time-based statuses
      const heartbeat = setInterval(() => sse(res, 'presence', { participants: participants(room) }), HEARTBEAT_MS);

      req.on('close', () => {
        clearInterval(heartbeat);
        if (room.clients.get(id)?.res !== res) return;
        room.clients.delete(id);
        broadcastPresence(room);
        // keep an unsaved shared draft for the next visitor; drop empty, clean rooms
        if (!room.clients.size && room.rev === room.savedRev) rooms.delete(projectId);
      });
    },

    /** POST …/live: a tab reports its cursor, presence or a new version of the diagram. */
    handlePost(projectId: string, body: Record<string, any>): LiveResult {
      const room = rooms.get(projectId);
      const client = room?.clients.get(body.client);
      if (!room || !client) return { status: 404, body: { error: 'Not connected' } };

      if (body.type === 'cursor') {
        const valid = body.cursor && Number.isFinite(body.cursor.x) && Number.isFinite(body.cursor.y);
        client.cursor = valid ? { x: body.cursor.x, y: body.cursor.y } : null;
        broadcast(room, 'cursor', { id: client.id, cursor: client.cursor }, client.id);
        return { status: 200, body: { ok: true } };
      }

      if (body.type === 'presence') {
        if (Array.isArray(body.selection)) client.selection = body.selection.filter((s: unknown) => typeof s === 'string').slice(0, 50);
        if ('viewing' in body) client.viewing = typeof body.viewing === 'string' ? body.viewing : null;
        if ('active' in body) client.active = !!body.active;
        broadcastPresence(room);
        return { status: 200, body: { ok: true } };
      }

      if (body.type === 'doc') {
        if (!looksLikeBpmn(body.xml) || Buffer.byteLength(body.xml) > MAX_DOC_BYTES) {
          return { status: 400, body: { error: 'Not a BPMN diagram' } };
        }
        room.rev++;
        room.doc = { xml: body.xml };
        client.lastEdit = Date.now();
        broadcast(room, 'doc', { rev: room.rev, xml: body.xml, dirty: room.rev !== room.savedRev, by: { id: client.id, name: client.name } }, client.id);
        broadcastPresence(room);
        return { status: 200, body: { rev: room.rev } };
      }

      return { status: 400, body: { error: 'Unknown message type' } };
    },

    /**
     * Re-checks the role of everyone connected to a project after its access changed:
     * a changed role is sent as an `access` event; people without access get `access-revoked`
     * and are disconnected. Returns how many connections were told.
     */
    async refreshAccess(projectId: string, roleOf: (userId: string) => Promise<string>): Promise<number> {
      const room = rooms.get(projectId);
      if (!room) return 0;
      const roles = new Map<string, string>();
      for (const userId of new Set([...room.clients.values()].map((c) => c.userId))) roles.set(userId, await roleOf(userId));
      let told = 0;
      let left = false;
      for (const client of [...room.clients.values()]) {
        const role = roles.get(client.userId)!;
        if (role === client.role) continue;
        told++;
        if (role === 'none') {
          sse(client.res, 'access-revoked', {});
          room.clients.delete(client.id);
          client.res.end();
          left = true;
        } else {
          client.role = role;
          sse(client.res, 'access', { role });
        }
      }
      if (left) {
        broadcastPresence(room);
        if (!room.clients.size && room.rev === room.savedRev) rooms.delete(projectId);
      }
      return told;
    },

    /**
     * The project was deleted: every connection gets `access-revoked` with reason 'deleted' and is
     * closed, and the room (with any unsaved shared draft) is dropped. Returns how many were told.
     */
    projectDeleted(projectId: string): number {
      const room = rooms.get(projectId);
      if (!room) return 0;
      rooms.delete(projectId);
      for (const client of room.clients.values()) {
        sse(client.res, 'access-revoked', { reason: 'deleted' });
        client.res.end();
      }
      return room.clients.size;
    },

    /** Latest shared diagram of a project, if it has unsaved live changes. */
    liveDoc(projectId: string): { xml: string; rev: number; dirty: boolean } | null {
      const room = rooms.get(projectId);
      if (!room || !room.doc) return null;
      return { xml: room.doc.xml, rev: room.rev, dirty: room.rev !== room.savedRev };
    },

    /** Called after a version was saved to disk: it becomes the shared diagram for everyone. */
    onSaved(projectId: string, saved: { xml: string; version: string; author?: string | null; clientId?: string | null }): number {
      const room = getRoom(projectId);
      room.rev++;
      room.savedRev = room.rev;
      room.doc = { xml: saved.xml };
      const by = saved.clientId ? room.clients.get(saved.clientId) : undefined;
      broadcast(room, 'saved', { rev: room.rev, version: saved.version, xml: saved.xml, author: saved.author || by?.name || null, by: saved.clientId || null });
      if (!room.clients.size) rooms.delete(projectId);
      return room.rev;
    }
  };
}
