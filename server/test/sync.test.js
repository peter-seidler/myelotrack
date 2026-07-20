import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchLabObservations,
  normalizeObservations,
  syncLabsForConnection,
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
