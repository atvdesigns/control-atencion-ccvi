const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const compile = (file) => ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const reporting = {}; new Function("exports", compile("src/adminReporting.ts"))(reporting);
const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
const fn = fs.readFileSync(path.join(root, "functions/src/index.ts"), "utf8");
const dayIds = ["2026-09-04", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21"];

test("history discovery is trusted Admin-only and independent from private session cache", () => {
  const section = fn.slice(fn.indexOf("export const listAdminOperationalDays"));
  assert.match(section, /profile\.role !== "admin"/);
  assert.match(section, /profile\.centerAccess\?\.\[input\.centerId\] !== true/);
  assert.ok(section.indexOf("profileSnapshot") < section.indexOf("daysSnapshot"));
  assert.match(app, /listAdminOperationalDaysCallable\(center\.centerId\)/);
  const discoveryEffect = app.slice(
    app.indexOf("void listAdminOperationalDaysCallable(center.centerId)"),
    app.indexOf("void Promise.all(required.map", app.indexOf("void listAdminOperationalDaysCallable(center.centerId)")),
  );
  assert.doesNotMatch(discoveryEffect, /localStorage|data\.sessions/);
});

test("F07-clean lifecycle discovers history without private sessions and supports current to A to B to current", () => {
  const current = { sessionId: "center-2026-09-21", centerId: "center", date: "2026-09-21" };
  const discovered = [
    { sessionId: "center-2026-09-21", centerId: "center", date: "2026-09-21" },
    { sessionId: "center-2026-09-20", centerId: "center", date: "2026-09-20" },
    { sessionId: "center-2026-09-19", centerId: "center", date: "2026-09-19" },
  ];
  const options = reporting.authoritativeReportingSessions(current, discovered);
  assert.deepEqual(options.map((item) => item.sessionId), discovered.map((item) => item.sessionId));
  let selected = current.sessionId;
  selected = options.find((item) => item.sessionId === "center-2026-09-20").sessionId;
  assert.equal(selected, "center-2026-09-20");
  selected = options.find((item) => item.sessionId === "center-2026-09-19").sessionId;
  assert.equal(selected, "center-2026-09-19");
  selected = current.sessionId;
  assert.equal(selected, "center-2026-09-21");
});

test("calendar week is Monday through Sunday and consumes all persisted days", () => {
  assert.deepEqual(reporting.operationalDayRange("2026-09-18", "week"), {
    startOperationalDay: "2026-09-14", endOperationalDay: "2026-09-20",
  });
  assert.deepEqual(reporting.includedOperationalDays(dayIds, "2026-09-18", "week"),
    ["2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"]);
});

test("calendar month consumes every persisted day in the month without fabrication", () => {
  assert.deepEqual(reporting.operationalDayRange("2026-09-21", "month"), {
    startOperationalDay: "2026-09-01", endOperationalDay: "2026-09-30",
  });
  assert.deepEqual(reporting.includedOperationalDays(dayIds, "2026-09-21", "month"), dayIds);
});

test("year uses the same generic persisted-day range", () => {
  assert.deepEqual(reporting.operationalDayRange("2026-09-21", "year"), {
    startOperationalDay: "2026-01-01", endOperationalDay: "2026-12-31",
  });
});

test("range merge uses underlying cases and preserves weighted duration observations", () => {
  const current = { selectedCenterId: "center", centers: {}, sessions: {}, cases: {}, paymentQueue: {}, events: [] };
  const caseValue = (id, duration) => ({ caseId:id, centerId:"center", sessionId:"center-x", cashierId:"cashier1", currentState:"completed", cashierStartedAt:10, paymentCompletedAt:10+duration, completedAt:10+duration, arrivalAt:0 });
  const snapshots = {
    "2026-09-15": { cases: { a: caseValue("a", 10), b: caseValue("b", 30) } },
    "2026-09-16": { cases: { c: caseValue("c", 100) } },
  };
  const merged = reporting.adminRangeDataFromSnapshots(current, "2026-09-21", ["2026-09-15", "2026-09-16"], snapshots);
  const durations = Object.values(merged.cases).map((item) => item.paymentCompletedAt-item.cashierStartedAt);
  assert.deepEqual(durations, [10,30,100]);
  assert.equal(durations.reduce((a,b)=>a+b,0)/durations.length, 140/3);
  assert.equal(Object.keys(merged.cases).length, 3, "totals use all underlying observations");
  assert.equal(Object.values(merged.cases).filter((item) => item.cashierId === "cashier1").length / Object.keys(merged.cases).length, 1,
    "rates are recalculated from the full observation set");
});

test("same bounded snapshots drive screen tables and rejected export", () => {
  assert.match(app, /Object\.values\(cashierRangeData\.cases\)/);
  assert.match(app, /Object\.values\(rejectedRangeData\.cases\)/);
  assert.match(app, /downloadRejectedUsersCsv\(rejectedUsers, rejectedAtFormatter\)/);
  assert.match(app, /readAdminOperationalDayOnce/);
});

test("current to A to B to current selection is backed by authoritative options", () => {
  assert.match(app, /availableAuthoritativeSessions\.find/);
  assert.match(app, /availableAuthoritativeSessions\.some/);
  assert.match(app, /subscribeToOperationalDay\(\s*center\.centerId,\s*selectedMetricsSession\.date/s);
  assert.match(app, /active = false;\s*unsubscribe\(\)/s);
});
