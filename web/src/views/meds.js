import { el, clear } from '../lib/dom.js';
import { store } from '../state/store.js';
import { prettyTime } from '../lib/format.js';
import { makeDoseCheck } from '../ui/dose-check.js';
import { todaysDoses, todaysAdherence } from '../data/meds.js';

/** Render the Meds tab: today's progress, scheduled doses, and full regimen. */
export function renderMeds(container) {
  const { state } = store;
  clear(container);

  const today = todaysAdherence(state);
  const rollingPct = Math.round(state.adherence30 * 100);
  const todayPct = today.total ? Math.round((today.taken / today.total) * 100) : 0;

  // --- Today progress ---
  const progress = el('div', { class: 'card' });
  progress.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px">
      <div style="font-size:15px;font-weight:600">Today</div>
      <div style="font-family:'Inter Tight';font-weight:800;font-size:20px">${today.taken}/${today.total}</div>
    </div>
    <div class="adherence-bar"><span style="width:${todayPct}%"></span></div>
    <div style="font-size:13px;color:var(--label-2);margin-top:10px">30-day adherence ·
      <b style="color:var(--green)">${rollingPct}%</b></div>`;
  container.append(progress);

  // --- Today's doses grouped by time ---
  container.append(el('div', { class: 'section-title' }, "Today's doses"));
  const byTime = {};
  for (const dose of todaysDoses(state)) {
    (byTime[dose.time] = byTime[dose.time] || []).push(dose);
  }
  for (const time of Object.keys(byTime).sort()) {
    container.append(
      el(
        'div',
        {
          style:
            'font-size:13px;color:var(--label-3);margin:14px 4px 6px;font-weight:600',
        },
        prettyTime(time),
      ),
    );
    const card = el('div', { class: 'card tight' });
    for (const dose of byTime[time]) {
      card.append(
        el('div', { class: 'row' }, [
          makeDoseCheck(dose),
          el('div', { class: 'grow' }, [
            el(
              'div',
              { class: 'title' },
              `${dose.med.name}${dose.med.brand ? ` · ${dose.med.brand}` : ''}`,
            ),
            el('div', { class: 'sub' }, `${dose.med.dose} — ${dose.med.purpose}`),
          ]),
        ]),
      );
    }
    container.append(card);
  }

  // --- Full regimen ---
  container.append(el('div', { class: 'section-title' }, 'Regimen'));
  const regimen = el('div', { class: 'card tight' });
  for (const med of state.medications) {
    regimen.append(
      el('div', { class: 'row' }, [
        el('div', { class: 'grow' }, [
          el('div', { class: 'title' }, `${med.name} ${med.dose}`),
          el(
            'div',
            { class: 'sub' },
            `${med.times.length}×/day · ${med.times.map(prettyTime).join(', ')}`,
          ),
        ]),
        el('span', { class: 'chevron' }, '›'),
      ]),
    );
  }
  container.append(regimen);
}
