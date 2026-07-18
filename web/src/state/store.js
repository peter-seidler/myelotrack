import { buildInitialState } from '../data/seed.js';

/**
 * Minimal observable store. Holds the single in-memory app state, notifies
 * subscribers on change, and funnels all mutations through `commit` so there
 * is one place changes happen.
 *
 * This is intentionally tiny — no framework. When a real backend lands, the
 * mutators become API calls and `commit` stays the single write path.
 */
function createStore(initialState) {
  const state = initialState;
  const listeners = new Set();

  const notify = () => {
    for (const listener of listeners) listener(state);
  };

  return {
    /** Current state (treat as read-only; mutate via `commit`). */
    get state() {
      return state;
    },

    /**
     * Apply a mutation and notify subscribers.
     * @param {(state: object) => void} mutator
     */
    commit(mutator) {
      mutator(state);
      notify();
    },

    /**
     * Subscribe to state changes.
     * @param {(state: object) => void} listener
     * @returns {() => void} unsubscribe
     */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const store = createStore(buildInitialState());
