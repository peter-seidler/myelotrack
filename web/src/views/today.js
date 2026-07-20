import { el, clear } from '../lib/dom.js';
import { store } from '../state/store.js';
import { toast } from '../ui/toast.js';
import { makeDoseCheck } from '../ui/dose-check.js';
import { SYMPTOM_ITEMS, totalSymptomScore, symptomBand } from '../data/symptoms.js';
import { todaysDoses } from '../data/meds.js';
import { api } from '../api/client.js';
import { USE_API } from '../config.js';

/** Render the Today tab: MPN-SAF check-in, weight, and today's due meds. */
export function renderToday(container) {
  const { state } = store;
  clear(container);

  const total = totalSymptomScore(state.todayItems);
  const band = symptomBand(total);
  const prev = state.symptomHistory[state.symptomHistory.length - 1];
  const delta = total - prev;

  // --- Hero score dial ---
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const hero = el('div', { class: 'hero' });
  hero.innerHTML = `
    <div class="dial">
      <svg width="110" height="110" viewBox="0 0 110 110">
        <circle cx="55" cy="55" r="${radius}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="9"/>
        <circle cx="55" cy="55" r="${radius}" fill="none" stroke="${band.color}" stroke-width="9"
          stroke-linecap="round" stroke-dasharray="${circumference}"
          stroke-dashoffset="${circumference * (1 - total / 100)}"/>
      </svg>
      <div class="center"><div class="num">${total}</div><div class="of">of 100</div></div>
    </div>
    <div class="meta">
      <h3>${band.label} symptoms</h3>
      <p>MPN-SAF total symptom score${state.todaySubmitted ? ' · logged' : ' · draft'}</p>
      <p><span class="delta" style="color:${delta > 0 ? 'var(--orange)' : 'var(--green)'}">
        ${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)}</span>
        <span style="color:var(--label-3)"> vs. last entry</span></p>
    </div>`;
  container.append(hero);

  // Imperatively update the dial while sliders are dragged (no re-render).
  const updateDial = () => {
    const t = totalSymptomScore(state.todayItems);
    const b = symptomBand(t);
    hero.querySelector('.num').textContent = t;
    hero.querySelector('.meta h3').textContent = `${b.label} symptoms`;
    const arc = hero.querySelector('circle:last-of-type');
    arc.setAttribute('stroke', b.color);
    arc.setAttribute('stroke-dashoffset', circumference * (1 - t / 100));
    const d = t - prev;
    const deltaEl = hero.querySelector('.meta .delta');
    deltaEl.textContent = `${d > 0 ? '▲' : '▼'} ${Math.abs(d)}`;
    deltaEl.style.color = d > 0 ? 'var(--orange)' : 'var(--green)';
  };

  // --- Symptom sliders ---
  container.append(
    el(
      'div',
      { class: 'section-title' },
      'How are you feeling? (0 = absent · 10 = worst)',
    ),
  );
  const card = el('div', { class: 'card tight' });
  for (const item of SYMPTOM_ITEMS) {
    const value = state.todayItems[item.key];
    const valEl = el('span', { class: 'val' }, String(value));
    const slider = el('input', {
      type: 'range',
      min: '0',
      max: '10',
      step: '1',
      value: String(value),
      'aria-label': item.label,
      oninput: (e) => {
        // Live feedback during drag: update state + dial without a re-render.
        state.todayItems[item.key] = Number(e.target.value);
        valEl.textContent = e.target.value;
        updateDial();
      },
      onchange: () => {
        // Commit on release so the store notifies and "draft" state persists.
        store.commit((s) => {
          s.todaySubmitted = false;
        });
      },
    });
    card.append(
      el('div', { class: 'symptom' }, [
        el('div', { class: 'head' }, [el('span', { class: 'name' }, item.label), valEl]),
        slider,
      ]),
    );
  }
  container.append(card);

  // --- Weight ---
  container.append(el('div', { class: 'section-title' }, 'Weight'));
  const weightCard = el('div', { class: 'card' });
  const weightVal = el(
    'span',
    { style: "font-family:'Inter Tight';font-size:26px;font-weight:800;min-width:96px" },
    `${state.todayWeight.toFixed(1)} kg`,
  );
  weightCard.append(
    el('div', { style: 'display:flex;align-items:center;gap:14px' }, [
      weightVal,
      el('input', {
        type: 'range',
        min: '60',
        max: '85',
        step: '0.1',
        value: String(state.todayWeight),
        'aria-label': 'Weight in kilograms',
        style: 'flex:1',
        oninput: (e) => {
          weightVal.textContent = `${Number(e.target.value).toFixed(1)} kg`;
        },
        onchange: (e) => {
          store.commit((s) => {
            s.todayWeight = Number(e.target.value);
          });
        },
      }),
    ]),
  );
  container.append(weightCard);

  // --- Medications due today (quick glance) ---
  container.append(el('div', { class: 'section-title' }, 'Medications due today'));
  const medsCard = el('div', { class: 'card tight' });
  for (const dose of todaysDoses(state).slice(0, 4)) {
    const status = state.doseLog[dose.key];
    medsCard.append(
      el('div', { class: 'row' }, [
        makeDoseCheck(dose),
        el('div', { class: 'grow' }, [
          el('div', { class: 'title' }, `${dose.med.name} · ${dose.med.dose}`),
          el(
            'div',
            { class: 'sub' },
            `${dose.time}${dose.med.brand ? ' · ' + dose.med.brand : ''}`,
          ),
        ]),
        el(
          'div',
          { class: 'trail' },
          status === 'taken' ? 'Taken' : status === 'skipped' ? 'Skipped' : 'Due',
        ),
      ]),
    );
  }
  container.append(medsCard);

  // --- Save ---
  container.append(
    el(
      'button',
      {
        class: 'btn' + (state.todaySubmitted ? ' green' : ''),
        onclick: () => {
          if (state.todaySubmitted) return;
          store.commit((s) => {
            s.symptomHistory.push(totalSymptomScore(s.todayItems));
            if (s.symptomHistory.length > 10) s.symptomHistory.shift();
            s.todaySubmitted = true;
          });
          toast('Check-in saved');
          if (USE_API) {
            api
              .createSymptom({
                items: { ...state.todayItems },
                weightKg: state.todayWeight,
              })
              .catch(() => toast('Sync failed'));
          }
        },
      },
      state.todaySubmitted ? '✓ Logged for today' : "Save today's check-in",
    ),
  );
  container.append(
    el(
      'p',
      { class: 'disclaimer' },
      'MPN-SAF TSS is a symptom-tracking tool, not a diagnosis. Share trends with your care team; call them about anything acute (new fever, uncontrolled sweats, bleeding).',
    ),
  );
}
