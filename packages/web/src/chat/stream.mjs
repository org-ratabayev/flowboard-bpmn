// Reads the event stream of a chat turn (text/event-stream over a POST response, so EventSource
// cannot be used). Events arrive as { event, data } with data parsed from JSON.

/** Incremental parser: `push(text)` calls `onEvent` for every complete event. */
export function createSseParser(onEvent) {
  let buffer = '';
  return {
    push(text) {
      buffer += text.replace(/\r\n/g, '\n');
      let end;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const chunk = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        let event = 'message';
        const data = [];
        for (const line of chunk.split('\n')) {
          if (line.startsWith(':')) continue; // keep-alive comment
          const colon = line.indexOf(':');
          const field = colon === -1 ? line : line.slice(0, colon);
          const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
          if (field === 'event') event = value;
          else if (field === 'data') data.push(value);
        }
        if (!data.length) continue;
        let parsed;
        try { parsed = JSON.parse(data.join('\n')); } catch { parsed = data.join('\n'); }
        onEvent({ event, data: parsed });
      }
    }
  };
}

/** Reads a fetch Response body to its end, calling `onEvent` per event. */
export async function readEventStream(response, onEvent) {
  const parser = createSseParser(onEvent);
  // an explicit reader: not every browser can iterate a response body with for await
  const decoder = new TextDecoder();
  const bytes = response.body.getReader();
  for (let chunk = await bytes.read(); !chunk.done; chunk = await bytes.read()) {
    parser.push(decoder.decode(chunk.value, { stream: true }));
  }
  parser.push(decoder.decode());
}
