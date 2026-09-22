const assert = require("node:assert/strict");
const test = require("node:test");
const { planLegacyDisplayMigration } = require("../scripts/f09b-legacy-display-migration.cjs");
const fs = require("node:fs");

const center = { cashiers: { c1: { cashierId: "cashier-1", name: "Caja 1" } } };
const caseRecord = (caseId, publicCode, currentState = "called_to_window", extra = {}) => ({
  caseId, centerId: "center-a", publicCode, currentState, isPriority: false,
  assignedWindowNumber: 1, cashierId: "cashier-1", updatedAt: 10, ...extra,
});
const projection = (publicCode, extra = {}) => ({
  publicCode, isPriority: false, status: "legacy", destination: "Ventanilla 1", updatedAt: 1, ...extra,
});
const fixture = ({ displays, cases, secondCenter } = {}) => ({
  displays: { "center-a": { "2026-09-20": displays || {} }, ...(secondCenter?.displays || {}) },
  days: { "center-a": { "2026-09-20": { cases: cases || {} } }, ...(secondCenter?.days || {}) },
  centers: { "center-a": center, ...(secondCenter?.centers || {}) },
});

test("active legacy root becomes sanitized canonical and removes the legacy key", () => {
  const input = fixture({ displays: { internal1: projection("V1-01") }, cases: { internal1: caseRecord("internal1", "V1-01") } });
  const plan = planLegacyDisplayMigration(input);
  assert.equal(plan.safeForMigration, true);
  assert.deepEqual(plan.batches[0].updates, {
    internal1: null,
    "V1-01": { publicCode: "V1-01", isPriority: false, status: "Diríjase a Ventanilla 1", destination: "Ventanilla 1", updatedAt: 10 },
  });
  assert.equal(plan.summary.canonicalRecordsToCreate, 1);
});

test("terminal stale legacy is deleted and never resurrected", () => {
  const plan = planLegacyDisplayMigration(fixture({
    displays: { internal1: projection("V1-01") }, cases: { internal1: caseRecord("internal1", "V1-01", "completed") },
  }));
  assert.deepEqual(plan.batches[0].updates, { internal1: null });
  assert.equal(plan.summary.staleLegacyToDelete, 1);
  assert.equal(plan.summary.canonicalRecordsToCreate, 0);
});

test("compatibility projection is atomically converted and removed", () => {
  const plan = planLegacyDisplayMigration(fixture({
    displays: { cases: { internal1: projection("V1-01") } }, cases: { internal1: caseRecord("internal1", "V1-01", "in_document_validation") },
  }));
  assert.equal(plan.batches[0].updates["cases/internal1"], null);
  assert.equal(plan.batches[0].updates["V1-01"].status, "Atención en ventanilla");
  assert.equal(plan.summary.compatibilityToRemove, 1);
});

test("legacy root plus compatibility duplicate creates one canonical record", () => {
  const plan = planLegacyDisplayMigration(fixture({
    displays: { internal1: projection("V1-01"), cases: { internal1: projection("V1-01") } },
    cases: { internal1: caseRecord("internal1", "V1-01") },
  }));
  assert.equal(plan.summary.duplicate, 1);
  assert.equal(plan.summary.canonicalRecordsToCreate, 1);
  assert.equal(plan.summary.legacyRecordsToDelete, 2);
});

test("legacy plus canonical duplicate keeps one authoritative canonical", () => {
  const desired = projection("V1-01", { status: "Diríjase a Ventanilla 1", updatedAt: 10 });
  const plan = planLegacyDisplayMigration(fixture({
    displays: { internal1: projection("V1-01"), "V1-01": desired },
    cases: { internal1: caseRecord("internal1", "V1-01") },
  }));
  assert.deepEqual(plan.batches[0].updates, { internal1: null });
  assert.equal(plan.summary.duplicate, 1);
});

test("canonical-only record requires no migration", () => {
  const plan = planLegacyDisplayMigration(fixture({
    displays: { "V1-01": projection("V1-01", { status: "Diríjase a Ventanilla 1", updatedAt: 10 }) },
    cases: { internal1: caseRecord("internal1", "V1-01") },
  }));
  assert.equal(plan.batches.length, 0);
  assert.equal(plan.summary.canonical, 1);
});

test("invalid orphan is reported and receives no unsafe mutation", () => {
  const plan = planLegacyDisplayMigration(fixture({ displays: { missing: projection("V1-99") }, cases: {} }));
  assert.equal(plan.safeForMigration, false);
  assert.equal(plan.summary.invalidOrphan, 1);
  assert.equal(plan.batches.length, 0);
});

test("publicCode collision is a hard stop", () => {
  const plan = planLegacyDisplayMigration(fixture({
    displays: { internal1: projection("V1-01") },
    cases: { internal1: caseRecord("internal1", "V1-01"), internal2: caseRecord("internal2", "V1-01") },
  }));
  assert.equal(plan.safeForMigration, false);
  assert.equal(plan.summary.publicCodeCollisions, 1);
});

test("multiple days and centers produce bounded independent batches", () => {
  const input = fixture({
    displays: { internal1: projection("V1-01") }, cases: { internal1: caseRecord("internal1", "V1-01") },
    secondCenter: {
      displays: { "center-b": { "2026-09-21": { internal2: projection("V2-01") } } },
      days: { "center-b": { "2026-09-21": { cases: { internal2: { ...caseRecord("internal2", "V2-01"), centerId: "center-b" } } } } },
      centers: { "center-b": center },
    },
  });
  const plan = planLegacyDisplayMigration(input);
  assert.equal(plan.batches.length, 2);
  assert.equal(plan.summary.legacyDays, 2);
});

test("rerun after applying a successful plan is a no-op", () => {
  const initial = fixture({ displays: { internal1: projection("V1-01") }, cases: { internal1: caseRecord("internal1", "V1-01") } });
  const first = planLegacyDisplayMigration(initial);
  const nextDisplays = structuredClone(initial.displays);
  for (const [key, value] of Object.entries(first.batches[0].updates)) {
    if (key.includes("/")) throw new Error("unexpected nested fixture update");
    if (value === null) delete nextDisplays["center-a"]["2026-09-20"][key];
    else nextDisplays["center-a"]["2026-09-20"][key] = value;
  }
  const second = planLegacyDisplayMigration({ ...initial, displays: nextDisplays });
  assert.equal(second.batches.length, 0);
  assert.equal(second.summary.legacyRecordsToDelete, 0);
  assert.equal(second.summary.canonicalRecordsToCreate, 0);
  assert.equal(second.summary.canonicalRecordsToUpdate, 0);
});

test("cashier projections use configured public cashier name and contain no private identifiers", () => {
  const plan = planLegacyDisplayMigration(fixture({
    displays: { internal1: projection("V1-01") },
    cases: { internal1: caseRecord("internal1", "V1-01", "called_to_cashier") },
  }));
  const written = plan.batches[0].updates["V1-01"];
  assert.equal(written.destination, "Caja 1");
  assert.equal(written.status, "Diríjase a Caja 1");
  assert.deepEqual(Object.keys(written).sort(), ["destination", "isPriority", "publicCode", "status", "updatedAt"]);
});

test("CLI is dry-run by default, requires explicit apply, and reports no internal record keys", () => {
  const source = fs.readFileSync(require.resolve("../scripts/f09b-legacy-display-migration.cjs"), "utf8");
  assert.match(source, /const apply = flags\.get\("apply"\) === true/);
  assert.match(source, /if \(apply && snapshotMode\).*snapshot application is forbidden/);
  assert.match(source, /if \(apply && !centerId\).*explicit --center/);
  assert.match(source, /flags\.get\("firebase-cli-session"\) === true/);
  assert.match(source, /if \(apply\) \{\s*if \(!plan\.safeForMigration\)/);
  const outputBlock = source.slice(source.indexOf("process.stdout.write"), source.indexOf("if (require.main"));
  assert.doesNotMatch(outputBlock, /batches:|collisions:/);
  assert.match(outputBlock, /atomicCenterDayBatches/);
});
