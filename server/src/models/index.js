/**
 * Mongoose models — the MongoDB schema as code (see docs/database-schema.md).
 *
 * This module is only imported by the Mongo repository, so `mongoose` stays an
 * optional dependency that the default in-memory backend never loads. Every
 * collection is scoped to `userId`; a personal app has one real user per
 * deployment, but the field keeps a future multi-user version a non-rewrite.
 */
import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;
const opts = { timestamps: true };

const provenanceSchema = new Schema(
  {
    system: String,
    resourceType: String,
    externalId: String,
    diagnosticReportId: String,
    fetchedAt: Date,
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true },
    displayName: String,
    dob: Date,
    condition: { primary: String, icd10: [String], notes: String },
    careTeams: [{ key: String, name: String, mrn: String }],
  },
  opts,
);

const symptomEntrySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, index: true, required: true },
    date: { type: Date, required: true },
    items: { type: Map, of: Number },
    total: Number,
    weightKg: Number,
    note: String,
  },
  opts,
);
symptomEntrySchema.index({ userId: 1, date: -1 }, { unique: true });

const medicationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, index: true, required: true },
    name: { type: String, required: true },
    brand: String,
    dose: String,
    form: String,
    schedule: {
      timesPerDay: Number,
      times: [String],
      daysOfWeek: [Number],
    },
    purpose: String,
    prescriber: { careTeam: String, name: String },
    active: { type: Boolean, default: true },
    startedAt: Date,
    stoppedAt: Date,
  },
  opts,
);

const doseLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, index: true, required: true },
    medicationId: { type: Schema.Types.ObjectId, required: true },
    scheduledFor: { type: Date, required: true },
    status: {
      type: String,
      enum: ['taken', 'skipped', 'missed', 'late'],
      required: true,
    },
    takenAt: Date,
    note: String,
  },
  opts,
);
doseLogSchema.index({ userId: 1, scheduledFor: -1 });

const labResultSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, index: true, required: true },
    analyte: { type: String, required: true },
    loinc: String,
    value: Number,
    unit: String,
    refLow: Number,
    refHigh: Number,
    flag: { type: String, enum: ['low', 'high', 'critical', 'normal', null] },
    collectedAt: Date,
    reportedAt: Date,
    source: { type: String, enum: ['msk', 'capital-health', 'apple-health', 'manual'] },
    provenance: provenanceSchema,
  },
  opts,
);
labResultSchema.index({ userId: 1, analyte: 1, collectedAt: -1 });
// Idempotent upsert key for FHIR-sourced results. A partial index (not sparse)
// so uniqueness applies ONLY to docs that actually carry a string externalId —
// manually entered results (no externalId) are exempt and may repeat.
labResultSchema.index(
  { userId: 1, 'provenance.externalId': 1 },
  {
    unique: true,
    partialFilterExpression: { 'provenance.externalId': { $type: 'string' } },
  },
);

const pallorPhotoSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, index: true, required: true },
    capturedAt: Date,
    storage: {
      bucket: String,
      key: String,
      sha256: String,
      contentType: String,
      bytes: Number,
    },
    eye: { type: String, enum: ['left', 'right'] },
    pallorScore: Number,
    linkedHemoglobinId: Schema.Types.ObjectId,
    note: String,
  },
  opts,
);
pallorPhotoSchema.index({ userId: 1, capturedAt: -1 });

const integrationConnectionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, index: true, required: true },
    source: String,
    system: String,
    fhirBaseUrl: String,
    status: { type: String, enum: ['connected', 'expired', 'error', 'disconnected'] },
    scopes: [String],
    tokens: { accessTokenEnc: String, refreshTokenEnc: String, expiresAt: Date },
    lastSyncAt: Date,
    lastSyncError: String,
  },
  opts,
);
integrationConnectionSchema.index({ userId: 1, source: 1 }, { unique: true });

const auditLogSchema = new Schema({
  userId: Schema.Types.ObjectId,
  actor: String,
  action: String,
  route: String,
  status: Number,
  ip: String,
  userAgent: String,
  at: { type: Date, default: Date.now },
});
auditLogSchema.index({ userId: 1, at: -1 });

// Guard against redefining models on hot reload.
const define = (name, schema) => models[name] || model(name, schema);

export const User = define('User', userSchema);
export const SymptomEntry = define('SymptomEntry', symptomEntrySchema);
export const Medication = define('Medication', medicationSchema);
export const DoseLog = define('DoseLog', doseLogSchema);
export const LabResult = define('LabResult', labResultSchema);
export const PallorPhoto = define('PallorPhoto', pallorPhotoSchema);
export const IntegrationConnection = define(
  'IntegrationConnection',
  integrationConnectionSchema,
);
export const AuditLog = define('AuditLog', auditLogSchema);
