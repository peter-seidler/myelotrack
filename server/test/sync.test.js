import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchLabObservations,
  normalizeObservations,
  syncLabsForConnection,
  normalizeMedicationRequests,
  syncMedicationsForConnection,
  syncForConnection,
} from '../src/integrations/fhir/sync.js';
import { createMemoryRepository } from '../src/repositories/memory/store.js';

const obs = (id, code, value) => ({
  resourceType: 'Observation',
  id,
  code: { coding: [{ system: 'http://loinc.org', code }] },
  valueQuantity: { value, unit: 'g/dL' },
  effectiveDateTime: '2026-07-10T00:00:00Z',
});

/** A fake fetch serving a 2-page Observation bundle, capturing auth headers. */
function pagedFetch() {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, auth: opts.headers.authorization });
    if (!url.includes('page=2')) {
      return {
        ok: true,
        json: async () => ({
          resourceType: 'Bundle',
          entry: [{ resource: obs('a', '718-7', 9.4) }],
          link: [
            {
              relation: 'next',
              url: 'https://fhir.example.org/api/FHIR/R4/Observation?page=2',
            },
          ],
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        resourceType: 'Bundle',
        entry: [
          { resource: obs('b', '777-3', 88) },
          { resource: obs('c', '00000-0', 1) }, // unmapped → dropped on normalize
        ],
        link: [],
      }),
    };
  };
  return { fetchImpl, calls };
}

test('fetchLabObservations follows Bundle next links and sends the bearer token', async () => {
  const { fetchImpl, calls } = pagedFetch();
  const observations = await fetchLabObservations(
    {
      fhirBaseUrl: 'https://fhir.example.org/api/FHIR/R4',
      patientId: 'Patient/42',
      accessToken: 'AT',
    },
    fetchImpl,
  );
  assert.equal(observations.length, 3); // 1 + 2 across two pages
  assert.equal(calls.length, 2);
  assert.equal(calls[0].auth, 'Bearer AT');
  assert.match(calls[0].url, /category=laboratory/);
  assert.match(calls[0].url, /patient=Patient/);
});

test('normalizeObservations maps known codes and drops the rest', () => {
  const results = normalizeObservations(
    [obs('a', '718-7', 9.4), obs('c', '00000-0', 1)],
    'msk',
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].analyte, 'hemoglobin');
  assert.equal(results[0].source, 'msk');
  assert.equal(results[0].provenance.externalId, 'Observation/a');
});

test('syncLabsForConnection normalizes, upserts, and is idempotent', async () => {
  const repo = createMemoryRepository();
  const before = repo.listLabs().length;

  const run = () =>
    syncLabsForConnection(
      {
        repo,
        source: 'msk',
        fhirBaseUrl: 'https://fhir.example.org/api/FHIR/R4',
        patientId: 'Patient/42',
        accessToken: 'AT',
      },
      pagedFetch().fetchImpl,
    );

  const first = await run();
  assert.equal(first.fetched, 3);
  assert.equal(first.upserted, 2); // hemoglobin + platelets (blast-code dropped)
  const afterFirst = repo.listLabs().length;
  assert.equal(afterFirst, before + 2);

  // Re-syncing the same externalIds must not duplicate.
  await run();
  assert.equal(repo.listLabs().length, afterFirst);
});

const medReq = (id, text, status = 'active') => ({
  resourceType: 'MedicationRequest',
  id,
  status,
  medicationCodeableConcept: {
    text,
    coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '1234' }],
  },
  dosageInstruction: [
    {
      text: '20 mg twice daily',
      timing: { repeat: { timeOfDay: ['08:00:00', '20:00:00'] } },
    },
  ],
});

function medFetch() {
  const fetchImpl = async (url, opts) => {
    if (!url.includes('/MedicationRequest')) throw new Error('unexpected ' + url);
    return {
      ok: true,
      json: async () => ({
        resourceType: 'Bundle',
        entry: [
          { resource: medReq('mr-1', 'Ruxolitinib 20 mg') },
          {
            resource: { resourceType: 'MedicationRequest', id: 'mr-2', status: 'active' },
          }, // no name → dropped
        ],
        link: [],
      }),
      headers: opts.headers,
    };
  };
  return fetchImpl;
}

test('normalizeMedicationRequests maps name/dose/times and drops nameless', () => {
  const meds = normalizeMedicationRequests(
    [medReq('mr-1', 'Ruxolitinib 20 mg'), { resourceType: 'MedicationRequest', id: 'x' }],
    'msk',
  );
  assert.equal(meds.length, 1);
  assert.equal(meds[0].name, 'Ruxolitinib 20 mg');
  assert.equal(meds[0].dose, '20 mg twice daily');
  assert.deepEqual(meds[0].schedule.times, ['08:00', '20:00']);
  assert.equal(meds[0].active, true);
  assert.equal(meds[0].provenance.externalId, 'MedicationRequest/mr-1');
});

test('syncMedicationsForConnection upserts idempotently', async () => {
  const repo = createMemoryRepository();
  const before = repo.listMedications().length;
  const args = {
    repo,
    source: 'msk',
    fhirBaseUrl: 'https://fhir.example.org/api/FHIR/R4',
    patientId: 'Patient/1',
    accessToken: 'AT',
  };
  const first = await syncMedicationsForConnection(args, medFetch());
  assert.equal(first.fetched, 2);
  assert.equal(first.upserted, 1); // nameless dropped
  const afterFirst = repo.listMedications().length;
  assert.equal(afterFirst, before + 1);
  await syncMedicationsForConnection(args, medFetch());
  assert.equal(repo.listMedications().length, afterFirst); // no duplicate
});

test('syncForConnection runs labs + medications and stamps the sync', async () => {
  const repo = createMemoryRepository();
  const combinedFetch = async (url, opts) => {
    if (url.includes('/Observation')) {
      return {
        ok: true,
        json: async () => ({
          resourceType: 'Bundle',
          entry: [{ resource: obs('h1', '718-7', 9) }],
          link: [],
        }),
        headers: opts.headers,
      };
    }
    return medFetch()(url, opts);
  };
  const result = await syncForConnection(
    {
      repo,
      source: 'msk',
      fhirBaseUrl: 'https://fhir.example.org/api/FHIR/R4',
      patientId: 'P',
      accessToken: 'AT',
    },
    combinedFetch,
  );
  assert.equal(result.source, 'msk');
  assert.equal(result.labs.upserted, 1);
  assert.equal(result.medications.upserted, 1);
});
