import { el, clear } from '../lib/dom.js';
import { store } from '../state/store.js';
import { lineChart, sparkline } from '../lib/charts.js';
import { symptomBand } from '../data/symptoms.js';

/** A small stat tile (value over a label). */
function statTile(label, value) {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'stat-v' }, value),
    el('div', { class: 'stat-k' }, label),
  ]);
}

/** Render the Trends tab: the daily check-in and key labs over time. */
export function renderTrends(container) {
  const { state } = store;
  clear(container);

  // --- Symptom burden (MPN-SAF) over recent entries ---
  const hist = state.symptomHistory || [];
  const latest = hist.length ? hist[hist.length - 1] : 0;
  const prev = hist.length > 1 ? hist[hist.length - 2] : latest;
  const delta = latest - prev;
  const band = symptomBand(latest);
  const avg = hist.length ? Math.round(hist.reduce((a, b) => a + b, 0) / hist.length) : 0;
  const lo = hist.length ? Math.min(...hist) : 0;
  const hi = hist.length ? Math.max(...hist) : 0;

  container.append(el('div', { class: 'section-title' }, 'Symptom burden · MPN-SAF'));
  const card = el('div', { class: 'card' });
  card.append(
    el('div', { class: 'trend-head' }, [
      el('div', {}, [
        el('span', { class: 'trend-num', style: `color:${band.color}` }, String(latest)),
        el('span', { class: 'trend-unit' }, ' / 100'),
      ]),
      el(
        'div',
        {
          class: 'trend-delta',
          style: `color:${delta > 0 ? 'var(--orange)' : 'var(--green)'}`,
        },
        `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)} vs. previous`,
      ),
    ]),
  );
  if (hist.length) {
    const spark = sparkline(hist, { min: 0, max: 100, height: 96 });
    spark.style.color = band.color;
    card.append(spark);
  }
  container.append(card);

  container.append(
    el('div', { class: 'stat-row' }, [
      statTile('Latest', String(latest)),
      statTile('Average', String(avg)),
      statTile('Range', `${lo}–${hi}`),
    ]),
  );

  // --- Hemoglobin (the key lab) over time ---
  const hgb = state.labs?.hemoglobin;
  if (hgb?.series?.length) {
    const last = hgb.series[hgb.series.length - 1];
    container.append(el('div', { class: 'section-title' }, 'Hemoglobin'));
    const c = el('div', { class: 'card' });
    c.append(
      el('div', { class: 'chart-val' }, [
        el('span', { class: 'big' }, String(last.value)),
        el('span', { class: 'unit' }, hgb.unit),
        el('span', { class: 'rng' }, `ref ${hgb.refLow}–${hgb.refHigh}`),
      ]),
      lineChart(hgb, 'hemoglobin'),
    );
    container.append(c);
  }

  // --- Pallor (redness) over time ---
  const pallor = state.pallor || [];
  if (pallor.length) {
    const ordered = [...pallor].sort(
      (a, b) => new Date(a.capturedAt) - new Date(b.capturedAt),
    );
    const vals = ordered.map((p) => Math.round(p.pallorScore * 100));
    container.append(el('div', { class: 'section-title' }, 'Pallor · redness'));
    const c = el('div', { class: 'card' });
    c.append(
      el('div', { class: 'chart-val' }, [
        el('span', { class: 'big' }, String(vals[vals.length - 1])),
        el('span', { class: 'unit' }, '/ 100'),
      ]),
    );
    const sp = sparkline(vals, { min: 0, max: 100, height: 88 });
    sp.style.color = 'var(--pink)';
    c.append(sp);
    container.append(c);
  }

  container.append(
    el(
      'p',
      { class: 'disclaimer' },
      'Weight and vitals trends fill in as you save more daily check-ins. Trends are for spotting change over time — share them with your care team.',
    ),
  );
}
