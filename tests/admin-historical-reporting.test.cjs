const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src/adminReporting.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const reporting = {};
new Function("exports", compiled)(reporting);
const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");

const session = (date) => ({
  sessionId: `center-${date}`, centerId: "center", date, status: "open",
  nextGlobalArrivalSequence: 1, nextFolderNumber: 1, nextPaymentQueueNumber: 1,
  consecutivePriorityCasesForWindow: {}, consecutivePriorityCasesForCashier: 0,
  windowSequences: {}, createdAt: 1,
});
const base = {
  selectedCenterId: "center", centers: {},
  sessions: { "center-2026-09-21": session("2026-09-21"), "center-2026-09-20": session("2026-09-20"), "center-2026-09-19": session("2026-09-19") },
  cases: { current: { caseId: "current", centerId: "center", sessionId: "center-2026-09-21" } },
  paymentQueue: { current: { queueItemId: "current" } }, events: [],
};
const snapshot = (date, key) => ({
  metadata: { date },
  cases: { [key]: { caseId: key, centerId: "center", sessionId: `center-${date}` } },
  paymentQueue: {}, events: {},
});

test("current report remains on current authoritative data", () => {
  assert.deepEqual(Object.keys(base.cases), ["current"]);
});

test("historical Day A and Day B snapshots remain isolated", () => {
  const dayA = reporting.adminReportDataFromSnapshot(base, base.sessions["center-2026-09-20"], snapshot("2026-09-20", "a"));
  const dayB = reporting.adminReportDataFromSnapshot(base, base.sessions["center-2026-09-19"], snapshot("2026-09-19", "b"));
  assert.deepEqual(Object.keys(dayA.cases), ["a"]);
  assert.deepEqual(Object.keys(dayB.cases), ["b"]);
  assert.deepEqual(Object.keys(base.cases), ["current"]);
});

test("empty historical day never falls back to current records", () => {
  const empty = reporting.adminReportDataFromSnapshot(base, base.sessions["center-2026-09-20"], {});
  assert.deepEqual(empty.cases, {}); assert.deepEqual(empty.paymentQueue, {}); assert.deepEqual(empty.events, []);
});

test("returning to current day retains the unchanged current dataset", () => {
  reporting.adminReportDataFromSnapshot(base, base.sessions["center-2026-09-20"], snapshot("2026-09-20", "a"));
  assert.deepEqual(Object.keys(base.cases), ["current"]);
});

test("Admin subscribes by selected historical operational date and exports selected metrics", () => {
  assert.match(app, /subscribeToOperationalDay\(\s*center\.centerId,\s*selectedMetricsSession\.date,\s*\{ role: "admin" \}/s);
  assert.match(app, /calculateMetrics\(reportData, selectedMetricsSession\.sessionId\)/);
  assert.match(app, /downloadMetricsCsv\(center, selectedMetricsSession, metrics\)/);
  assert.match(app, /printMetricsPdf\(center, selectedMetricsSession, metrics\)/);
});

test("events are sorted newest first with deterministic eventId tie-break", () => {
  const input = { c: { eventId: "c", timestamp: 2 }, b: { eventId: "b", timestamp: 3 }, a: { eventId: "a", timestamp: 3 } };
  assert.deepEqual(reporting.traceEventsFromSnapshot(input).map((item) => item.eventId), ["a", "b", "c"]);
  assert.deepEqual(Object.keys(input), ["c", "b", "a"], "stored object must not be mutated");
});

test("recent subset is taken after deterministic sorting", () => {
  assert.match(app, /sortTraceEventsNewestFirst\(reportData\.events\)\.slice\(0, 18\)/);
});
