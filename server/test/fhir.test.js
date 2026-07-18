import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeObservation,
  LOINC_TO_ANALYTE,
} from '../src/integrations/fhir/index.js';

const hemoglobinObservation = {
  resourceType: 'Observation',
  id: 'abc123',
  status: 'final',
  code: {
    coding: [{ system: 'http://loinc.org', code: '718-7', display: 'Hemoglobin' }],
  },
  valueQuantity: { value: 9.4, unit: 'g/dL' },
  referenceRange: [{ low: { value: 13.5 }, high: { value: 17.5 } }],
  effectiveDateTime: '2026-07-03T13:20:00Z',
  issued: '2026-07-03T18:02:00Z',
};

test('normalizeObservation maps a LOINC-coded lab into canonical shape', () => {
  const result = normalizeObservation(hemoglobinObservation, 'msk');
  assert.equal(result.analyte, 'hemoglobin');
  assert.equal(result.value, 9.4);
  assert.equal(result.unit, 'g/dL');
  assert.equal(result.flag, 'low');
  assert.equal(result.source, 'msk');
  assert.equal(result.provenance.externalId, 'Observation/abc123');
  assert.ok(result.collectedAt instanceof Date);
});

test('normalizeObservation returns null for unmapped codes', () => {
  const obs = {
    code: { coding: [{ system: 'http://loinc.org', code: '00000-0' }] },
    valueQuantity: { value: 1 },
  };
  assert.equal(normalizeObservation(obs, 'msk'), null);
});

test('normalizeObservation returns null without a value', () => {
  const obs = { code: { coding: [{ system: 'http://loinc.org', code: '718-7' }] } };
  assert.equal(normalizeObservation(obs, 'msk'), null);
});

test('LOINC map covers the core CBC analytes', () => {
  for (const code of ['718-7', '777-3', '6690-2', '751-8', '709-7']) {
    assert.ok(LOINC_TO_ANALYTE[code], `missing mapping for ${code}`);
  }
});
