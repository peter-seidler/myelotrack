import { SOURCES } from '../data/sources.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Render an SVG line chart of a lab analyte's time series, with a shaded
 * reference band and points colored by their source institution.
 *
 * @param {object} analyte - a labs[key] entry: { unit, refLow, refHigh, series }
 * @param {string} analyteKey - e.g. 'hemoglobin' (drives special-casing)
 * @returns {SVGSVGElement}
 */
export function lineChart(analyte, analyteKey) {
  const W = 360;
  const H = 150;
  const padX = 8;
  const padY = 18;
  const points = analyte.series;
  const values = points.map((p) => p.value);
  const isBlasts = analyteKey === 'blasts';

  let min = Math.min(...values, analyte.refLow);
  let max = Math.max(...values, analyte.refHigh);
  if (isBlasts) {
    min = 0;
    max = Math.max(6, Math.max(...values) + 1);
  }
  const range = max - min || 1;
  const x = (i) => padX + (i / (points.length - 1)) * (W - padX * 2);
  const y = (value) => padY + (1 - (value - min) / range) * (H - padY * 2);

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'spark');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  const add = (tag, attrs) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const key in attrs) node.setAttribute(key, attrs[key]);
    svg.append(node);
    return node;
  };

  // Reference band (or a single "0" line for blasts, where any is abnormal).
  if (isBlasts) {
    add('line', {
      x1: 0,
      x2: W,
      y1: y(0),
      y2: y(0),
      stroke: 'rgba(48,209,88,0.35)',
      'stroke-width': 1,
      'stroke-dasharray': '4 4',
    });
  } else {
    add('rect', {
      x: 0,
      y: y(analyte.refHigh),
      width: W,
      height: Math.max(0, y(analyte.refLow) - y(analyte.refHigh)),
      fill: 'rgba(48,209,88,0.10)',
    });
    for (const rv of [analyte.refLow, analyte.refHigh]) {
      add('line', {
        x1: 0,
        x2: W,
        y1: y(rv),
        y2: y(rv),
        stroke: 'rgba(48,209,88,0.35)',
        'stroke-width': 1,
        'stroke-dasharray': '4 4',
      });
    }
  }

  // Trend line + gradient fill.
  const linePath = points
    .map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L ${x(points.length - 1)} ${H} L ${x(0)} ${H} Z`;
  const gradientId = `grad_${analyteKey}`;

  const defs = document.createElementNS(SVG_NS, 'defs');
  defs.innerHTML = `<linearGradient id="${gradientId}" x1="0" x2="0" y1="0" y2="1">
    <stop offset="0%" stop-color="rgba(10,132,255,0.28)"/>
    <stop offset="100%" stop-color="rgba(10,132,255,0)"/></linearGradient>`;
  svg.append(defs);

  add('path', { d: areaPath, fill: `url(#${gradientId})`, stroke: 'none' });
  add('path', {
    d: linePath,
    fill: 'none',
    stroke: 'var(--blue)',
    'stroke-width': 2.5,
    'stroke-linejoin': 'round',
    'stroke-linecap': 'round',
  });

  // Points, colored by source institution.
  points.forEach((p, i) => {
    add('circle', {
      cx: x(i),
      cy: y(p.value),
      r: 4.5,
      fill: SOURCES[p.source].color,
      stroke: '#000',
      'stroke-width': 2,
    });
  });

  // Emphasize the most recent value.
  const last = points.length - 1;
  add('circle', {
    cx: x(last),
    cy: y(points[last].value),
    r: 6.5,
    fill: '#fff',
    stroke: SOURCES[points[last].source].color,
    'stroke-width': 3,
  });

  return svg;
}
