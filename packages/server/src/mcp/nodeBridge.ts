// Bridges node:http and the web-standard Request / Response that the MCP SDK handler works with.
// Kept small and local instead of an adapter package: the body is read with a size cap before the
// SDK sees it, and the response body (JSON or an SSE stream) is piped back until the client leaves.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeWebStream } from 'node:stream/web';
import { HttpError } from '../http.ts';

export interface RequestOptions {
  /** Larger bodies are refused with 413. */
  maxBytes: number;
  /** Aborts when the client goes away. */
  signal: AbortSignal;
  /** Lower-case header names left out of the Request (credentials, checked before this point). */
  dropHeaders: string[];
}

/** Reads the whole body and builds a Request for `url`. */
export async function toWebRequest(req: IncomingMessage, url: URL, { maxBytes, signal, dropHeaders }: RequestOptions): Promise<Request> {
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of req as AsyncIterable<Buffer>) {
      size += chunk.length;
      if (size > maxBytes) throw new HttpError(413, 'Payload too large');
      chunks.push(chunk);
    }
  } catch (err) {
    // a client that hangs up mid-body is not a server error
    throw err instanceof HttpError ? err : new HttpError(400, 'Incomplete request body');
  }
  const headers = new Headers();
  for (const [name, values] of Object.entries(req.headersDistinct)) {
    if (dropHeaders.includes(name)) continue;
    for (const value of values ?? []) headers.append(name, value);
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  return new Request(url, { method: req.method, headers, body: hasBody ? Buffer.concat(chunks) : undefined, signal });
}

/** Writes a Response to the node response; resolves when it is sent or the client went away. */
export async function sendWebResponse(res: ServerResponse, response: Response): Promise<void> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => { headers[name] = value; });
  res.writeHead(response.status, headers);
  if (!response.body) return void res.end();
  try {
    await pipeline(Readable.fromWeb(response.body as NodeWebStream<Uint8Array>), res);
  } catch {
    // the client closed the connection early (common for streams); nothing left to send
  }
}
