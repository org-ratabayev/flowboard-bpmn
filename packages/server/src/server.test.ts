import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type BpmnServer } from './index.ts';

describe('createServer', () => {
  let dir: string;
  let server: BpmnServer;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'server-test-'));
    await fs.mkdir(path.join(dir, 'public'));
    await fs.writeFile(path.join(dir, 'public', 'index.html'), '<!doctype html><title>test</title>');
    server = createServer({
      port: 0,
      host: '127.0.0.1',
      dataDir: path.join(dir, 'data'),
      publicDir: path.join(dir, 'public'),
      chat: { enabled: false }
    });
  });

  afterEach(async () => {
    await server.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('listens on a free port and serves the API and static files', async () => {
    const { port } = await server.listen();
    expect(port).toBeGreaterThan(0);
    const base = `http://127.0.0.1:${port}`;

    const created = await fetch(`${base}/api/projects`, { method: 'POST', body: JSON.stringify({ name: 'In process' }) });
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ id: 'in-process' });
    expect(await (await fetch(`${base}/`)).text()).toContain('<title>test</title>');
    expect((await fetch(`${base}/licenses`)).status).toBe(404);
  });

  it('keeps live rooms per server instance', async () => {
    const other = createServer({ ...server.config, port: 0 });
    try {
      const [a, b] = await Promise.all([server.listen(), other.listen()]);
      await fetch(`http://127.0.0.1:${a.port}/api/projects`, { method: 'POST', body: '{}' });
      const stream = new AbortController();
      const res = await fetch(`http://127.0.0.1:${a.port}/api/projects/untitled-diagram/live?client=client-0001`, { signal: stream.signal });
      expect(res.status).toBe(200);

      const post = (port: number) => fetch(`http://127.0.0.1:${port}/api/projects/untitled-diagram/live`, {
        method: 'POST',
        body: JSON.stringify({ client: 'client-0001', type: 'cursor', cursor: { x: 1, y: 1 } })
      });
      expect((await post(a.port)).status).toBe(200);
      expect((await post(b.port)).status).toBe(404);
      stream.abort();
    } finally {
      await other.close();
    }
  });

  it('closes open live streams on close()', async () => {
    const { port } = await server.listen();
    await fetch(`http://127.0.0.1:${port}/api/projects`, { method: 'POST', body: '{}' });
    const res = await fetch(`http://127.0.0.1:${port}/api/projects/untitled-diagram/live?client=client-0002`);
    const reader = res.body!.getReader();
    await reader.read();
    await server.close();
    const ended = await (async () => {
      try {
        for (;;) if ((await reader.read()).done) return true;
      } catch {
        return true; // the client reports the closed connection as an error
      }
    })();
    expect(ended).toBe(true);
    expect(server.httpServer.listening).toBe(false);
  });

  it('can be closed without having been started', async () => {
    await expect(server.close()).resolves.toBeUndefined();
  });
});
