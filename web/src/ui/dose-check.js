import { el } from '../lib/dom.js';
import { store } from '../state/store.js';
import { nextDoseStatus } from '../data/meds.js';
import { toast } from './toast.js';
import { api } from '../api/client.js';
import { USE_API } from '../config.js';

/**
 * A round check button for a single scheduled dose. Tapping cycles
 * unset → taken → skipped → unset and commits to the store (which re-renders).
 * When the API is configured, the taken/skipped event is also persisted
 * (optimistic — the local commit isn't rolled back on a failed sync).
 *
 * @param {{ key: string, med: object, time: string }} dose
 * @returns {HTMLButtonElement}
 */
export function makeDoseCheck(dose) {
  const status = store.state.doseLog[dose.key];
  const btn = el('button', {
    class: 'med-check' + (status ? ' ' + status : ''),
    'aria-label': `Log ${dose.med.name} ${dose.time}`,
    onclick: () => {
      const next = nextDoseStatus(store.state.doseLog[dose.key]);
      store.commit((s) => {
        if (next == null) delete s.doseLog[dose.key];
        else s.doseLog[dose.key] = next;
      });
      toast(
        next === 'taken'
          ? 'Dose logged'
          : next === 'skipped'
            ? 'Marked skipped'
            : 'Cleared',
      );
      if (USE_API && next) {
        api.logDose(dose.med.id, { status: next }).catch(() => toast('Sync failed'));
      }
    },
  });
  btn.textContent = status === 'taken' ? '✓' : status === 'skipped' ? '–' : '';
  return btn;
}
