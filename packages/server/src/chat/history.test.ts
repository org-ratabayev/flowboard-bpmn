import { describe, expect, it } from 'vitest';
import type { ContentBlock } from '../llm/types.ts';
import { MISSING_RESULT, toProviderHistory } from './history.ts';

const text = (t: string): ContentBlock => ({ type: 'text', text: t });
const use = (id: string): ContentBlock => ({ type: 'tool_use', id, name: 'bpmn_lint', input: {} });
const result = (id: string, content = 'ok'): ContentBlock => ({ type: 'tool_result', toolUseId: id, content });
const user = (...content: ContentBlock[]) => ({ role: 'user' as const, content });
const assistant = (...content: ContentBlock[]) => ({ role: 'assistant' as const, content });

describe('provider history', () => {
  it('keeps a well-formed history as it is', () => {
    const history = [user(text('a')), assistant(use('1')), user(result('1')), assistant(text('b'))];
    expect(toProviderHistory(history)).toEqual(history);
  });

  it('merges neighbours with the same role and drops empty messages', () => {
    expect(toProviderHistory([user(text('a')), user(text('b')), assistant(), assistant(text('c'))])).toEqual([
      user(text('a'), text('b')),
      assistant(text('c'))
    ]);
  });

  it('adds placeholder results for tool calls that never got one', () => {
    expect(toProviderHistory([user(text('a')), assistant(text('x'), use('1'), use('2')), user(result('2')), user(text('next'))])).toEqual([
      user(text('a')),
      assistant(text('x'), use('1'), use('2')),
      user({ type: 'tool_result', toolUseId: '1', content: MISSING_RESULT, isError: true }, result('2'), text('next'))
    ]);
    expect(toProviderHistory([user(text('a')), assistant(use('1'))])).toEqual([
      user(text('a')),
      assistant(use('1')),
      user({ type: 'tool_result', toolUseId: '1', content: MISSING_RESULT, isError: true })
    ]);
  });

  it('drops results without a matching call, duplicates, and a leading assistant message', () => {
    expect(toProviderHistory([assistant(text('hi')), user(text('a'), result('ghost')), assistant(use('1')), user(result('1'), result('1', 'again'))])).toEqual([
      user(text('a')),
      assistant(use('1')),
      user(result('1'))
    ]);
  });
});
