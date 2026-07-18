import { computeFlag } from '../../data/seed.js';

/**
 * SMART on FHIR (Epic R4) integration scaffold.
 *
 * MSK and Capital Health both run Epic, so a single integration class points
 * at two base URLs registered as separate OAuth clients. The OAuth + fetch
 * layer needs real credentials (see docs/architecture.md → "Getting API
 * access") and is intentionally stubbed here; the *normalization* layer below
 * is pure and unit-tested so it's ready when the wire is connected.
 */

/** LOINC code → MyeloTrack canonical analyte key. */
export const LOINC_TO_ANALYTE = {
  '718-7': 'hemoglobin',
  '4544-3': 'hematocrit',
  '777-3': 'platelets',
  '6690-2': 'wbc',
  '751-8': 'anc',
  '709-7': 'blasts',
};

/**
 * Normalize a FHIR R4 `Observation` (laboratory) into MyeloTrack's canonical
 * lab-result shape. Returns null for observations we don't map.
 *
 * @param {object} obs - a FHIR Observation resource
 * @param {string} source - 'msk' | 'capital-health'
 * @returns {object|null}
 */
export function normalizeObservation(obs, source) {
  const coding = obs?.code?.coding?.find((c) => c.system?.includes('loinc'));
  const analyte = coding && LOINC_TO_ANALYTE[coding.code];
  if (!analyte || !obs.valueQuantity) return null;

  const value = obs.valueQuantity.value;
  const range = obs.referenceRange?.[0] || {};
  const refLow = range.low?.value;
  const refHigh = range.high?.value;

  return {
    analyte,
    loinc: coding.code,
    value,
    unit: obs.valueQuantity.unit || '',
    refLow,
    refHigh,
    flag: computeFlag(analyte, value),
    collectedAt: obs.effectiveDateTime ? new Date(obs.effectiveDateTime) : null,
    reportedAt: obs.issued ? new Date(obs.issued) : null,
    source,
    provenance: {
      system: 'epic-fhir-r4',
      resourceType: 'Observation',
      externalId: obs.id ? `Observation/${obs.id}` : undefined,
    },
  };
}

/**
 * Pull labs from a source and upsert normalized results. Not yet wired —
 * requires the SMART OAuth flow and per-source client registration.
 */
// eslint-disable-next-line no-unused-vars
export async function syncSource(source, repo) {
  throw new Error(
    `FHIR sync for "${source}" is not configured. Complete SMART OAuth setup ` +
      `(see docs/architecture.md) before enabling live sync.`,
  );
}
