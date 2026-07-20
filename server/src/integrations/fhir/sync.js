import { normalizeObservation, normalizeMedicationRequest } from './index.js';

/**
 * Fetch all resources of a type for a patient from a FHIR R4 server, following
 * Bundle `next` links until exhausted (or maxPages). Injectable `fetchImpl` so
 * callers are unit-tested without network.
 *
 * @returns {Promise<object[]>} raw FHIR resources of `resourceType`
 */
async function fetchAllResources(
  {
    fhirBaseUrl,
    resourceType,
    patientId,
    accessToken,
    params = {},
    count = 100,
    maxPages = 20,
  },
  fetchImpl = fetch,
) {
  const start = new URL(`${fhirBaseUrl.replace(/\/$/, '')}/${resourceType}`);
  for (const [k, v] of Object.entries(params)) start.searchParams.set(k, v);
  if (patientId) start.searchParams.set('patient', patientId);
  start.searchParams.set('_count', String(count));

  const resources = [];
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
      throw new Error(`FHIR ${res.status} for ${resourceType}: ${detail.slice(0, 200)}`);
    }
    const bundle = await res.json();
    for (const entry of bundle.entry || []) {
      if (entry.resource?.resourceType === resourceType) resources.push(entry.resource);
    }
    nextUrl = (bundle.link || []).find((l) => l.relation === 'next')?.url || null;
    pages += 1;
  }
  return resources;
}

/** Fetch laboratory Observations for a patient. */
export function fetchLabObservations(
  { fhirBaseUrl, patientId, accessToken },
  fetchImpl = fetch,
) {
  return fetchAllResources(
    {
      fhirBaseUrl,
      resourceType: 'Observation',
      patientId,
      accessToken,
      params: { category: 'laboratory' },
    },
    fetchImpl,
  );
}

/** Fetch MedicationRequests for a patient. */
export function fetchMedicationRequests(
  { fhirBaseUrl, patientId, accessToken },
  fetchImpl = fetch,
) {
  return fetchAllResources(
    { fhirBaseUrl, resourceType: 'MedicationRequest', patientId, accessToken },
    fetchImpl,
  );
}

/** Normalize a list of FHIR Observations, dropping ones we don't map. */
export function normalizeObservations(observations, source) {
  return observations.map((o) => normalizeObservation(o, source)).filter(Boolean);
}

/** Normalize a list of FHIR MedicationRequests, dropping ones without a name. */
export function normalizeMedicationRequests(requests, source) {
  return requests.map((m) => normalizeMedicationRequest(m, source)).filter(Boolean);
}

/**
 * Fetch labs, normalize, and idempotently upsert (dedup by
 * provenance.externalId). Kept as its own export for focused testing.
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
  return { fetched: observations.length, upserted };
}

/** Fetch MedicationRequests, normalize, and idempotently upsert. */
export async function syncMedicationsForConnection(
  { repo, source, fhirBaseUrl, patientId, accessToken },
  fetchImpl = fetch,
) {
  const requests = await fetchMedicationRequests(
    { fhirBaseUrl, patientId, accessToken },
    fetchImpl,
  );
  const meds = normalizeMedicationRequests(requests, source);
  const upserted = await repo.upsertMedications(meds);
  return { fetched: requests.length, upserted };
}

/**
 * Full sync for one connected source: labs + medications, then stamp
 * lastSyncAt. Live network via fetchImpl; the pieces above are unit-tested.
 *
 * @returns {Promise<{ source, labs, medications }>}
 */
export async function syncForConnection(args, fetchImpl = fetch) {
  const labs = await syncLabsForConnection(args, fetchImpl);
  const medications = await syncMedicationsForConnection(args, fetchImpl);
  await args.repo.touchIntegrationSync(args.source);
  return { source: args.source, labs, medications };
}
