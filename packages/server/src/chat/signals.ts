// Wakes the instance running a turn when something about its conversation changed elsewhere:
// a tool result was stored, a cancel was requested, the conversation was deleted. The event bus
// carries only the conversation id; the turn re-reads the database. Polling at a slow pace backs up
// the bus, so a lost notification (e.g. while the LISTEN connection reconnects) only delays a turn.

import type { EventBus } from '../events.ts';

export interface ConversationSignal {
  /**
   * Resolves at the next change of the conversation, after `ms` at the latest, or when `signal`
   * aborts. A change that happened since the previous wait resolves it at once.
   */
  wait(ms: number, signal?: AbortSignal): Promise<void>;
  close(): void;
}

export function conversationSignal(bus: EventBus, conversationId: string): ConversationSignal {
  let changed = false;
  let wake: (() => void) | null = null;
  const off = bus.subscribe('chat', (id) => {
    if (id !== conversationId) return;
    changed = true;
    wake?.();
  });

  return {
    wait(ms, signal) {
      if (changed || signal?.aborted) {
        changed = false;
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        const done = () => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', done);
          wake = null;
          changed = false;
          resolve();
        };
        const timer = setTimeout(done, ms);
        signal?.addEventListener('abort', done, { once: true });
        wake = done;
      });
    },
    close() {
      off();
      wake?.();
    }
  };
}
