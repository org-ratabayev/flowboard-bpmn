// Reads a text/event-stream response body as { event, data } records.

export interface SseRecord {
  event: string | null;
  data: string;
}

export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseRecord> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value.replace(/\r\n/g, '\n');
      let end;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        let event: string | null = null;
        const data: string[] = [];
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
        }
        if (data.length) yield { event, data: data.join('\n') };
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Reads an error body without ever echoing request headers; keeps it short. */
export async function errorText(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  try {
    const parsed = JSON.parse(text);
    const message = parsed?.error?.message ?? parsed?.message;
    if (typeof message === 'string') return message.slice(0, 300);
  } catch { /* not JSON */ }
  return text.slice(0, 300) || res.statusText;
}
