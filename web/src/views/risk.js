import { el, clear } from '../lib/dom.js';
import { store } from '../state/store.js';
import { dipssScore, dipssPlusExtras } from '../data/risk.js';

const TONE = {
  green: 'var(--green)',
  yellow: 'var(--yellow)',
  orange: 'var(--orange)',
  red: 'var(--red)',
};

/** One contributing-factor row: what it reads, its weight, and points earned. */
function factorRow(f) {
  return el(
    'div',
    { class: 'factor' + (f.present ? ' on' : '') + (f.known ? '' : ' unknown') },
    [
      el('div', { class: 'factor-main' }, [
        el('div', { class: 'factor-name' }, f.label),
        el('div', { class: 'factor-detail' }, f.detail),
      ]),
      el('span', { class: 'wt' }, `×${f.weight}`),
      el('span', { class: 'pts' }, f.present ? `+${f.weight}` : '0'),
    ],
  );
}

/** Render the Score tab: the DIPSS risk score aggregated from every input. */
export function renderRisk(container) {
  const { state } = store;
  clear(container);
  const score = dipssScore(state);
  const tone = TONE[score.band.tone];

  // --- Hero: risk band + points + 4-band meter ---
  const meter = el('div', { class: 'risk-meter' });
  for (const b of score.bands) {
    const active = b.index === score.band.index;
    meter.append(
      el('div', {
        class: 'risk-seg' + (active ? ' active' : ''),
        style: active ? `background:${TONE[b.tone]};border-color:${TONE[b.tone]}` : '',
      }),
    );
  }
  const scale = el('div', { class: 'risk-scale' }, [
    el('span', {}, 'Low'),
    el('span', {}, 'Int-1'),
    el('span', {}, 'Int-2'),
    el('span', {}, 'High'),
  ]);
  container.append(
    el('div', { class: 'risk-hero' }, [
      el('div', { class: 'risk-band', style: `color:${tone}` }, score.band.label),
      el('div', { class: 'risk-sub' }, [
        el('span', { class: 'risk-points' }, String(score.points)),
        ` of ${score.maxPoints} points · DIPSS`,
      ]),
      meter,
      scale,
    ]),
  );

  // --- Contributing factors (the "many inputs") ---
  container.append(el('div', { class: 'section-title' }, 'What feeds this score'));
  const card = el('div', { class: 'card tight' });
  score.factors.forEach((f) => card.append(factorRow(f)));
  container.append(card);

  // --- DIPSS-Plus extensions (the path to a finer score) ---
  container.append(el('div', { class: 'section-title' }, 'Finer detail · DIPSS-Plus'));
  const card2 = el('div', { class: 'card tight' });
  dipssPlusExtras(state).forEach((f) => card2.append(factorRow(f)));
  container.append(card2);

  container.append(
    el(
      'p',
      { class: 'disclaimer' },
      score.anyUnknown
        ? 'Some inputs are missing, so this is a partial score. DIPSS (Passamonti et al., Blood 2010) is a prognostic reference, not a diagnosis — confirm with your care team.'
        : 'DIPSS (Passamonti et al., Blood 2010) is a prognostic reference, not a diagnosis — review trends with your care team. DIPSS-Plus (Gangat et al., JCO 2011) adds platelets, transfusion need, and karyotype for a finer score.',
    ),
  );
}
