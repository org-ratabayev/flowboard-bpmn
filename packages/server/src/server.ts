import fsp from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { createChatService } from './chat/chatService.ts';
import { createClaudeCodeProvider } from './chat/claudeCode.ts';
import { parseConfig, type Config, type ConfigInput } from './config.ts';
import { HttpError, send, serveStatic } from './http.ts';
import { createLiveHub } from './live.ts';
import { handleApi } from './routes.ts';
import { createFileStore } from './storage/fileStore.ts';

export interface BpmnServer {
  config: Config;
  httpServer: http.Server;
  /** Starts listening on config.host/config.port; resolves with the actual address. */
  listen(): Promise<{ host: string; port: number }>;
  /** Stops accepting requests and closes open connections, including live streams. */
  close(): Promise<void>;
}

export function createServer(input: Config | ConfigInput): BpmnServer {
  const config = parseConfig(input);
  const publicDir = config.publicDir;
  const ctx = {
    store: createFileStore(config.dataDir),
    live: createLiveHub(),
    chat: config.chat.enabled
      ? createChatService({ provider: createClaudeCodeProvider(config.chat.claudeCode), workDir: config.chat.workDir })
      : null
  };

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    try {
      const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      if (parts[0] === 'api') return await handleApi(ctx, req, res, parts, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
      if (parts.length === 0) return await serveStatic(res, path.join(publicDir, 'index.html'));
      if (parts[0] === 'p' && parts.length === 2) return await serveStatic(res, path.join(publicDir, 'editor.html'));
      if (parts[0] === 'licenses' && parts.length === 1 && config.licensesFile) {
        const text = await fsp.readFile(config.licensesFile, 'utf8');
        return send(res, 200, text, { 'Cache-Control': 'no-cache' });
      }
      const file = path.resolve(publicDir, ...parts);
      if (!file.startsWith(publicDir + path.sep)) return send(res, 403, 'Forbidden');
      return await serveStatic(res, file);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 0;
      if (!res.headersSent) send(res, status || 500, { error: status ? (err as Error).message : 'Internal error' });
      if (!status) console.error(err);
    }
  });

  return {
    config,
    httpServer,
    listen() {
      return new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(config.port, config.host, () => {
          httpServer.off('error', reject);
          const { address, port } = httpServer.address() as AddressInfo;
          resolve({ host: address, port });
        });
      });
    },
    close() {
      if (!httpServer.listening) return Promise.resolve();
      return new Promise((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
        httpServer.closeAllConnections();
      });
    }
  };
}
