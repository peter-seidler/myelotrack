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

const RXNORM_SYSTEM = 'rxnorm';

/**
 * Normalize a FHIR R4 `MedicationRequest` into MyeloTrack's medication shape.
 * Returns null if there's no usable name.
 *
 * @param {object} mr - a FHIR MedicationRequest resource
 * @param {string} source - 'msk' | 'capital-health'
 * @returns {object|null}
 */
export function normalizeMedicationRequest(mr, source) {
  const concept = mr?.medicationCodeableConcept;
  const coding = concept?.coding?.[0];
  const name = concept?.text || coding?.display;
  if (!name) return null;

  const dosage = mr.dosageInstruction?.[0] || {};
  // Epic populates the human-readable dosage text; times may be in timing.
  const times = (dosage.timing?.repeat?.timeOfDay || [])
    .map((t) => String(t).slice(0, 5)) // "08:00:00" → "08:00"
    .filter(Boolean);
  const rxnorm = concept?.coding?.find((c) =>
    c.system?.toLowerCase().includes(RXNORM_SYSTEM),
  )?.code;

  return {
    name,
    brand: '',
    dose: dosage.text || '',
    purpose: mr.reasonCode?.[0]?.text || '',
    rxnorm,
    schedule: { times },
    active: mr.status === 'active',
    source,
    provenance: {
      system: 'epic-fhir-r4',
      resourceType: 'MedicationRequest',
      externalId: mr.id ? `MedicationRequest/${mr.id}` : undefined,
    },
  };
}

// SMART auth helpers live in ./smart.js; the fetch + normalize + upsert
// pipeline lives in ./sync.js (both fetch-injectable and unit-tested).
