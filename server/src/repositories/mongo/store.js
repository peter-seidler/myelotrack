import mongoose from 'mongoose';
import {
  User,
  SymptomEntry,
  Medication,
  DoseLog,
  LabResult,
  PallorPhoto,
  IntegrationConnection,
  AuditLog,
} from '../../models/index.js';
import { computeFlag } from '../../data/seed.js';

/**
 * MongoDB repository (Mongoose). Implements the same interface as the memory
 * repository. Requires a running MongoDB; not exercised by CI, which uses the
 * memory backend. Enable with DATA_BACKEND=mongo and MONGODB_URI set.
 *
 * Single-tenant: resolves one singleton patient and scopes every query to it.
 */
export async function createMongoRepository(uri) {
  await mongoose.connect(uri);

  // Resolve (or create) the singleton patient this deployment serves.
  const user =
    (await User.findOne()) ||
    (await User.create({ email: 'patient@myelotrack.local', displayName: 'Patient' }));
  const userId = user._id;

  const lean = (q) => q.lean().exec();

  return {
    kind: 'mongo',

    listSymptoms({ from, to } = {}) {
      const filter = { userId };
      if (from || to) {
        filter.date = {};
        if (from) filter.date.$gte = new Date(from);
        if (to) filter.date.$lte = new Date(to);
      }
      return lean(SymptomEntry.find(filter).sort({ date: -1 }));
    },
    upsertSymptomEntry(entry) {
      const date = entry.date ? new Date(entry.date) : new Date();
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      return SymptomEntry.findOneAndUpdate(
        { userId, date: { $gte: start, $lt: end } },
        {
          userId,
          date,
          items: entry.items || {},
          total: entry.total ?? 0,
          weightKg: entry.weightKg ?? null,
          note: entry.note || '',
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();
    },

    listMedications() {
      return lean(Medication.find({ userId, active: true }));
    },
    async upsertMedications(meds = []) {
      if (!meds.length) return 0;
      const ops = meds.map((m) => {
        const externalId = m.provenance?.externalId;
        if (externalId) {
          return {
            updateOne: {
              filter: { userId, 'provenance.externalId': externalId },
              update: { $set: { ...m, userId } },
              upsert: true,
            },
          };
        }
        return { insertOne: { document: { ...m, userId } } };
      });
      await Medication.bulkWrite(ops, { ordered: false });
      return meds.length;
    },
    async logDose(medicationId, { status, scheduledFor, takenAt, note } = {}) {
      // Parity with the memory repo: unknown medication → null (controller 400s).
      if (!mongoose.isValidObjectId(medicationId)) return null;
      const med = await Medication.findOne({ _id: medicationId, userId }).lean();
      if (!med) return null;
      const doc = await DoseLog.create({
        userId,
        medicationId,
        status: status || 'taken',
        scheduledFor: scheduledFor ? new Date(scheduledFor) : new Date(),
        takenAt: status === 'taken' ? new Date(takenAt || Date.now()) : null,
        note: note || '',
      });
      return doc.toObject();
    },
    listDoseLogs() {
      return lean(DoseLog.find({ userId }).sort({ scheduledFor: -1 }));
    },

    listLabs({ analyte, source } = {}) {
      const filter = { userId };
      if (analyte) filter.analyte = analyte;
      if (source) filter.source = source;
      return lean(LabResult.find(filter).sort({ collectedAt: 1 }));
    },
    listAnalytes() {
      return LabResult.distinct('analyte', { userId });
    },
    async upsertLabResults(results = []) {
      if (!results.length) return 0;
      const ops = results.map((r) => {
        const externalId = r.provenance?.externalId;
        if (externalId) {
          return {
            updateOne: {
              filter: { userId, 'provenance.externalId': externalId },
              update: { $set: { ...r, userId } },
              upsert: true,
            },
          };
        }
        return { insertOne: { document: { ...r, userId } } };
      });
      await LabResult.bulkWrite(ops, { ordered: false });
      return results.length;
    },

    listPallor() {
      return lean(PallorPhoto.find({ userId }).sort({ capturedAt: -1 }));
    },
    async addPallorPhoto(entry) {
      const doc = await PallorPhoto.create({
        userId,
        capturedAt: entry.capturedAt ? new Date(entry.capturedAt) : new Date(),
        eye: entry.eye || 'right',
        pallorScore: entry.pallorScore ?? null,
        note: entry.note || '',
        storage: entry.storage || undefined,
      });
      return doc.toObject();
    },
    getPallorPhoto(id) {
      if (!mongoose.isValidObjectId(id)) return null;
      return PallorPhoto.findOne({ _id: id, userId }).lean();
    },

    integrationsStatus() {
      return lean(
        IntegrationConnection.find({ userId }).select('source system status lastSyncAt'),
      );
    },
    async touchIntegrationSync(source) {
      const doc = await IntegrationConnection.findOneAndUpdate(
        { userId, source },
        { lastSyncAt: new Date(), status: 'connected' },
        { new: true },
      ).lean();
      return (
        doc && { source: doc.source, status: doc.status, lastSyncAt: doc.lastSyncAt }
      );
    },
    getConnection(source) {
      return IntegrationConnection.findOne({ userId, source }).lean();
    },
    async updateConnection(source, patch) {
      return IntegrationConnection.findOneAndUpdate(
        { userId, source },
        { $set: { ...patch, userId, source } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();
    },

    recordAudit(entry) {
      // Fire-and-forget for the middleware (it does not await); returns the
      // promise so callers/tests that want to await the write can.
      return AuditLog.create({ userId, ...entry }).catch((err) =>
        console.error('[audit] write failed', err),
      );
    },
    async getAuditLog() {
      return lean(AuditLog.find({ userId }).sort({ at: -1 }));
    },

    computeFlag,
  };
}
