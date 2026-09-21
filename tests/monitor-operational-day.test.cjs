const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
const service = fs.readFileSync(path.join(root, "src/services/firebase.ts"), "utf8");

const between = (source, startText, endText) => {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start + startText.length);
  assert.notEqual(start, -1, `missing ${startText}`);
  assert.notEqual(end, -1, `missing ${endText}`);
  return source.slice(start, end);
};

const displayView = between(app, "const DisplayView", "const DisplayPanel");
const publicDisplaySubscription = between(
  service,
  "export const subscribeToPublicDisplay =",
  "export const subscribeToPublicDisplayCalls =",
);
const publicCallSubscription = between(
  service,
  "export const subscribeToPublicDisplayCalls =",
  "export const subscribeToPublicKioskConfig =",
);

const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

const operationalDayAt = (instant, timezone) => {
  let now = Date.parse(instant);
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const storeExports = {};
  const configExports = {};
  vm.runInNewContext(compile(fs.readFileSync(path.join(root, "src/centerJourneyConfig.ts"), "utf8")), {
    exports: configExports,
  });
  vm.runInNewContext(compile(fs.readFileSync(path.join(root, "src/store.ts"), "utf8")), {
    exports: storeExports,
    Date: Clock,
    Intl,
    require(name) {
      if (name === "./centerJourneyConfig") return configExports;
      if (name === "./services/firebase") return { database: null };
      throw new Error(name);
    },
  });
  return storeExports.todayId(timezone);
};

test("Monitor derives its day from the selected center timezone", () => {
  assert.match(displayView, /const center = data\.centers\[data\.selectedCenterId\]/);
  assert.match(displayView, /useOperationalDay\(center\.timezone, true\)/);
});

test("Monitor has no private-session dependency after clean reload or auth cleanup", () => {
  assert.doesNotMatch(displayView, /getCurrentSession|authSession|authenticatedProfile|sessions/);
});

test("Monitor subscribes to public displays using the operational day", () => {
  assert.match(displayView, /subscribeToPublicDisplay\(\s*data\.selectedCenterId,\s*dayId,/);
  assert.match(publicDisplaySubscription, /public\/displays\/\$\{publicPathSegment\(centerId\)\}\/\$\{publicPathSegment\(dayId\)\}/);
});

test("Monitor subscribes to public display-call history using the operational day", () => {
  assert.match(displayView, /subscribeToPublicDisplayCalls\(\s*data\.selectedCenterId,\s*dayId,/);
  assert.match(publicCallSubscription, /public\/displayCalls\/\$\{publicPathSegment\(centerId\)\}\/\$\{publicPathSegment\(dayId\)\}/);
});

test("Monitor does not read authoritative or private role projections", () => {
  assert.doesNotMatch(displayView, /subscribeToOperationalDay|\/days|operationalViews/);
  assert.doesNotMatch(publicDisplaySubscription + publicCallSubscription, /operationalViews|`days\//);
});

test("Window current projections remain sourced from active public entries", () => {
  assert.match(displayView, /const windowCalls = activeCalls\.filter\(\(event\) => event\.destinationType === "window"\)/);
});

test("Cashier current projections remain sourced from active public entries", () => {
  assert.match(displayView, /const cashierCalls = activeCalls\.filter\(\(event\) => event\.destinationType === "cashier"\)/);
});

test("Display-call history remains visible", () => {
  assert.match(displayView, /const recentCalls = newestEvents\.slice\(0, 5\)/);
  assert.match(displayView, /entries=\{recentCalls\}/);
});

test("Existing Monitor destination filtering remains unchanged", () => {
  assert.match(displayView, /destinationType: \/\^Ventanilla\\b\/i\.test\(entry\.destination\) \? "window" : "cashier"/);
  assert.match(displayView, /const currentActiveCall = currentCall && isActiveCall\(currentCall\)/);
});

test("Santiago operational day remains on the previous date before local midnight", () => {
  assert.equal(operationalDayAt("2026-09-12T02:59:59Z", "America/Santiago"), "2026-09-11");
});

test("Santiago operational day advances at local midnight", () => {
  assert.equal(operationalDayAt("2026-09-12T03:00:00Z", "America/Santiago"), "2026-09-12");
});

test("Operational day follows center timezone rather than browser or UTC day", () => {
  const instant = "2026-09-12T02:20:00Z";
  assert.equal(operationalDayAt(instant, "America/Santiago"), "2026-09-11");
  assert.equal(operationalDayAt(instant, "UTC"), "2026-09-12");
});
