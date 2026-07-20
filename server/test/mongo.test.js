import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { createMongoRepository } from '../src/repositories/mongo/store.js';
import {
  User,
  Medication,
  LabResult,
  IntegrationConnection,
} from '../src/models/index.js';

// Runs only when a MongoDB is available (CI provides one via a service
// container). Locally, with no MONGODB_TEST_URI set, the whole suite is
// skipped so `npm test` stays green without a database.
const uri = process.env.MONGODB_TEST_URI;

describe('mongo repository', { skip: uri ? false : 'MONGODB_TEST_URI not set' }, () => {
  let repo;
  let userId;

  before(async () => {
    // Start from a clean DB, then let the repo create its singleton user.
    await mongoose.connect(uri);
    await mongoose.connection.dropDatabase();
    repo = await createMongoRepository(uri);
    userId = (await User.findOne())._id;
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('reports its kind', () => {
    assert.equal(repo.kind, 'mongo');
  });

  it('upserts a symptom entry and reads it back', async () => {
    await repo.upsertSymptomEntry({
      items: { fatigue: 5, bonePain: 4 },
      total: 9,
      weightKg: 71,
    });
    const entries = await repo.listSymptoms();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].total, 9);
    assert.equal(entries[0].weightKg, 71);
  });

  it('upsert replaces the same-day entry rather than duplicating', async () => {
    await repo.upsertSymptomEntry({ items: { fatigue: 8 }, total: 8 });
    const entries = await repo.listSymptoms();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].total, 8);
  });

  it('filters and sorts lab results by analyte and source', async () => {
    await LabResult.insertMany([
      {
        userId,
        analyte: 'hemoglobin',
        value: 9.4,
        source: 'msk',
        collectedAt: new Date('2026-07-01'),
      },
      {
        userId,
        analyte: 'hemoglobin',
        value: 9.1,
        source: 'capital-health',
        collectedAt: new Date('2026-07-10'),
      },
      {
        userId,
        analyte: 'platelets',
        value: 72,
        source: 'msk',
        collectedAt: new Date('2026-07-10'),
      },
    ]);
    const hgb = await repo.listLabs({ analyte: 'hemoglobin' });
    assert.equal(hgb.length, 2);
    assert.ok(
      new Date(hgb[0].collectedAt) < new Date(hgb[1].collectedAt),
      'ascending by date',
    );

    const bySource = await repo.listLabs({ source: 'capital-health' });
    assert.ok(bySource.every((r) => r.source === 'capital-health'));

    const analytes = await repo.listAnalytes();
    assert.ok(analytes.includes('hemoglobin') && analytes.includes('platelets'));
  });

  it('logs a dose for a real medication and rejects an unknown one', async () => {
    const med = await Medication.create({
      userId,
      name: 'Ruxolitinib',
      dose: '20 mg',
      active: true,
    });
    const dose = await repo.logDose(String(med._id), { status: 'taken' });
    assert.equal(dose.status, 'taken');
    assert.equal(String(dose.medicationId), String(med._id));

    assert.equal(
      await repo.logDose(String(new mongoose.Types.ObjectId()), { status: 'taken' }),
      null,
    );
    assert.equal(await repo.logDose('not-an-id', { status: 'taken' }), null);
  });

  it('adds a pallor reading and reads it back', async () => {
    await repo.addPallorPhoto({ pallorScore: 0.4, eye: 'right' });
    const pallor = await repo.listPallor();
    assert.equal(pallor.length, 1);
    assert.equal(pallor[0].pallorScore, 0.4);
  });

  it('touches an integration connection', async () => {
    await IntegrationConnection.create({
      userId,
      source: 'msk',
      system: 'epic-fhir-r4',
      status: 'expired',
    });
    const result = await repo.touchIntegrationSync('msk');
    assert.equal(result.status, 'connected');
    assert.ok(result.lastSyncAt instanceof Date);
    assert.equal(await repo.touchIntegrationSync('capital-health'), null);

    const status = await repo.integrationsStatus();
    assert.ok(status.some((c) => c.source === 'msk' && c.status === 'connected'));
  });

  it('writes and reads the audit log', async () => {
    await repo.recordAudit({
      actor: 'user',
      action: 'read',
      route: 'GET /api/v1/labs',
      at: new Date(),
    });
    const log = await repo.getAuditLog();
    assert.ok(log.length >= 1);
    assert.equal(log[0].route, 'GET /api/v1/labs');
  });
});
