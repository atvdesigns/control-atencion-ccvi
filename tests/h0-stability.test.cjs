const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const appText = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
const appSource = ts.createSourceFile("App.tsx", appText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const compile = (text) => ts.transpileModule(text, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function declaration(container, name) {
  for (const statement of container.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const found = statement.declarationList.declarations.find((item) => item.name.getText(appSource) === name);
    if (found) return found;
  }
  throw new Error(`Missing declaration: ${name}`);
}
const appBody = declaration(appSource, "App").initializer.body;
const adminBody = declaration(appSource, "AdminView").initializer.body;
function effect(body, contains) {
  return body.statements.find((statement) => ts.isExpressionStatement(statement) &&
    ts.isCallExpression(statement.expression) && statement.expression.expression.getText(appSource) === "useEffect" &&
    statement.getText(appSource).includes(contains)).getText(appSource);
}
const subscriptionEffect = effect(appBody, "subscribeToOperationalDay(");
const adminSelectionEffect = effect(adminBody, "previousLiveSessionId.current");

// Exercise actual hook and App effect bodies without mounting UI, loading Firebase,
// writing browser storage, installing a test framework, or waiting for real time.
function fixture() {
  let now = Date.parse("2026-09-12T02:59:50Z");
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  function module(file, deps = {}, extra = {}) {
    const exports = {};
    vm.runInNewContext(compile(fs.readFileSync(path.join(root, file), "utf8")), {
      exports, Date: Clock, Intl, ...extra,
      require(name) { if (!(name in deps)) throw new Error(name); return deps[name]; },
    });
    return exports;
  }
  const config = module("src/centerJourneyConfig.ts");
  const store = module("src/store.ts", { "./centerJourneyConfig": config, "./services/firebase": { database: null } });
  const intervals = new Map();
  const windowEvents = new Map();
  const documentEvents = new Map();
  let observedDay;
  let changed = false;
  let lastHookDeps;
  let hookCleanup;
  const react = {
    useState(initial) {
      if (observedDay === undefined) observedDay = initial();
      return [observedDay, (next) => { changed ||= next !== observedDay; observedDay = next; }];
    },
    useEffect(callback, deps) {
      if (!lastHookDeps || deps.some((value, i) => value !== lastHookDeps[i])) {
        hookCleanup?.();
        lastHookDeps = deps;
        hookCleanup = callback();
      }
    },
  };
  const hook = module("src/useOperationalDay.ts", { react, "./store": store }, {
    window: {
      setInterval(fn, delay) { assert.equal(delay, 30_000); intervals.set(1, fn); return 1; },
      clearInterval(id) { intervals.delete(id); },
      addEventListener(name, fn) { windowEvents.set(name, fn); },
      removeEventListener(name) { windowEvents.delete(name); },
    },
    document: {
      addEventListener(name, fn) { documentEvents.set(name, fn); },
      removeEventListener(name) { documentEvents.delete(name); },
    },
  });
  const initial = store.createInitialData();
  const profile = { role: "cashier", cashierId: "cashier1" };
  let currentData = initial;
  let lastSubscriptionDeps;
  let subscriptionCleanup;
  let remote;
  const calls = [];
  const callbacks = [];
  const stopped = [];
  function render(enabled = true) {
    changed = false;
    const operationalDayId = hook.useOperationalDay(initial.centers[initial.selectedCenterId].timezone, enabled);
    const scope = {
      exports: {}, storedData: initial, rolloverEnabled: enabled, operationalDayId,
      getCurrentSession: store.getCurrentSession, ensureSession: store.ensureSession,
      useMemo: (factory) => factory(),
    };
    vm.runInNewContext(compile(`const data = ${declaration(appBody, "data").initializer.getText(appSource)}; exports.data = data;`), scope);
    currentData = scope.exports.data;
    const context = {
      data: currentData, getCurrentSession: store.getCurrentSession,
      selectedCenterId: currentData.selectedCenterId,
      authenticatedProfile: profile, hasAuthorizedCenter: true,
      setRemoteOperationalDay(value) { remote = value; },
      hydrateOperationalDayViewCallable() { return Promise.resolve({ ok: true, outcome: "ready" }); },
      subscribeToOperationalDay(center, day, scope, callback) {
        assert.equal(scope.role, "cashier");
        assert.equal(scope.cashierId, "cashier1");
        calls.push(`${center}/${day}`); callbacks.push(callback);
        return () => stopped.push(day);
      },
      useEffect(callback, deps) {
        if (!lastSubscriptionDeps || deps.some((value, i) => value !== lastSubscriptionDeps[i])) {
          subscriptionCleanup?.(); lastSubscriptionDeps = deps; subscriptionCleanup = callback();
        }
      },
    };
    vm.runInNewContext(compile(`const selectedDayId = ${declaration(appBody, "selectedDayId").initializer.getText(appSource)}; ${subscriptionEffect}`), context);
    return currentData;
  }
  return {
    store, initial, render, calls, callbacks, stopped, intervals, windowEvents, documentEvents,
    setTime(value) { now = Date.parse(value); },
    tick() { intervals.get(1)?.(); if (changed) render(); },
    wake(event = "focus") { (windowEvents.get(event) || documentEvents.get(event))?.(); if (changed) render(); },
    remote() { return remote; },
    cleanup() { hookCleanup?.(); subscriptionCleanup?.(); },
  };
}

test("midnight changes the existing private subscription exactly once; ordinary checks do not poll Firebase", () => {
  const f = fixture();
  f.render();
  assert.deepEqual(f.calls, ["ccvi-san-bernardo/2026-09-11"]);
  f.tick(); f.tick();
  assert.equal(f.calls.length, 1);
  f.setTime("2026-09-12T03:00:01Z");
  const newData = f.render(); // An unrelated render can precede the timer.
  assert.equal(f.store.getCurrentSession(newData).date, "2026-09-12");
  f.tick();
  assert.deepEqual(f.calls, ["ccvi-san-bernardo/2026-09-11", "ccvi-san-bernardo/2026-09-12"]);
  assert.deepEqual(f.stopped, ["2026-09-11"]);
  const current = { cases: { current: {} } };
  f.callbacks[1](current);
  f.callbacks[0]({ cases: { stale: {} } });
  assert.equal(f.remote().snapshot, current, "late previous-day callback must be ignored");
  f.cleanup();
  assert.equal(f.intervals.size, 0);
  assert.equal(f.windowEvents.size, 0);
  assert.equal(f.documentEvents.size, 0);
});

test("timer alone triggers the new-day subscription without reload", () => {
  const f = fixture(); f.render();
  f.setTime("2026-09-12T03:00:10Z"); f.tick();
  assert.equal(f.calls.at(-1), "ccvi-san-bernardo/2026-09-12");
  assert.equal(f.calls.length, 2);
  f.cleanup();
});

test("focus and visibility recheck the day after a suspended tab", () => {
  for (const event of ["focus", "visibilitychange"]) {
    const f = fixture(); f.render();
    f.setTime("2026-09-13T15:00:00Z"); f.wake(event);
    assert.equal(f.calls.at(-1), "ccvi-san-bernardo/2026-09-13");
    f.cleanup();
  }
});

test("public surfaces do not start a rollover timer", () => {
  const f = fixture(); f.render(false);
  assert.equal(f.intervals.size, 0);
  assert.equal(f.windowEvents.size, 0);
  assert.equal(f.documentEvents.size, 0);
  f.cleanup();
});

test("Admin follows live day but preserves explicitly selected historical day", () => {
  for (const selected of ["center-2026-09-11", "center-2026-09-09"]) {
    let result = selected;
    const previousLiveSessionId = { current: "center-2026-09-11" };
    vm.runInNewContext(compile(adminSelectionEffect), {
      availableAuthoritativeSessions: ["center-2026-09-09", "center-2026-09-11", "center-2026-09-12"].map((sessionId) => ({ sessionId })),
      selectedMetricsSessionId: selected, previousLiveSessionId,
      session: { sessionId: "center-2026-09-12" },
      setSelectedMetricsSessionId(value) { result = value; },
      useEffect(callback) { callback(); },
    });
    assert.equal(result, selected === "center-2026-09-11" ? "center-2026-09-12" : selected);
  }
});

test("old-day snapshot cannot supply the new day's operational records", () => {
  const f = fixture(); const data = f.render();
  const expression = declaration(appBody, "operationalData").initializer.getText(appSource);
  const exports = {};
  vm.runInNewContext(compile(`exports.data = ${expression};`), {
    exports, data, rolloverEnabled: true, selectedCenterId: data.selectedCenterId,
    selectedDayId: "2026-09-12", getCurrentSession: f.store.getCurrentSession,
    remoteOperationalDay: { centerId: data.selectedCenterId, dayId: "2026-09-11", snapshot: { cases: { old: {} } } },
  });
  assert.equal(Object.keys(exports.data.cases).length, 0);
  assert.equal(Object.keys(exports.data.paymentQueue).length, 0);
  assert.equal(exports.data.events.length, 0);
  assert.equal(exports.data.sessions, data.sessions, "historical session metadata must remain intact");
  f.cleanup();
});

test("Hosting revalidates entry paths without changing hashed JS/CSS or image caching", () => {
  const hosting = JSON.parse(fs.readFileSync(path.join(root, "firebase.json"), "utf8")).hosting;
  const headers = (pathname) => hosting.headers.filter((rule) => new RegExp(rule.regex).test(pathname)).flatMap((rule) => rule.headers);
  for (const route of ["/", "/index.html", "/login", "/totem", "/monitor", "/turno/token-123", "/other/navigation/"]) {
    assert.ok(headers(route).some((h) => h.key === "Cache-Control" && h.value === "no-cache"), route);
  }
  for (const asset of ["/assets/index-B9dce2P-.js", "/assets/index-BTqhx17_.css", "/ccvi-login-background.png"]) {
    assert.equal(headers(asset).length, 0, asset);
  }
});
