import { el, clear } from '../lib/dom.js';
import { store } from '../state/store.js';
import { toast } from '../ui/toast.js';
import { makeDoseCheck } from '../ui/dose-check.js';
import { SYMPTOM_ITEMS, totalSymptomScore, symptomBand } from '../data/symptoms.js';
import { todaysDoses } from '../data/meds.js';
import { api } from '../api/client.js';
import { USE_API } from '../config.js';

// Which "today" sub-tab is showing. Module-level so it survives the
// store-driven re-render (the router re-renders the active tab on every commit).
let activeSub = 'symptoms';

const SUB_TABS = [
  { id: 'symptoms', label: 'Symptoms' },
  { id: 'vitals', label: 'Vitals' },
  { id: 'notes', label: 'Notes' },
];

/** Mark today's entry as an unsaved draft (re-enables Save). */
function markDraft(s) {
  s.todaySubmitted = false;
}

/**
 * A labelled slider row (same layout as a symptom row). `onInput` fires live
 * during drag (no commit); `onCommit` fires on release so the store notifies.
 */
function sliderRow(label, value, opts, onInput, onCommit) {
  const valEl = el('span', { class: 'val' }, opts.format(value));
  const slider = el('input', {
    type: 'range',
    min: String(opts.min),
    max: String(opts.max),
    step: String(opts.step),
    value: String(value),
    'aria-label': label,
    oninput: (e) => {
      const v = Number(e.target.value);
      valEl.textContent = opts.format(v);
      onInput(v);
    },
    onchange: (e) => onCommit(Number(e.target.value)),
  });
  return el('div', { class: 'symptom' }, [
    el('div', { class: 'head' }, [el('span', { class: 'name' }, label), valEl]),
    slider,
  ]);
}

/** Symptoms sub-tab: MPN-SAF score dial + the 10 sliders + a meds glance. */
function renderSymptoms(container, state) {
  const total = totalSymptomScore(state.todayItems);
  const band = symptomBand(total);
  const prev = state.symptomHistory[state.symptomHistory.length - 1];
  const delta = total - prev;

  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const hero = el('div', { class: 'hero' });
  hero.innerHTML = `
    <div class="dial">
      <svg width="110" height="110" viewBox="0 0 110 110">
        <circle cx="55" cy="55" r="${radius}" fill="none" stroke="var(--track)" stroke-width="9"/>
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

  // Update the dial imperatively while sliders drag (no re-render).
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

  container.append(
    el(
      'div',
      { class: 'section-title' },
      'How are you feeling? (0 = absent · 10 = worst)',
    ),
  );
  const card = el('div', { class: 'card tight' });
  for (const item of SYMPTOM_ITEMS) {
    card.append(
      sliderRow(
        item.label,
        state.todayItems[item.key],
        { min: 0, max: 10, step: 1, format: (v) => String(v) },
        (v) => {
          state.todayItems[item.key] = v;
          updateDial();
        },
        () => store.commit(markDraft),
      ),
    );
  }
  container.append(card);

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
}

/** Vitals sub-tab: weight + other daily diagnostics. */
function renderVitals(container, state) {
  const v = state.todayVitals;
  const commit = () => store.commit(markDraft);
  container.append(el('div', { class: 'section-title' }, "Today's vitals"));
  const card = el('div', { class: 'card tight' });
  card.append(
    sliderRow(
      'Weight',
      state.todayWeight,
      { min: 60, max: 95, step: 0.1, format: (x) => `${x.toFixed(1)} kg` },
      (x) => {
        state.todayWeight = x;
      },
      commit,
    ),
    sliderRow(
      'Temperature',
      v.temperature,
      { min: 35.5, max: 40, step: 0.1, format: (x) => `${x.toFixed(1)} °C` },
      (x) => {
        v.temperature = x;
      },
      commit,
    ),
    sliderRow(
      'Heart rate',
      v.heartRate,
      { min: 45, max: 130, step: 1, format: (x) => `${x} bpm` },
      (x) => {
        v.heartRate = x;
      },
      commit,
    ),
    sliderRow(
      'Blood pressure — systolic',
      v.bpSystolic,
      { min: 90, max: 175, step: 1, format: (x) => `${x} mmHg` },
      (x) => {
        v.bpSystolic = x;
      },
      commit,
    ),
    sliderRow(
      'Blood pressure — diastolic',
      v.bpDiastolic,
      { min: 50, max: 110, step: 1, format: (x) => `${x} mmHg` },
      (x) => {
        v.bpDiastolic = x;
      },
      commit,
    ),
    sliderRow(
      'Oxygen (SpO₂)',
      v.spo2,
      { min: 90, max: 100, step: 1, format: (x) => `${x} %` },
      (x) => {
        v.spo2 = x;
      },
      commit,
    ),
    sliderRow(
      'Spleen — below costal margin',
      v.spleenCm,
      { min: 0, max: 18, step: 0.5, format: (x) => `${x} cm` },
      (x) => {
        v.spleenCm = x;
      },
      commit,
    ),
  );
  container.append(card);
  container.append(
    el(
      'p',
      { class: 'disclaimer' },
      'Spleen size (cm palpable below the left costal margin) is a common MPN marker — estimate from your last exam or record what your clinician measured.',
    ),
  );
}

/** Notes sub-tab: free-text note + sleep and energy. */
function renderNotes(container, state) {
  container.append(el('div', { class: 'section-title' }, 'Notes for today'));
  const card = el('div', { class: 'card' });
  const ta = el('textarea', {
    class: 'note-input',
    rows: '5',
    placeholder:
      'How are you doing today? Anything to flag for your care team — new symptoms, triggers, questions…',
    oninput: (e) => {
      state.todayNote = e.target.value;
    },
    onchange: () => store.commit(markDraft),
  });
  ta.value = state.todayNote;
  card.append(ta);
  container.append(card);

  const commit = () => store.commit(markDraft);
  container.append(el('div', { class: 'section-title' }, 'Sleep & energy'));
  const card2 = el('div', { class: 'card tight' });
  card2.append(
    sliderRow(
      'Sleep last night',
      state.todaySleepHours,
      { min: 0, max: 12, step: 0.5, format: (x) => `${x.toFixed(1)} h` },
      (x) => {
        state.todaySleepHours = x;
      },
      commit,
    ),
    sliderRow(
      'Energy',
      state.todayEnergy,
      { min: 0, max: 10, step: 1, format: (x) => `${x} / 10` },
      (x) => {
        state.todayEnergy = x;
      },
      commit,
    ),
  );
  container.append(card2);
}

/** Persist today's whole check-in (symptoms + vitals + notes). */
function saveToday(state) {
  if (state.todaySubmitted) return;
  store.commit((s) => {
    s.symptomHistory.push(totalSymptomScore(s.todayItems));
    if (s.symptomHistory.length > 10) s.symptomHistory.shift();
    s.todaySubmitted = true;
  });
  toast('Saved for today');
  if (USE_API) {
    api
      .createSymptom({ items: { ...state.todayItems }, weightKg: state.todayWeight })
      .catch(() => toast('Sync failed'));
  }
}

const RENDERERS = {
  symptoms: renderSymptoms,
  vitals: renderVitals,
  notes: renderNotes,
};

/**
 * Render the Today tab: segmented sub-tabs (Symptoms / Vitals / Notes) with a
 * sticky Save that logs the whole day's check-in in one place.
 */
export function renderToday(container) {
  const { state } = store;
  clear(container);

  const seg = el('div', { class: 'seg' });
  const body = el('div', {});
  const draw = () => {
    clear(body);
    RENDERERS[activeSub](body, state);
  };
  for (const t of SUB_TABS) {
    seg.append(
      el(
        'button',
        {
          class: 'seg-btn' + (activeSub === t.id ? ' active' : ''),
          'data-sub': t.id,
          onclick: () => {
            if (activeSub === t.id) return;
            activeSub = t.id;
            seg
              .querySelectorAll('.seg-btn')
              .forEach((b) => b.classList.toggle('active', b.dataset.sub === t.id));
            draw();
          },
        },
        t.label,
      ),
    );
  }
  container.append(seg, body);
  draw();

  container.append(
    el(
      'p',
      { class: 'disclaimer' },
      'MPN-SAF TSS is a symptom-tracking tool, not a diagnosis. Share trends with your care team; call them about anything acute (new fever, uncontrolled sweats, bleeding).',
    ),
  );

  // Prominent, always-visible Save for the whole day's check-in.
  container.append(
    el('div', { class: 'save-bar' }, [
      el(
        'button',
        {
          class: 'btn' + (state.todaySubmitted ? ' green' : ''),
          onclick: () => saveToday(state),
        },
        state.todaySubmitted ? '✓ Logged for today' : "Save today's check-in",
      ),
    ]),
  );
}
