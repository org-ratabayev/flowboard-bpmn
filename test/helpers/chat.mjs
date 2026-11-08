// The browser side of the chat API for tests: a signed-in browser that keeps its cookies,
// sends prompts and reads the turn's event stream, and answers tool requests like the editor.

import { request } from './server.mjs';

/** A browser of `name` on `srv`: keeps the session and keyring cookies. */
export async function browser(srv, name) {
  const jar = new Map([['flowboard_session', (await srv.signIn(name)).split('=')[1]]]);
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const call = async (method, urlPath, body) => {
    const res = await request(srv.base, method, urlPath, body, { cookie: cookie() });
    for (const c of res.headers.getSetCookie()) {
      const [k, v] = c.split(';')[0].split('=');
      jar.set(k, v);
    }
    return res;
  };
  return {
    jar,
    call,
    /**
     * Sends a prompt and reads the turn's event stream to its end. `onEvent` sees each event
     * (e.g. to answer tool requests); `controller` can abort the request (closing the tab).
     */
    async turn(projectId, conversationId, message, { onEvent, controller = new AbortController(), attachments } = {}) {
      const res = await fetch(`${srv.base}/api/projects/${projectId}/chat/conversations/${conversationId}/turns`, {
        method: 'POST',
        signal: controller.signal,
        headers: { Origin: srv.base, Cookie: cookie(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, attachments })
      });
      if (res.status !== 200) return { status: res.status, headers: res.headers, body: await res.json(), events: [] };
      const events = [];
      let raw = '';
      try {
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          raw += value;
          buffer += value;
          let end;
          while ((end = buffer.indexOf('\n\n')) !== -1) {
            const chunk = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const event = /^event: (.*)$/m.exec(chunk)?.[1];
            const data = /^data: (.*)$/m.exec(chunk)?.[1];
            if (!event) continue;
            const parsed = { event, ...JSON.parse(data) };
            events.push(parsed);
            await onEvent?.(parsed);
          }
        }
      } catch { /* aborted here */ }
      return { status: 200, events, raw };
    }
  };
}

export const chatPath = (projectId, rest = '') => `/api/projects/${projectId}/chat/conversations${rest}`;

/** Answers a tool request like the editor would. */
export const answer = (b, projectId, conversationId, event, content, isError = false) =>
  b.call('POST', chatPath(projectId, `/${conversationId}/tool-results`), { turnId: event.turnId, toolCallId: event.id, content, isError });

