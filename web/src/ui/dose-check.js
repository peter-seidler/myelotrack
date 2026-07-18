import { el } from '../lib/dom.js';
import { store } from '../state/store.js';
import { nextDoseStatus } from '../data/meds.js';
import { toast } from './toast.js';

/**
 * A round check button for a single scheduled dose. Tapping cycles
 * unset → taken → skipped → unset and commits to the store (which re-renders).
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
    },
  });
  btn.textContent = status === 'taken' ? '✓' : status === 'skipped' ? '–' : '';
  return btn;
}
