import { pallorSwatch } from '../lib/pallor-image.js';
import { API_BASE } from '../config.js';

/**
 * Map API response shapes onto the client store's shapes. The API returns
 * normalized, schema-flat records; the views want a few view-friendly shapes
 * (labs grouped by analyte, meds with `id`/`times`, pallor with a display
 * image). Keeping the translation here means the views never learn the wire
 * format.
 */

// Presentation labels for known analytes (the API carries units/ranges, not
// display names). Unknown analytes fall back to their key.
const ANALYTE_LABELS = {
  hemoglobin: 'Hemoglobin',
  hematocrit: 'Hematocrit',
  platelets: 'Platelets',
  wbc: 'WBC',
  anc: 'ANC',
  blasts: 'Peripheral blasts',
};

/** Group a flat array of lab results into the `{ analyte: {…, series} }` shape. */
export function labsToStore(apiLabs) {
  const byAnalyte = {};
  for (const row of apiLabs) {
    const group = (byAnalyte[row.analyte] ||= {
      label: ANALYTE_LABELS[row.analyte] || row.analyte,
      unit: row.unit,
      refLow: row.refLow,
      refHigh: row.refHigh,
      loinc: row.loinc,
      series: [],
    });
    group.series.push({
      collectedAt: new Date(row.collectedAt),
      value: row.value,
      source: row.source,
    });
  }
  for (const group of Object.values(byAnalyte)) {
    group.series.sort((a, b) => a.collectedAt - b.collectedAt);
  }
  return byAnalyte;
}

/** Map API medications to the store shape (`_id` → `id`, flatten schedule). */
export function medsToStore(apiMeds) {
  return apiMeds.map((m) => ({
    id: m._id,
    name: m.name,
    brand: m.brand || '',
    dose: m.dose || '',
    purpose: m.purpose || '',
    times: m.schedule?.times || [],
  }));
}

/**
 * Map API pallor readings to the store shape. Readings with a stored image use
 * the decrypted-image endpoint; metadata-only ones fall back to a synthesized
 * swatch so the gallery still renders.
 */
export function pallorToStore(apiPallor) {
  return apiPallor.map((p) => ({
    id: p._id,
    capturedAt: new Date(p.capturedAt),
    eye: p.eye || 'right',
    pallorScore: p.pallorScore,
    img: p.storage?.key
      ? `${API_BASE}/api/v1/pallor/${p._id}/image`
      : pallorSwatch(p.pallorScore ?? 0.42),
  }));
}

/** Recent daily totals (oldest→newest) for the Today trend delta. */
export function symptomHistoryToStore(apiSymptoms) {
  return [...apiSymptoms]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((e) => e.total ?? 0);
}
