// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { attachmentName, attachmentProblem, readAttachments } from './attachments.mjs';
import { createSseParser } from './stream.mjs';

describe('turn event stream', () => {
  it('parses events split across chunks and skips keep-alive comments', () => {
    const events = [];
    const parser = createSseParser((e) => events.push(e));
    parser.push('id: 1\nevent: turn\ndata: {"turnId":"t1"}\n\n: keep-alive\n\nid: 2\nevent: te');
    expect(events).toEqual([{ event: 'turn', data: { turnId: 't1' } }]);
    parser.push('xt\ndata: {"text":"Hel');
    parser.push('lo"}\r\n\r\n');
    expect(events.at(-1)).toEqual({ event: 'text', data: { text: 'Hello' } });
    expect(events).toHaveLength(2);
  });
});

describe('attachments', () => {
  const file = (name, size = 10) => new File(['x'.repeat(size)], name);

  it('allow up to 3 text files of 2 MB, 6 MB together', () => {
    expect(attachmentProblem([file('a.csv'), file('b.md'), file('c.bpmn')])).toBeNull();
    expect(attachmentProblem([file('a.txt'), file('b.txt'), file('c.txt'), file('d.txt')])).toMatch(/At most 3/);
    expect(attachmentProblem([file('scan.pdf')])).toMatch(/only text files/);
    expect(attachmentProblem([{ name: 'big.txt', size: 2 * 1024 * 1024 + 1 }])).toMatch(/larger than 2 MB/);
  });

  it('are read as text and recognized in the stored history', async () => {
    expect(await readAttachments([new File(['id,total'], 'orders.csv')])).toEqual([{ name: 'orders.csv', text: 'id,total' }]);
    expect(attachmentName('<attachment name="orders.csv">\nid,total\n</attachment>')).toBe('orders.csv');
    expect(attachmentName('Please look at <attachment name="x">')).toBeNull();
  });
});
