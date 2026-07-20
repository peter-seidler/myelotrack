import { buildInitialState } from '../data/seed.js';
import { api } from '../api/client.js';
import {
  labsToStore,
  medsToStore,
  pallorToStore,
  symptomHistoryToStore,
} from '../api/adapters.js';

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

    /**
     * Replace the read slices (labs, meds, pallor, symptom history) with live
     * data from the API. Throws if any fetch fails so the caller can fall back
     * to the seed that's already loaded. The working "today" check-in and dose
     * log stay local.
     */
    async hydrate() {
      const [meds, labs, pallor, symptoms] = await Promise.all([
        api.getMedications(),
        api.getLabs(),
        api.getPallor(),
        api.getSymptoms(),
      ]);
      state.medications = medsToStore(meds);
      state.labs = labsToStore(labs);
      state.pallor = pallorToStore(pallor);
      const history = symptomHistoryToStore(symptoms);
      if (history.length) state.symptomHistory = history;
      notify();
    },
  };
}

export const store = createStore(buildInitialState());
