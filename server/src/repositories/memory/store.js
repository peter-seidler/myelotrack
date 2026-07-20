import { buildSeed, computeFlag } from '../../data/seed.js';

/**
 * In-memory repository. Implements the data-access surface the controllers
 * need, backed by seeded arrays. This is the default backend so the app runs
 * with zero external dependencies; the Mongo repository implements the same
 * interface (see repositories/index.js).
 */
export function createMemoryRepository() {
  const db = buildSeed();
  // WebAuthn state for the singleton user (passkey credentials + the
  // in-flight registration/authentication challenge).
  const auth = { challenge: null, credentials: [] };

  const inRange = (date, from, to) => {
    const t = new Date(date).getTime();
    if (from && t < new Date(from).getTime()) return false;
    if (to && t > new Date(to).getTime()) return false;
    return true;
  };

  return {
    kind: 'memory',

    // --- Symptoms ---
    listSymptoms({ from, to } = {}) {
      return db.symptomEntries
        .filter((e) => inRange(e.date, from, to))
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    },
    upsertSymptomEntry(entry) {
      const date = entry.date ? new Date(entry.date) : new Date();
      const dayKey = date.toISOString().slice(0, 10);
      const existing = db.symptomEntries.find(
        (e) => new Date(e.date).toISOString().slice(0, 10) === dayKey,
      );
      const record = {
        _id: existing?._id || `s_${Date.now()}`,
        date,
        items: entry.items || {},
        total: entry.total ?? 0,
        weightKg: entry.weightKg ?? null,
        note: entry.note || '',
      };
      if (existing) Object.assign(existing, record);
      else db.symptomEntries.push(record);
      return record;
    },

    // --- Medications & doses ---
    listMedications() {
      return db.medications.filter((m) => m.active);
    },
    /**
     * Idempotently insert/update medications from a sync. Dedup by
     * provenance.externalId (FHIR-sourced); others are appended. Returns count.
     */
    upsertMedications(meds = []) {
      for (const m of meds) {
        const externalId = m.provenance?.externalId;
        const existing = externalId
          ? db.medications.find((x) => x.provenance?.externalId === externalId)
          : null;
        if (existing) Object.assign(existing, m);
        else
          db.medications.push({
            _id: m._id || `med_${db.medications.length}_${externalId || 'm'}`,
            ...m,
          });
      }
      return meds.length;
    },
    logDose(medicationId, { status, scheduledFor, takenAt, note } = {}) {
      const med = db.medications.find((m) => m._id === medicationId);
      if (!med) return null;
      const record = {
        _id: `dose_${Date.now()}`,
        medicationId,
        status: status || 'taken',
        scheduledFor: scheduledFor ? new Date(scheduledFor) : new Date(),
        takenAt: status === 'taken' ? new Date(takenAt || Date.now()) : null,
        note: note || '',
      };
      db.doseLogs.push(record);
      return record;
    },
    listDoseLogs() {
      return [...db.doseLogs].sort(
        (a, b) => new Date(b.scheduledFor) - new Date(a.scheduledFor),
      );
    },

    // --- Labs ---
    listLabs({ analyte, source } = {}) {
      return db.labResults
        .filter(
          (l) => (!analyte || l.analyte === analyte) && (!source || l.source === source),
        )
        .sort((a, b) => new Date(a.collectedAt) - new Date(b.collectedAt));
    },
    listAnalytes() {
      return [...new Set(db.labResults.map((l) => l.analyte))];
    },
    /**
     * Idempotently insert/update lab results. Dedup by provenance.externalId
     * (FHIR-sourced) so re-syncs don't duplicate; results without one are
     * always inserted. Returns the number processed.
     */
    upsertLabResults(results = []) {
      for (const r of results) {
        const externalId = r.provenance?.externalId;
        const existing = externalId
          ? db.labResults.find((l) => l.provenance?.externalId === externalId)
          : null;
        if (existing) {
          Object.assign(existing, r);
        } else {
          db.labResults.push({
            _id: r._id || `lab_${db.labResults.length}_${externalId || 'm'}`,
            ...r,
          });
        }
      }
      return results.length;
    },

    // --- Pallor ---
    listPallor() {
      return [...db.pallorPhotos].sort(
        (a, b) => new Date(b.capturedAt) - new Date(a.capturedAt),
      );
    },
    addPallorPhoto(entry) {
      const record = {
        _id: `p_${Date.now()}_${db.pallorPhotos.length}`,
        capturedAt: entry.capturedAt ? new Date(entry.capturedAt) : new Date(),
        eye: entry.eye || 'right',
        pallorScore: entry.pallorScore ?? null,
        note: entry.note || '',
        storage: entry.storage || null,
      };
      db.pallorPhotos.unshift(record);
      return record;
    },
    getPallorPhoto(id) {
      return db.pallorPhotos.find((p) => p._id === id) || null;
    },

    // --- Integrations ---
    integrationsStatus() {
      return db.integrationConnections.map((c) => ({
        source: c.source,
        system: c.system,
        status: c.status,
        lastSyncAt: c.lastSyncAt,
      }));
    },
    touchIntegrationSync(source) {
      const conn = db.integrationConnections.find((c) => c.source === source);
      if (!conn) return null;
      conn.lastSyncAt = new Date();
      conn.status = 'connected';
      return { source: conn.source, status: conn.status, lastSyncAt: conn.lastSyncAt };
    },
    getConnection(source) {
      return db.integrationConnections.find((c) => c.source === source) || null;
    },
    updateConnection(source, patch) {
      let conn = db.integrationConnections.find((c) => c.source === source);
      if (!conn) {
        conn = { source };
        db.integrationConnections.push(conn);
      }
      Object.assign(conn, patch);
      return conn;
    },

    // --- Auth (passkeys) ---
    setAuthChallenge(challenge) {
      auth.challenge = challenge;
    },
    getAuthChallenge() {
      return auth.challenge;
    },
    listCredentials() {
      return auth.credentials;
    },
    getCredential(id) {
      return auth.credentials.find((c) => c.id === id) || null;
    },
    addCredential(cred) {
      auth.credentials.push(cred);
      return cred;
    },
    updateCredentialCounter(id, counter) {
      const cred = auth.credentials.find((c) => c.id === id);
      if (cred) cred.counter = counter;
    },

    // --- Audit ---
    recordAudit(entry) {
      db.auditLog.push(entry);
    },
    getAuditLog() {
      return db.auditLog;
    },

    // Exposed for the flag helper so controllers stay thin.
    computeFlag,
  };
}
