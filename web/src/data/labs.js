import { daysAgo } from '../lib/format.js';

/**
 * CBC-centric lab analytes, each with a reference range, LOINC code, and a
 * time series of draws tagged with the care team (`source`) they came from.
 * This "one timeline, many sources" shape is the app's core differentiator.
 */
export function buildLabs() {
  const draw = (collectedAt, value, source) => ({ collectedAt, value, source });
  return {
    hemoglobin: {
      label: 'Hemoglobin',
      unit: 'g/dL',
      refLow: 13.5,
      refHigh: 17.5,
      loinc: '718-7',
      series: [
        draw(daysAgo(64), 11.8, 'capital-health'),
        draw(daysAgo(50), 11.2, 'msk'),
        draw(daysAgo(37), 10.6, 'msk'),
        draw(daysAgo(28), 9.9, 'capital-health'),
        draw(daysAgo(15), 9.4, 'msk'),
        draw(daysAgo(3), 9.1, 'msk'),
      ],
    },
    platelets: {
      label: 'Platelets',
      unit: 'K/µL',
      refLow: 150,
      refHigh: 400,
      loinc: '777-3',
      series: [
        draw(daysAgo(64), 118, 'capital-health'),
        draw(daysAgo(50), 104, 'msk'),
        draw(daysAgo(37), 96, 'msk'),
        draw(daysAgo(28), 88, 'capital-health'),
        draw(daysAgo(15), 79, 'msk'),
        draw(daysAgo(3), 72, 'msk'),
      ],
    },
    wbc: {
      label: 'WBC',
      unit: 'K/µL',
      refLow: 4.0,
      refHigh: 11.0,
      loinc: '6690-2',
      series: [
        draw(daysAgo(64), 14.2, 'capital-health'),
        draw(daysAgo(50), 15.1, 'msk'),
        draw(daysAgo(37), 13.8, 'msk'),
        draw(daysAgo(28), 12.9, 'capital-health'),
        draw(daysAgo(15), 11.6, 'msk'),
        draw(daysAgo(3), 10.8, 'msk'),
      ],
    },
    anc: {
      label: 'ANC',
      unit: 'K/µL',
      refLow: 1.8,
      refHigh: 7.7,
      loinc: '751-8',
      series: [
        draw(daysAgo(50), 9.4, 'msk'),
        draw(daysAgo(37), 8.6, 'msk'),
        draw(daysAgo(28), 7.9, 'capital-health'),
        draw(daysAgo(15), 6.8, 'msk'),
        draw(daysAgo(3), 6.1, 'msk'),
      ],
    },
    blasts: {
      label: 'Peripheral blasts',
      unit: '%',
      refLow: 0,
      refHigh: 0,
      loinc: '709-7',
      series: [
        draw(daysAgo(50), 1, 'msk'),
        draw(daysAgo(37), 2, 'msk'),
        draw(daysAgo(15), 3, 'msk'),
        draw(daysAgo(3), 4, 'msk'),
      ],
    },
  };
}

/** Latest draw for an analyte within a labs map. */
export const latestDraw = (labs, analyte) => {
  const { series } = labs[analyte];
  return series[series.length - 1];
};

/** Clinical flag for a value against its analyte's reference range. */
export function labFlag(labs, analyte, value) {
  if (analyte === 'blasts') {
    if (value <= 0) return 'normal';
    return value >= 5 ? 'critical' : 'high';
  }
  const { refLow, refHigh } = labs[analyte];
  if (value < refLow) return 'low';
  if (value > refHigh) return 'high';
  return 'normal';
}

/** Human label for a flag. */
export const flagWord = (flag) =>
  ({ low: 'Low', high: 'High', critical: 'Critical', normal: 'In range' })[flag] || '';
