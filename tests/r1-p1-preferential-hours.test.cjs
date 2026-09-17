const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const compile = (file) => ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const operational = {};
vm.runInNewContext(compile("src/operationalCenterConfig.ts"), { exports: operational, Intl, Date });
const configExports = {};
vm.runInNewContext(compile("src/centerJourneyConfig.ts"), { exports: configExports });
const transaction = { mode: "commit", projectionFails: false, calls: 0, projectionCalls: 0 };
const firebase = {
  database: {}, ref: (_database, referencePath) => referencePath,
  runTransaction: async () => {
    throw new Error("Preferential creation must not use a client transaction");
  },
  createPriorityArrivalCallable: async (centerId, priorityType) => {
    transaction.calls += 1;
    if (transaction.mode === "abort") return { ok: false, outcome: "transaction_conflict" };
    const now = Date.now();
    const sessionId = `${centerId}-2026-09-17`;
    const caseId = `priority-${transaction.calls}`;
    const createdCase = {
      caseId, publicToken: `token-${caseId}`, centerId, sessionId, publicCode: `V1-${String(transaction.calls).padStart(2, "0")}`,
      globalArrivalSequence: transaction.calls, publicSequence: transaction.calls,
      serviceType: "representation", serviceLabel: "Representación", validationLevel: "enhanced",
      personKind: "not_specified", assignedWindowId: "window-1", assignedWindowNumber: 1,
      assignedOperatorId: null, isPriority: true, priorityType, priorityCreatedBy: "operator-window-1",
      priorityCreatedAt: now, currentState: "waiting_document_validation", arrivalAt: now,
      calledToWindowAt: null, documentValidationStartedAt: null, documentValidationCompletedAt: null,
      documentStatus: "pending", optionalInternalNote: null, folderCode: null, paymentQueueNumber: null,
      paymentTicketId: null, cashierId: null, calledToCashierAt: null, cashierStartedAt: null,
      paymentCompletedAt: null, completedAt: null, updatedAt: now,
    };
    const metadata = {
      sessionId, centerId, date: "2026-09-17", status: "open", nextGlobalArrivalSequence: transaction.calls + 1,
      windowSequences: { "window-1": transaction.calls }, consecutivePriorityCasesByWindow: {},
      consecutivePriorityCasesForCashier: 0, nextFolderNumber: 1, nextPaymentQueueNumber: 1,
      openedAt: now, closedAt: null,
    };
    const events = [
      { eventId: `priority-${caseId}`, centerId, sessionId, caseId, actorRole: "operator-window-1", actorId: "operator-window-1", action: "priority_created", fromState: "waiting_document_validation", toState: "waiting_document_validation", timestamp: now, optionalNote: priorityType },
      { eventId: `arrival-${caseId}`, centerId, sessionId, caseId, actorRole: "operator-window-1", actorId: "operator-window-1", action: "arrival_created", fromState: null, toState: "waiting_document_validation", timestamp: now, optionalNote: null },
    ];
    return { ok: true, outcome: transaction.projectionFails ? "created_but_projection_sync_failed" : "created", createdCase, metadata, events };
  },
  update: async () => {
    transaction.projectionCalls += 1;
    if (transaction.projectionFails) throw new Error("projection failed");
  },
  publicDisplayCallEventUpdate: () => ({}), publicDisplayEntryUpdate: () => ({}),
  publicTurnStatusUpdate: () => ({}), toPublicDisplayEntry: () => null,
  toPublicDisplayCallEvent: () => null, toPublicTurnStatus: () => ({}),
};
const store = {};
vm.runInNewContext(compile("src/store.ts"), {
  exports: store, Date, Intl, Math, URL, crypto: require("node:crypto").webcrypto,
  window: { localStorage: { getItem: () => null, setItem() {} } },
  require(name) {
    if (name === "./centerJourneyConfig") return configExports;
    if (name === "./services/firebase") return firebase;
    throw new Error(`Unexpected dependency: ${name}`);
  },
});

const projection = (centerId, overrides = {}) => ({
  centerId, enabled: true, serviceStartTime: "07:00", serviceEndTime: "22:00",
  timezone: "America/Santiago", kioskTimeoutSeconds: 30, windows: [], ...overrides,
});
const atSantiago = (hour, minute) => new Date(Date.UTC(2026, 8, 17, hour + 3, minute));
const subscriptions = () => {
  const bindings = [];
  const subscribe = (centerId, onSnapshot, onError) => {
    const binding = { centerId, onSnapshot, onError, detached: false };
    bindings.push(binding);
    return () => { binding.detached = true; };
  };
  return { bindings, subscribe };
};

const lifecycle = (authorizedCenterIds = ["center-a", "center-b"]) => {
  const transport = subscriptions();
  let stored = { contextKey: null, centerId: null, status: "loading", config: null };
  let contextKey = null;
  let centerId = "center-a";
  let dispose = () => undefined;
  const active = () => operational.resolveActiveOperationalConfig(contextKey, centerId, stored);
  const login = (uid, nextCenterId) => {
    dispose();
    centerId = nextCenterId;
    contextKey = `${uid}:${nextCenterId}`;
    dispose = operational.subscribeToAuthorizedOperationalConfig({
      contextKey, centerId, authorizedCenterIds, subscribe: transport.subscribe,
      onState: (state) => { stored = state; },
    });
  };
  const logout = () => {
    dispose();
    contextKey = null;
  };
  return { transport, login, logout, active };
};

const dataFor = (value = projection("ccvi-san-bernardo")) => {
  const initial = store.createInitialData();
  const config = operational.operationalConfigFromPublicProjection(initial.selectedCenterId, value);
  assert.ok(config);
  return operational.hydrateOperationalCenterConfig(initial, initial.selectedCenterId, config);
};

test("A: stale local hours remain unusable until center A snapshot is ready", () => {
  const flow = lifecycle();
  const local = store.createInitialData();
  assert.equal(local.centers[local.selectedCenterId].serviceStartTime, "08:00");
  flow.login("user-a", "center-a");
  assert.equal(flow.active().contextKey, "user-a:center-a");
  assert.equal(flow.active().centerId, "center-a");
  assert.equal(flow.active().status, "loading");
  assert.equal(flow.active().config, null);
  flow.transport.bindings[0].onSnapshot(projection("center-a"));
  assert.equal(flow.active().status, "ready");
  assert.equal(flow.active().config.serviceStartTime, "07:00");
  assert.equal(flow.active().config.serviceEndTime, "22:00");
});

test("B: late center A callback cannot overwrite ready center B", () => {
  const flow = lifecycle();
  flow.login("user", "center-a");
  const a = flow.transport.bindings[0];
  a.onSnapshot(projection("center-a"));
  flow.login("user", "center-b");
  assert.equal(flow.active().status, "loading");
  const b = flow.transport.bindings[1];
  b.onSnapshot(projection("center-b", { serviceStartTime: "08:30", serviceEndTime: "19:30" }));
  a.onSnapshot(projection("center-a", { serviceStartTime: "06:00" }));
  assert.equal(flow.active().centerId, "center-b");
  assert.equal(flow.active().config.serviceStartTime, "08:30");
  assert.equal(flow.active().config.serviceEndTime, "19:30");
});

test("C: logout ignores a delayed center A callback", () => {
  const flow = lifecycle();
  flow.login("user", "center-a");
  const a = flow.transport.bindings[0];
  a.onSnapshot(projection("center-a"));
  flow.logout();
  a.onSnapshot(projection("center-a", { serviceStartTime: "06:00" }));
  assert.equal(flow.active().config, null);
  assert.equal(flow.active().status, "loading");
});

test("D: A to B to logout ignores delayed callbacks from both", () => {
  const flow = lifecycle();
  flow.login("user", "center-a");
  const a = flow.transport.bindings[0];
  flow.login("user", "center-b");
  const b = flow.transport.bindings[1];
  flow.logout();
  a.onSnapshot(projection("center-a"));
  b.onSnapshot(projection("center-b"));
  assert.equal(flow.active().config, null);
});

test("E: delayed A after logout and login B cannot overwrite B", () => {
  const flow = lifecycle();
  flow.login("user-a", "center-a");
  const a = flow.transport.bindings[0];
  flow.logout();
  flow.login("user-b", "center-b");
  const b = flow.transport.bindings[1];
  b.onSnapshot(projection("center-b", { serviceStartTime: "08:30" }));
  a.onSnapshot(projection("center-a", { serviceStartTime: "06:00" }));
  assert.equal(flow.active().contextKey, "user-b:center-b");
  assert.equal(flow.active().config.serviceStartTime, "08:30");
});

test("F: invalid new-center snapshot cannot retain old ready config", () => {
  const flow = lifecycle();
  flow.login("user", "center-a");
  flow.transport.bindings[0].onSnapshot(projection("center-a"));
  flow.login("user", "center-b");
  flow.transport.bindings[1].onSnapshot(projection("center-b", { timezone: "Invalid/Timezone" }));
  assert.equal(flow.active().status, "error");
  assert.equal(flow.active().config, null);
});

test("G: enabled=false is authoritative but fails closed", () => {
  const flow = lifecycle();
  flow.login("user", "center-a");
  flow.transport.bindings[0].onSnapshot(projection("center-a", { enabled: false }));
  const active = flow.active();
  assert.equal(active.status, "ready");
  assert.equal(store.getCenterScheduleStatus(active.config, atSantiago(12, 0)), "unavailable");
});

test("H: execution during loading returns typed unavailable without transaction", async () => {
  transaction.calls = 0;
  const result = await store.createPriorityArrivalRealtime(
    store.createInitialData(), "representation", "other", "operator-window-1", () => false, atSantiago(12, 0),
  );
  assert.equal(result.outcome, "stale-context");
  assert.equal(transaction.calls, 0);
});

const capturePriorityAction = (requestedContext, getCurrentContext) => {
  const data = dataFor();
  const guard = operational.createOperationalExecutionGuard(requestedContext, getCurrentContext);
  return () => store.createPriorityArrivalRealtime(
    data, "representation", "other", "operator-window-1", guard, atSantiago(12, 0),
  );
};

test("stale A action after switch to B is rejected before transaction", async () => {
  const flow = lifecycle();
  flow.login("user", "center-a");
  flow.transport.bindings[0].onSnapshot(projection("center-a"));
  const action = capturePriorityAction(flow.active(), flow.active);
  flow.login("user", "center-b");
  flow.transport.bindings[1].onSnapshot(projection("center-b"));
  transaction.calls = 0;
  transaction.projectionCalls = 0;
  const result = await action();
  assert.equal(result.outcome, "stale-context");
  assert.equal(result.createdCase, null);
  assert.equal(transaction.calls, 0);
  assert.equal(transaction.projectionCalls, 0);
  assert.equal(flow.active().centerId, "center-b");
});

test("stale A action after logout is rejected before transaction", async () => {
  const flow = lifecycle();
  flow.login("user", "center-a");
  flow.transport.bindings[0].onSnapshot(projection("center-a"));
  const action = capturePriorityAction(flow.active(), flow.active);
  flow.logout();
  transaction.calls = 0;
  const result = await action();
  assert.equal(result.outcome, "stale-context");
  assert.equal(result.createdCase, null);
  assert.equal(transaction.calls, 0);
});

test("stale A action after logout and ready B is rejected by identity", async () => {
  const flow = lifecycle();
  flow.login("user-a", "center-a");
  flow.transport.bindings[0].onSnapshot(projection("center-a"));
  const action = capturePriorityAction(flow.active(), flow.active);
  flow.logout();
  flow.login("user-b", "center-b");
  flow.transport.bindings[1].onSnapshot(projection("center-b"));
  const before = flow.active();
  transaction.calls = 0;
  const result = await action();
  assert.equal(result.outcome, "stale-context");
  assert.equal(transaction.calls, 0);
  assert.equal(flow.active(), before);
});

test("matching current READY context reaches the existing transaction", async () => {
  const flow = lifecycle(["ccvi-san-bernardo"]);
  flow.login("user", "ccvi-san-bernardo");
  flow.transport.bindings[0].onSnapshot(projection("ccvi-san-bernardo"));
  const action = capturePriorityAction(flow.active(), flow.active);
  transaction.calls = 0;
  const result = await action();
  assert.equal(result.outcome, "created");
  assert.equal(transaction.calls, 1);
});

test("storage-driven A to B invalidates authority before state replacement", async () => {
  const flow = lifecycle(["ccvi-san-bernardo"]);
  flow.login("user", "ccvi-san-bernardo");
  flow.transport.bindings[0].onSnapshot(projection("ccvi-san-bernardo"));
  const requested = flow.active();
  const authorityRef = { current: requested };
  const action = capturePriorityAction(requested, () => authorityRef.current);
  const currentData = store.createInitialData();
  const nextData = { ...currentData, selectedCenterId: "center-b" };
  transaction.calls = 0;
  transaction.projectionCalls = 0;
  operational.applyOperationalDataContextChange(currentData, nextData, authorityRef);
  const result = await action();
  assert.equal(authorityRef.current.status, "loading");
  assert.equal(authorityRef.current.config, null);
  assert.equal(result.outcome, "stale-context");
  assert.equal(result.createdCase, null);
  assert.equal(transaction.calls, 0);
  assert.equal(transaction.projectionCalls, 0);
});

test("same-center storage update and harmless rerender preserve READY authority", async () => {
  const flow = lifecycle(["ccvi-san-bernardo"]);
  flow.login("user", "ccvi-san-bernardo");
  flow.transport.bindings[0].onSnapshot(projection("ccvi-san-bernardo"));
  const requested = flow.active();
  const authorityRef = { current: requested };
  const currentData = store.createInitialData();
  const unrelatedUpdate = { ...currentData, events: [...currentData.events] };
  operational.applyOperationalDataContextChange(currentData, unrelatedUpdate, authorityRef);
  const rerendered = operational.resolveActiveOperationalConfig(
    requested.contextKey,
    requested.centerId,
    requested,
  );
  authorityRef.current = rerendered;
  transaction.calls = 0;
  const result = await capturePriorityAction(requested, () => authorityRef.current)();
  assert.equal(authorityRef.current, requested);
  assert.equal(result.outcome, "created");
  assert.equal(transaction.calls, 1);
});

test("unauthorized center cannot start a subscription", () => {
  const flow = lifecycle(["center-a"]);
  flow.login("user", "center-b");
  assert.equal(flow.transport.bindings.length, 0);
  assert.equal(flow.active().status, "error");
  assert.equal(flow.active().config, null);
});

test("missing and malformed snapshots fail closed", () => {
  const flow = lifecycle();
  flow.login("user", "center-a");
  const binding = flow.transport.bindings[0];
  binding.onSnapshot(null);
  assert.equal(flow.active().status, "error");
  binding.onSnapshot(projection("center-a", { serviceStartTime: "7:00" }));
  assert.equal(flow.active().status, "error");
  binding.onSnapshot(projection("center-a", { timezone: "Invalid/Timezone" }));
  assert.equal(flow.active().status, "error");
});

for (const [label, hour, minute, expected] of [
  ["06:59", 6, 59, "closed"], ["07:00", 7, 0, "open"],
  ["21:59", 21, 59, "open"], ["22:00", 22, 0, "closed"],
]) test(`shared Totem/Preferential boundary ${label}`, () => {
  const data = dataFor();
  assert.equal(store.getCenterScheduleStatus(data.centers[data.selectedCenterId], atSantiago(hour, minute)), expected);
});

test("realtime update changes ready config without resubscription", () => {
  const flow = lifecycle();
  flow.login("user", "center-a");
  const binding = flow.transport.bindings[0];
  binding.onSnapshot(projection("center-a"));
  binding.onSnapshot(projection("center-a", { serviceStartTime: "08:30", serviceEndTime: "19:30" }));
  assert.equal(flow.transport.bindings.length, 1);
  assert.equal(flow.active().config.serviceStartTime, "08:30");
  assert.equal(flow.active().config.serviceEndTime, "19:30");
});

test("public projection failure remains duplicate-safe", async () => {
  transaction.projectionFails = true;
  const result = await store.createPriorityArrivalRealtime(
    dataFor(), "representation", "other", "operator-window-1", () => true, atSantiago(12, 0),
  );
  transaction.projectionFails = false;
  assert.equal(result.outcome, "created-public-sync-failed");
  assert.ok(result.createdCase);
  assert.equal(
    result.data.events.slice(0, 2).map((event) => event.action).join(","),
    "priority_created,arrival_created",
  );
});

test("closed, aborted and successful creation have explicit outcomes", async () => {
  const closed = await store.createPriorityArrivalRealtime(
    dataFor(), "representation", "other", "operator-window-1", () => true, atSantiago(6, 59),
  );
  assert.equal(closed.outcome, "center-closed");
  transaction.mode = "abort";
  const aborted = await store.createPriorityArrivalRealtime(
    dataFor(), "representation", "other", "operator-window-1", () => true, atSantiago(12, 0),
  );
  transaction.mode = "commit";
  assert.equal(aborted.outcome, "transaction-not-committed");
  const created = await store.createPriorityArrivalRealtime(
    dataFor(), "representation", "other", "operator-window-1", () => true, atSantiago(12, 0),
  );
  assert.equal(created.outcome, "created");
});
