// Who may do what with a document. One rule, used by every route:
//   owner   the document's owner_id
//   editor  a grant with role 'editor'
//   viewer  a grant with role 'viewer', or visibility 'everyone' (every signed-in user)
//   none    otherwise, and for every user once the document is deleted (deleted_at set); routes
//           answer 404 so document ids cannot be probed
//
// Grants come from the owner directly, from a share link (revoking the link removes them) or
// from an email invitation accepted at the invitee's first sign-in. Every change is logged.

import crypto from 'node:crypto';
import { toIso, type Db, type Queryable } from './db.ts';

export type Role = 'none' | 'viewer' | 'editor' | 'owner';
export type GrantRole = 'viewer' | 'editor';
export type Visibility = 'private' | 'everyone';

const RANK: Record<Role, number> = { none: 0, viewer: 1, editor: 2, owner: 3 };
export const atLeast = (role: Role, minimum: Role) => RANK[role] >= RANK[minimum];
export const isGrantRole = (value: unknown): value is GrantRole => value === 'viewer' || value === 'editor';
export const isVisibility = (value: unknown): value is Visibility => value === 'private' || value === 'everyone';

export const LINK_PREFIX = 'fb_link_';
const LINK_RE = /^fb_link_[\w-]{32}$/;
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
export const normalizeEmail = (value: unknown): string | null => {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
};
const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export interface UserSummary {
  id: string;
  name: string;
  email: string | null;
}

export interface ShareLink {
  id: string;
  role: GrantRole;
  createdAt: string;
  expiresAt: string | null;
  /** People who joined through this link and still have access through it. */
  members: number;
}

export interface DocumentAccess {
  owner: UserSummary | null;
  visibility: Visibility;
  /** Sorted by name; `viaLink` when the access came from a share link. */
  grants: Array<{ user: UserSummary; role: GrantRole; grantedAt: string; viaLink: boolean }>;
  /** Only for the owner. */
  links?: ShareLink[];
  /** Only for the owner: invitations waiting for the person's first sign-in. */
  invites?: Array<{ email: string; role: GrantRole; invitedAt: string }>;
}

export interface LogEntry {
  at: string;
  actor: { id: string; name: string } | null;
  action: string;
  details: { [key: string]: unknown };
}

/** SQL expression for the role of user $1 on document alias d with grant alias g (left-joined for $1). */
export const ROLE_SQL = `CASE WHEN d.owner_id = $1 THEN 'owner'
  WHEN g.role IS NOT NULL THEN g.role
  WHEN d.visibility = 'everyone' THEN 'viewer'
  ELSE 'none' END`;

/**
 * Remembers the first user ever created (call when inserting a user, in that transaction).
 * Recorded once, so "the first user" stays the same even for users created in the same millisecond.
 */
export async function rememberFirstUser(q: Queryable, userId: string): Promise<void> {
  await q.run(`INSERT INTO app_settings (key, value) VALUES ('first_user_id', $1) ON CONFLICT (key) DO NOTHING`, [userId]);
}

/** Gives every document without an owner to the first user who signed in; returns how many changed. */
export async function adoptUnowned(q: Queryable): Promise<number> {
  return (await q.run(
    `UPDATE documents SET owner_id = (SELECT value FROM app_settings WHERE key = 'first_user_id')
     WHERE owner_id IS NULL AND EXISTS (SELECT 1 FROM app_settings WHERE key = 'first_user_id')`
  )).changes;
}

/** Appends to the access log (in the caller's transaction). */
export async function audit(
  q: Queryable,
  entry: { documentId: string | null; actorId: string | null; action: string; details?: Record<string, unknown> }
): Promise<void> {
  await q.run(
    'INSERT INTO audit_log (id, document_id, actor_id, action, details, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [crypto.randomUUID(), entry.documentId, entry.actorId, entry.action, JSON.stringify(entry.details ?? {}), new Date().toISOString()]
  );
}

/**
 * Sets a user's grant. With `onlyRaise` an existing higher role (or ownership) is kept.
 * Returns the previous role, or undefined when nothing changed.
 */
async function setGrant(
  q: Queryable,
  documentId: string,
  userId: string,
  role: GrantRole,
  options: { grantedBy: string | null; linkId: string | null; onlyRaise: boolean }
): Promise<{ previous: Role } | undefined> {
  const doc = await q.get<{ owner_id: string | null }>('SELECT owner_id FROM documents WHERE id = $1 AND deleted_at IS NULL', [documentId]);
  if (!doc || doc.owner_id === userId) return undefined;
  const existing = await q.get<{ role: GrantRole; link_id: string | null }>(
    'SELECT role, link_id FROM document_grants WHERE document_id = $1 AND user_id = $2', [documentId, userId]
  );
  if (options.onlyRaise && existing && RANK[existing.role] >= RANK[role]) return undefined;
  if (!options.onlyRaise && existing && existing.role === role && existing.link_id === options.linkId) return undefined;
  const now = new Date().toISOString();
  if (existing) {
    await q.run('UPDATE document_grants SET role = $3, link_id = $4, updated_at = $5 WHERE document_id = $1 AND user_id = $2',
      [documentId, userId, role, options.linkId, now]);
  } else {
    await q.run(
      'INSERT INTO document_grants (document_id, user_id, role, granted_by, link_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $6)',
      [documentId, userId, role, options.grantedBy, options.linkId, now]
    );
  }
  return { previous: existing?.role ?? 'none' };
}

/**
 * Turns invitations for the user's email into grants; called when a user signs in (in that transaction).
 * Invitations to deleted projects stay pending, so they still apply if an admin restores the project.
 */
export async function acceptInvites(q: Queryable, user: { id: string; email: string | null }): Promise<number> {
  const email = normalizeEmail(user.email);
  if (!email) return 0;
  const invites = await q.all<{ document_id: string; role: GrantRole; granted_by: string | null }>(
    `SELECT p.document_id, p.role, p.granted_by FROM pending_grants p JOIN documents d ON d.id = p.document_id
     WHERE p.email = $1 AND d.deleted_at IS NULL`,
    [email]
  );
  for (const invite of invites) {
    const changed = await setGrant(q, invite.document_id, user.id, invite.role, { grantedBy: invite.granted_by, linkId: null, onlyRaise: true });
    await audit(q, { documentId: invite.document_id, actorId: user.id, action: 'invite.accept', details: { email, role: invite.role, changed: !!changed } });
    await q.run('DELETE FROM pending_grants WHERE document_id = $1 AND email = $2', [invite.document_id, email]);
  }
  return invites.length;
}

const userName = async (q: Queryable, id: string) => (await q.get<{ name: string }>('SELECT name FROM users WHERE id = $1', [id]))?.name ?? null;

export type AccessStore = ReturnType<typeof createAccessStore>;

export function createAccessStore(db: Db) {
  return {
    adoptUnowned: () => db.transaction(adoptUnowned),

    /** The user's role on a document; 'none' also when the document does not exist or was deleted. */
    async roleOf(userId: string, documentId: string): Promise<Role> {
      const row = await db.read((q) =>
        q.get<{ role: Role }>(
          `SELECT ${ROLE_SQL} AS role FROM documents d
           LEFT JOIN document_grants g ON g.document_id = d.id AND g.user_id = $1
           WHERE d.id = $2 AND d.deleted_at IS NULL`,
          [userId, documentId]
        )
      );
      return row?.role ?? 'none';
    },

    /** Who has access; links and pending invitations only with `forOwner`. */
    access(documentId: string, { forOwner = false } = {}): Promise<DocumentAccess> {
      return db.read(async (q) => {
        const doc = await q.get<{ visibility: Visibility; owner_id: string | null; name: string | null; email: string | null }>(
          `SELECT d.visibility, d.owner_id, u.name, u.email FROM documents d LEFT JOIN users u ON u.id = d.owner_id WHERE d.id = $1`,
          [documentId]
        );
        const grants = await q.all<{ id: string; name: string; email: string | null; role: GrantRole; created_at: unknown; link_id: string | null }>(
          `SELECT u.id, u.name, u.email, g.role, g.created_at, g.link_id FROM document_grants g JOIN users u ON u.id = g.user_id
           WHERE g.document_id = $1 ORDER BY lower(u.name), u.id`,
          [documentId]
        );
        const result: DocumentAccess = {
          owner: doc?.owner_id ? { id: doc.owner_id, name: doc.name!, email: doc.email ?? null } : null,
          visibility: doc?.visibility ?? 'private',
          grants: grants.map((g) => ({
            user: { id: g.id, name: g.name, email: g.email ?? null },
            role: g.role,
            grantedAt: toIso(g.created_at)!,
            viaLink: g.link_id !== null
          }))
        };
        if (forOwner) {
          const links = await q.all<{ id: string; role: GrantRole; created_at: unknown; expires_at: unknown; members: unknown }>(
            `SELECT l.id, l.role, l.created_at, l.expires_at,
                    (SELECT COUNT(*) FROM document_grants g WHERE g.link_id = l.id) AS members
             FROM share_links l WHERE l.document_id = $1 AND l.revoked_at IS NULL ORDER BY l.created_at, l.id`,
            [documentId]
          );
          result.links = links.map((l) => ({ id: l.id, role: l.role, createdAt: toIso(l.created_at)!, expiresAt: toIso(l.expires_at), members: Number(l.members) }));
          const invites = await q.all<{ email: string; role: GrantRole; created_at: unknown }>(
            'SELECT email, role, created_at FROM pending_grants WHERE document_id = $1 ORDER BY email', [documentId]
          );
          result.invites = invites.map((i) => ({ email: i.email, role: i.role, invitedAt: toIso(i.created_at)! }));
        }
        return result;
      });
    },

    /** Gives a user a role directly (also turning link access into direct access); refuses the owner and unknown users. */
    grant(documentId: string, userId: string, role: GrantRole, actorId: string): Promise<'ok' | 'owner' | 'unknown-user'> {
      return db.transaction(async (q) => {
        const name = await userName(q, userId);
        if (name === null) return 'unknown-user';
        if (await q.get('SELECT id FROM documents WHERE id = $1 AND owner_id = $2', [documentId, userId])) return 'owner';
        const changed = await setGrant(q, documentId, userId, role, { grantedBy: actorId, linkId: null, onlyRaise: false });
        if (changed) await audit(q, { documentId, actorId, action: 'member.set', details: { userId, name, role, previous: changed.previous } });
        return 'ok';
      });
    },

    /** Removes a user's grant; false when there was none. */
    revoke(documentId: string, userId: string, actorId: string): Promise<boolean> {
      return db.transaction(async (q) => {
        const name = await userName(q, userId);
        const removed = (await q.run('DELETE FROM document_grants WHERE document_id = $1 AND user_id = $2', [documentId, userId])).changes > 0;
        if (removed) await audit(q, { documentId, actorId, action: 'member.remove', details: { userId, name, self: userId === actorId } });
        return removed;
      });
    },

    setVisibility(documentId: string, visibility: Visibility, actorId: string): Promise<void> {
      return db.transaction(async (q) => {
        const previous = (await q.get<{ visibility: Visibility }>('SELECT visibility FROM documents WHERE id = $1', [documentId]))?.visibility;
        if (previous === visibility) return;
        await q.run('UPDATE documents SET visibility = $2 WHERE id = $1', [documentId, visibility]);
        await audit(q, { documentId, actorId, action: 'visibility.set', details: { visibility, previous } });
      });
    },

    /** Creates a share link; the returned `token` is the only time its value is available. */
    createLink(documentId: string, role: GrantRole, expiresInDays: number | null, actorId: string): Promise<ShareLink & { token: string }> {
      return db.transaction(async (q) => {
        const token = LINK_PREFIX + crypto.randomBytes(24).toString('base64url');
        const issuedAt = new Date();
        const link = {
          id: crypto.randomUUID(),
          role,
          createdAt: issuedAt.toISOString(),
          expiresAt: expiresInDays === null ? null : new Date(Date.now() + expiresInDays * 864e5).toISOString(),
          members: 0
        };
        await q.run(
          'INSERT INTO share_links (id, document_id, token_hash, role, created_by, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [link.id, documentId, hash(token), role, actorId, link.createdAt, link.expiresAt]
        );
        await audit(q, { documentId, actorId, action: 'link.create', details: { linkId: link.id, role, expiresAt: link.expiresAt } });
        return { ...link, token };
      });
    },

    /** Revokes a link and removes the access of everyone who joined through it; false for an unknown link. */
    revokeLink(documentId: string, linkId: string, actorId: string): Promise<boolean> {
      return db.transaction(async (q) => {
        const revoked = await q.run(
          'UPDATE share_links SET revoked_at = $3 WHERE id = $1 AND document_id = $2 AND revoked_at IS NULL',
          [linkId, documentId, new Date().toISOString()]
        );
        if (!revoked.changes) return false;
        const removed = await q.run('DELETE FROM document_grants WHERE link_id = $1', [linkId]);
        await audit(q, { documentId, actorId, action: 'link.revoke', details: { linkId, removedMembers: removed.changes } });
        return true;
      });
    },

    /**
     * Joins the link's project with its role (never lowering access the user already has).
     * Expiry only stops new people from joining; revoking the link removes those who joined.
     * A valid link to a deleted project answers 'deleted' (its holder may learn that it is gone).
     */
    joinByLink(token: string, userId: string): Promise<{ documentId: string; role: Role } | 'invalid' | 'expired' | 'deleted'> {
      if (!LINK_RE.test(token)) return Promise.resolve('invalid');
      return db.transaction(async (q) => {
        const link = await q.get<{ id: string; document_id: string; role: GrantRole; expires_at: unknown; deleted_at: unknown }>(
          `SELECT l.id, l.document_id, l.role, l.expires_at, d.deleted_at FROM share_links l JOIN documents d ON d.id = l.document_id
           WHERE l.token_hash = $1 AND l.revoked_at IS NULL`,
          [hash(token)]
        );
        if (!link) return 'invalid' as const;
        if (link.deleted_at) return 'deleted' as const;
        if (link.expires_at && toIso(link.expires_at)! <= new Date().toISOString()) return 'expired' as const;
        const changed = await setGrant(q, link.document_id, userId, link.role, { grantedBy: null, linkId: link.id, onlyRaise: true });
        if (changed) await audit(q, { documentId: link.document_id, actorId: userId, action: 'link.join', details: { linkId: link.id, role: link.role, previous: changed.previous } });
        const role = await q.get<{ role: Role }>(
          `SELECT ${ROLE_SQL} AS role FROM documents d LEFT JOIN document_grants g ON g.document_id = d.id AND g.user_id = $1 WHERE d.id = $2`,
          [userId, link.document_id]
        );
        return { documentId: link.document_id, role: role!.role };
      });
    },

    /** Invites by email: a known user gets access now, anyone else at their first sign-in with that email. */
    invite(documentId: string, email: string, role: GrantRole, actorId: string): Promise<'granted' | 'invited' | 'owner'> {
      return db.transaction(async (q) => {
        const user = await q.get<{ id: string; name: string }>('SELECT id, name FROM users WHERE lower(email) = $1 ORDER BY created_at LIMIT 1', [email]);
        if (user) {
          if (await q.get('SELECT id FROM documents WHERE id = $1 AND owner_id = $2', [documentId, user.id])) return 'owner' as const;
          const changed = await setGrant(q, documentId, user.id, role, { grantedBy: actorId, linkId: null, onlyRaise: false });
          if (changed) await audit(q, { documentId, actorId, action: 'member.set', details: { userId: user.id, name: user.name, role, previous: changed.previous, email } });
          return 'granted' as const;
        }
        const updated = await q.run('UPDATE pending_grants SET role = $3 WHERE document_id = $1 AND email = $2', [documentId, email, role]);
        if (!updated.changes) {
          await q.run('INSERT INTO pending_grants (document_id, email, role, granted_by, created_at) VALUES ($1, $2, $3, $4, $5)',
            [documentId, email, role, actorId, new Date().toISOString()]);
        }
        await audit(q, { documentId, actorId, action: 'invite.create', details: { email, role } });
        return 'invited' as const;
      });
    },

    removeInvite(documentId: string, email: string, actorId: string): Promise<boolean> {
      return db.transaction(async (q) => {
        const removed = (await q.run('DELETE FROM pending_grants WHERE document_id = $1 AND email = $2', [documentId, email])).changes > 0;
        if (removed) await audit(q, { documentId, actorId, action: 'invite.remove', details: { email } });
        return removed;
      });
    },

    /** Access changes of a document, newest first. */
    log(documentId: string, limit = 100): Promise<LogEntry[]> {
      return db.read(async (q) =>
        (await q.all<{ created_at: unknown; actor_id: string | null; actor_name: string | null; action: string; details: string }>(
          `SELECT a.created_at, a.actor_id, u.name AS actor_name, a.action, a.details FROM audit_log a
           LEFT JOIN users u ON u.id = a.actor_id WHERE a.document_id = $1 ORDER BY a.created_at DESC, a.id LIMIT $2`,
          [documentId, limit]
        )).map((r) => ({
          at: toIso(r.created_at)!,
          actor: r.actor_id ? { id: r.actor_id, name: r.actor_name ?? 'deleted user' } : null,
          action: r.action,
          details: JSON.parse(r.details)
        }))
      );
    },

    /** Signed-in users whose name or email contains `query` (case-insensitive), for the share dialog. */
    searchUsers(query: string, limit = 10): Promise<UserSummary[]> {
      const pattern = `%${query.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      return db.read(async (q) =>
        (await q.all<{ id: string; name: string; email: string | null }>(
          `SELECT id, name, email FROM users
           WHERE lower(name) LIKE $1 ESCAPE '\\' OR lower(coalesce(email, '')) LIKE $1 ESCAPE '\\'
           ORDER BY lower(name), id LIMIT $2`,
          [pattern, limit]
        )).map((u) => ({ id: u.id, name: u.name, email: u.email ?? null }))
      );
    }
  };
}
