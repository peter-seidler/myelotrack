import { API_BASE } from '../config.js';

/**
 * Thin fetch wrapper for the MyeloTrack API. Every endpoint wraps its payload
 * in `{ data }` (see server), so this unwraps and returns `data`. Throws on any
 * non-2xx so callers can fall back or surface the failure.
 */
async function request(path, options = {}) {
  // FormData sets its own multipart content-type (with boundary); don't override.
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(isForm ? {} : { 'content-type': 'application/json' }),
      ...options.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`${options.method || 'GET'} ${path} → ${res.status}`);
  }
  if (res.status === 204) return null;
  const body = await res.json();
  return body.data;
}

export const api = {
  // Reads
  getMedications: () => request('/api/v1/medications'),
  getLabs: () => request('/api/v1/labs'),
  getSymptoms: () => request('/api/v1/symptoms'),
  getPallor: () => request('/api/v1/pallor'),
  getIntegrationsStatus: () => request('/api/v1/integrations/status'),

  // Writes
  createSymptom: (body) =>
    request('/api/v1/symptoms', { method: 'POST', body: JSON.stringify(body) }),
  logDose: (medicationId, body) =>
    request(`/api/v1/medications/${medicationId}/doses`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  createPallor: (body) =>
    request('/api/v1/pallor', { method: 'POST', body: JSON.stringify(body) }),
  uploadPallor: (formData) =>
    request('/api/v1/pallor', { method: 'POST', body: formData }),
};
