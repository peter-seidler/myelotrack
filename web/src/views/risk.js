import { el, clear } from '../lib/dom.js';
import { store } from '../state/store.js';
import { scoreForState } from '../data/risk.js';

const TONE = {
  green: 'var(--green)',
  yellow: 'var(--yellow)',
  orange: 'var(--orange)',
  red: 'var(--red)',
  neutral: 'var(--label-3)',
};

/**
 * One contributing-factor row. Points-based models (DIPSS) show a weight chip
 * and the points earned; categorical models (IPSET / PV) show a risk flag.
 */
function factorRow(f) {
  const right =
    f.weight != null
      ? [
          el('span', { class: 'wt' }, `×${f.weight}`),
          el('span', { class: 'pts' }, f.present ? `+${f.weight}` : '0'),
        ]
      : [
          el(
            'span',
            { class: 'flag' + (f.present ? ' on' : '') },
            f.present ? 'risk' : '—',
          ),
        ];
  return el(
    'div',
    { class: 'factor' + (f.present ? ' on' : '') + (f.known ? '' : ' unknown') },
    [
      el('div', { class: 'factor-main' }, [
        el('div', { class: 'factor-name' }, f.label),
        el('div', { class: 'factor-detail' }, f.detail),
      ]),
      ...right,
    ],
  );
}

/** Render the Score tab: the prognostic score for the patient's MPN subtype. */
export function renderRisk(container) {
  const { state } = store;
  clear(container);
  const score = scoreForState(state);
  const tone = TONE[score.band.tone] || TONE.neutral;

  // --- Hero: risk band + a meter across the model's bands ---
  const meter = el('div', { class: 'risk-meter' });
  const scale = el('div', { class: 'risk-scale' });
  for (const b of score.bands) {
    const active = b.index === score.band.index;
    meter.append(
      el('div', {
        class: 'risk-seg' + (active ? ' active' : ''),
        style: active ? `background:${TONE[b.tone]};border-color:${TONE[b.tone]}` : '',
      }),
    );
    scale.append(el('span', {}, b.short));
  }
  const sub =
    score.points != null
      ? [
          el('span', { class: 'risk-points' }, String(score.points)),
          ` of ${score.maxPoints} points · ${score.title}`,
        ]
      : [score.title];
  container.append(
    el('div', { class: 'risk-hero' }, [
      el('div', { class: 'risk-eyebrow' }, score.what),
      el('div', { class: 'risk-band', style: `color:${tone}` }, score.band.label),
      el('div', { class: 'risk-sub' }, sub),
      meter,
      scale,
    ]),
  );

  // --- Contributing factors (the "many inputs") ---
  container.append(el('div', { class: 'section-title' }, 'What feeds this score'));
  const card = el('div', { class: 'card tight' });
  score.factors.forEach((f) => card.append(factorRow(f)));
  container.append(card);

  // --- DIPSS-Plus extensions (DIPSS only) ---
  if (score.extras) {
    container.append(el('div', { class: 'section-title' }, 'Finer detail · DIPSS-Plus'));
    const card2 = el('div', { class: 'card tight' });
    score.extras.forEach((f) => card2.append(factorRow(f)));
    container.append(card2);
  }

  container.append(el('p', { class: 'disclaimer' }, score.footnote));
}
