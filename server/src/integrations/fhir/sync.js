import { normalizeObservation } from './index.js';

/**
 * Fetch laboratory Observations for a patient from a FHIR R4 server, following
 * Bundle `next` links until exhausted (or maxPages). Injectable `fetchImpl` so
 * this is unit-tested without network.
 *
 * @returns {Promise<object[]>} raw FHIR Observation resources
 */
export async function fetchLabObservations(
  { fhirBaseUrl, patientId, accessToken, count = 100, maxPages = 20 },
  fetchImpl = fetch,
) {
  const start = new URL(`${fhirBaseUrl.replace(/\/$/, '')}/Observation`);
  start.searchParams.set('category', 'laboratory');
  if (patientId) start.searchParams.set('patient', patientId);
  start.searchParams.set('_count', String(count));

  const observations = [];
  let nextUrl = start.toString();
  let pages = 0;

  while (nextUrl && pages < maxPages) {
    const res = await fetchImpl(nextUrl, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/fhir+json',
      },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`FHIR ${res.status} for Observation: ${detail.slice(0, 200)}`);
    }
    const bundle = await res.json();
    for (const entry of bundle.entry || []) {
      if (entry.resource?.resourceType === 'Observation')
        observations.push(entry.resource);
    }
    const next = (bundle.link || []).find((l) => l.relation === 'next');
    nextUrl = next?.url || null;
    pages += 1;
  }
  return observations;
}

/** Normalize a list of FHIR Observations, dropping ones we don't map. */
export function normalizeObservations(observations, source) {
  return observations.map((o) => normalizeObservation(o, source)).filter(Boolean);
}

/**
 * Full sync for one connected source: fetch labs, normalize, and idempotently
 * upsert them (dedup by provenance.externalId — the partial unique index).
 * Live network via fetchImpl; the pieces above are unit-tested independently.
 *
 * @returns {Promise<{ source: string, fetched: number, upserted: number }>}
 */
export async function syncLabsForConnection(
  { repo, source, fhirBaseUrl, patientId, accessToken },
  fetchImpl = fetch,
) {
  const observations = await fetchLabObservations(
    { fhirBaseUrl, patientId, accessToken },
    fetchImpl,
  );
  const results = normalizeObservations(observations, source);
  const upserted = await repo.upsertLabResults(results);
  await repo.touchIntegrationSync(source);
  return { source, fetched: observations.length, upserted };
}
