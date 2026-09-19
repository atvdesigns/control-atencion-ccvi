const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { createRequire } = require("node:module");

if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw new Error("FIREBASE_DATABASE_EMULATOR_HOST is required");
const root = path.resolve(__dirname, "..");
const requireFromFunctions = createRequire(path.join(root, "functions/package.json"));
const { initializeApp, deleteApp } = requireFromFunctions("firebase-admin/app");
const { getDatabase } = requireFromFunctions("firebase-admin/database");
const { runCashierTransaction, applyCallNextCashierMutation, applyStartCashierMutation,
  callNextCashierCase, startCashierAttention } = require(path.join(root, "functions/lib/index.js"));
const projectId = process.env.GCLOUD_PROJECT || "ccvi-r1-3a-emulator";
let appId = 0; let pathId = 0;
const app = () => initializeApp({ projectId, databaseURL: `https://${projectId}-default-rtdb.firebaseio.com` }, `r13a-${process.pid}-${++appId}`);
const pathName = () => `r1-3a/${process.pid}/${++pathId}`;
const dayId = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const caseItem = (id, priority = false, overrides = {}) => ({ caseId: id, publicToken: `token-${id}-${process.pid}`,
  centerId: "center", sessionId: "center-day", publicCode: `V1-${id}`, globalArrivalSequence: Number(id) || 1,
  serviceType: "representation", serviceLabel: "Representación", assignedWindowId: "w1", assignedWindowNumber: 1,
  assignedOperatorId: "operator-window-1", isPriority: priority, currentState: "waiting_cashier", arrivalAt: 1,
  calledToWindowAt: 1, updatedAt: 2, ...overrides });
const queueItem = (id, approvedAt = 1, overrides = {}) => ({ queueItemId: `q-${id}`, centerId: "center",
  sessionId: "center-day", caseId: id, publicCode: `V1-${id}`, folderCode: `F-${id}`, queueNumber: Number(id) || 1,
  approvedAt, state: "waiting_cashier", cashierId: null, ...overrides });
const day = (...items) => ({ metadata: { consecutivePriorityCasesForCashier: 0 },
  cases: Object.fromEntries(items.map(x => [x.caseId, caseItem(x.caseId, x.priority)])),
  paymentQueue: Object.fromEntries(items.map(x => [`q-${x.caseId}`, queueItem(x.caseId, x.approvedAt)])), events: {} });
const context = (cashierId = "cashier-1", overrides = {}) => ({ centerId: "center", sessionId: "center-day",
  cashierId, uid: `user-${cashierId}`, timestamp: Date.now(), eventId: `event-${cashierId}-${Date.now()}`, ...overrides });
const subscribe = ref => (onValue, onError) => { const listener = ref.on("value", snap => onValue(snap.exists()), onError); return () => ref.off("value", listener); };
const transact = ref => async update => { const result = await ref.transaction(value => update(value), undefined, false); return { committed: result.committed }; };
const call = (ref, ctx) => runCashierTransaction(subscribe(ref), transact(ref), day => applyCallNextCashierMutation(day, ctx));
const start = (ref, ctx) => runCashierTransaction(subscribe(ref), transact(ref), day => applyStartCashierMutation(day, ctx));

test.after(() => getDatabase().goOffline());

test("fresh Admin cache hydrates and commits Call Next", async () => {
  const seed = app(); const worker = app(); const name = pathName(); const ref = getDatabase(seed).ref(name);
  try { await ref.set(day({ caseId: "c1", priority: false, approvedAt: 1 }));
    const result = await call(getDatabase(worker).ref(name), context());
    assert.equal(result.status, "called"); assert.equal((await ref.child("paymentQueue/q-c1/cashierId").get()).val(), "cashier-1");
  } finally { await ref.remove(); await Promise.all([deleteApp(seed), deleteApp(worker)]); }
});

test("simultaneous cashiers cannot select the same queue item", async () => {
  const seed = app(); const a = app(); const b = app(); const name = pathName(); const ref = getDatabase(seed).ref(name);
  try { await ref.set(day(
      { caseId: "p1", priority: true, approvedAt: 1 },
      { caseId: "p2", priority: true, approvedAt: 2 },
    ));
    const results = await Promise.all([call(getDatabase(a).ref(name), context("cashier-1")), call(getDatabase(b).ref(name), context("cashier-2"))]);
    assert.equal(results.filter(x => x.status === "called").length, 2);
    assert.equal(new Set(results.map(x => x.committed.caseRecord.caseId)).size, 2);
    assert.equal(Object.keys((await ref.child("events").get()).val()).length, 2);
    assert.equal((await ref.child("metadata/consecutivePriorityCasesForCashier").get()).val(), 2);
  } finally { await ref.remove(); await Promise.all([deleteApp(seed), deleteApp(a), deleteApp(b)]); }
});

test("same cashier simultaneous calls commit one assignment", async () => {
  const seed = app(); const a = app(); const b = app(); const name = pathName(); const ref = getDatabase(seed).ref(name);
  try { await ref.set(day({ caseId: "c1", priority: false, approvedAt: 1 }, { caseId: "c2", priority: false, approvedAt: 2 }));
    const results = await Promise.all([call(getDatabase(a).ref(name), context("cashier-1", { eventId: "same-a" })),
      call(getDatabase(b).ref(name), context("cashier-1", { eventId: "same-b" }))]);
    assert.equal(results.filter(x => x.status === "called").length, 1);
    assert.equal(Object.values((await ref.child("paymentQueue").get()).val()).filter(x => x.cashierId === "cashier-1").length, 1);
  } finally { await ref.remove(); await Promise.all([deleteApp(seed), deleteApp(a), deleteApp(b)]); }
});

for (const scenario of [
  { name: "empty queue", items: [], expected: "queue_empty" },
  { name: "one regular", items: [{ caseId: "r1", priority: false, approvedAt: 1 }], expectedCase: "r1" },
  { name: "one priority", items: [{ caseId: "p1", priority: true, approvedAt: 1 }], expectedCase: "p1" },
  { name: "only priorities beyond limit", items: [{ caseId: "p1", priority: true, approvedAt: 2 }, { caseId: "p2", priority: true, approvedAt: 1 }], counter: 2, expectedCase: "p2" },
  { name: "only regulars", items: [{ caseId: "r1", priority: false, approvedAt: 2 }, { caseId: "r2", priority: false, approvedAt: 1 }], expectedCase: "r2" },
]) test(`Call Next ${scenario.name}`, async () => {
  const worker = app(); const ref = getDatabase(worker).ref(pathName()); const value = day(...scenario.items);
  if (scenario.counter !== undefined) value.metadata.consecutivePriorityCasesForCashier = scenario.counter;
  try { await ref.set(value); const result = await call(ref, context());
    assert.equal(result.status, scenario.expected || "called"); if (scenario.expectedCase) assert.equal(result.committed.caseRecord.caseId, scenario.expectedCase);
  } finally { await ref.remove(); await deleteApp(worker); }
});

test("Call Next FIFO uses approvedAt queueNumber then queueItemId", async () => {
  const worker = app(); const ref = getDatabase(worker).ref(pathName()); const cases = {
    a: caseItem("a", false), b: caseItem("b", false), c: caseItem("c", false),
  }; const queue = {
    z: { ...queueItem("a", 2), queueItemId: "z", queueNumber: 1 },
    y: { ...queueItem("b", 1), queueItemId: "y", queueNumber: 2 },
    x: { ...queueItem("c", 1), queueItemId: "x", queueNumber: 2 },
  };
  try { await ref.set({ metadata: { consecutivePriorityCasesForCashier: 2 }, cases, paymentQueue: queue, events: {} });
    assert.equal((await call(ref, context())).committed.caseRecord.caseId, "c");
  } finally { await ref.remove(); await deleteApp(worker); }
});

test("shared 2P:1R counter produces priority priority regular across different cashiers", async () => {
  const worker = app(); const ref = getDatabase(worker).ref(pathName());
  try { await ref.set(day({ caseId: "p1", priority: true, approvedAt: 1 }, { caseId: "p2", priority: true, approvedAt: 2 },
      { caseId: "r1", priority: false, approvedAt: 0 }));
    const selected = [];
    for (const cashier of ["cashier-1", "cashier-2", "cashier-3"]) selected.push((await call(ref, context(cashier))).committed.caseRecord.caseId);
    assert.deepEqual(selected, ["p1", "p2", "r1"]); assert.equal((await ref.child("metadata/consecutivePriorityCasesForCashier").get()).val(), 0);
  } finally { await ref.remove(); await deleteApp(worker); }
});

test("busy cashier and missing related case are safe no-ops", async () => {
  const worker = app(); const ref = getDatabase(worker).ref(pathName()); const active = day({ caseId: "c1", priority: false, approvedAt: 1 });
  active.cases.c1.currentState = "called_to_cashier"; active.cases.c1.cashierId = "cashier-1";
  active.paymentQueue["q-c1"].state = "called_to_cashier"; active.paymentQueue["q-c1"].cashierId = "cashier-1";
  try { await ref.set(active); assert.equal((await call(ref, context("cashier-1"))).status, "cashier_busy");
    await ref.set({ metadata: { consecutivePriorityCasesForCashier: 0 }, cases: {}, paymentQueue: { q: queueItem("missing", 1) }, events: {} });
    assert.equal((await call(ref, context("cashier-2"))).status, "queue_empty");
  } finally { await ref.remove(); await deleteApp(worker); }
});

test("transaction retry recomputes authoritative FIFO and 2P:1R selection", async () => {
  const worker = app(); const ref = getDatabase(worker).ref(pathName());
  try { const value = day({ caseId: "c1", priority: true, approvedAt: 2 }, { caseId: "c2", priority: false, approvedAt: 1 });
    value.metadata.consecutivePriorityCasesForCashier = 2; await ref.set(value);
    const result = await call(ref, context()); assert.equal(result.committed.caseRecord.caseId, "c2");
  } finally { await ref.remove(); await deleteApp(worker); }
});

test("authoritative concurrent deletion never recreates the day", async () => {
  const worker = app(); const ref = getDatabase(worker).ref(pathName()); let deleted = false;
  try { await ref.set(day({ caseId: "c1", priority: false, approvedAt: 1 }));
    const result = await runCashierTransaction(subscribe(ref), async update => {
      if (!deleted) { deleted = true; await ref.remove(); }
      return transact(ref)(update);
    }, value => applyCallNextCashierMutation(value, context()));
    assert.notEqual(result.status, "called"); assert.equal((await ref.get()).exists(), false);
  } finally { await deleteApp(worker); }
});

test("Start commits only for the authoritative owner", async () => {
  const worker = app(); const ref = getDatabase(worker).ref(pathName()); const value = day({ caseId: "c1", priority: false, approvedAt: 1 });
  value.cases["c1"] = caseItem("c1", false, { currentState: "called_to_cashier", cashierId: "cashier-1" });
  value.paymentQueue["q-c1"] = queueItem("c1", 1, { state: "called_to_cashier", cashierId: "cashier-1" });
  try { await ref.set(value); assert.equal((await start(ref, context("cashier-2", { queueItemId: "q-c1" }))).status, "unauthorized");
    assert.equal((await start(ref, context("cashier-1", { queueItemId: "q-c1" }))).status, "started");
    assert.equal((await ref.child("cases/c1/currentState").get()).val(), "in_cashier_attention");
  } finally { await ref.remove(); await deleteApp(worker); }
});

test("simultaneous Start commits exactly once", async () => {
  const seed = app(); const a = app(); const b = app(); const name = pathName(); const ref = getDatabase(seed).ref(name);
  const value = day({ caseId: "c1", priority: false, approvedAt: 1 });
  value.cases.c1 = caseItem("c1", false, { currentState: "called_to_cashier", cashierId: "cashier-1" });
  value.paymentQueue["q-c1"] = queueItem("c1", 1, { state: "called_to_cashier", cashierId: "cashier-1" });
  try { await ref.set(value); const ctxA = context("cashier-1", { queueItemId: "q-c1", eventId: "start-a" });
    const ctxB = context("cashier-1", { queueItemId: "q-c1", eventId: "start-b" });
    const results = await Promise.all([start(getDatabase(a).ref(name), ctxA), start(getDatabase(b).ref(name), ctxB)]);
    assert.equal(results.filter(result => result.status === "started").length, 1);
    assert.equal(Object.keys((await ref.child("events").get()).val()).length, 1);
  } finally { await ref.remove(); await Promise.all([deleteApp(seed), deleteApp(a), deleteApp(b)]); }
});

test("Start rejects wrong state case queue mismatch and already-started item", async () => {
  const worker = app(); const ref = getDatabase(worker).ref(pathName());
  try { const wrongState = day({ caseId: "c1", priority: false, approvedAt: 1 });
    wrongState.cases.c1.cashierId = "cashier-1"; wrongState.paymentQueue["q-c1"].cashierId = "cashier-1"; await ref.set(wrongState);
    assert.equal((await start(ref, context("cashier-1", { queueItemId: "q-c1" }))).status, "invalid_case_state");
    const called = day({ caseId: "c1", priority: false, approvedAt: 1 }); called.cases.c1.currentState = "called_to_cashier";
    called.cases.c1.cashierId = "cashier-1"; called.paymentQueue["q-c1"].state = "called_to_cashier";
    called.paymentQueue["q-c1"].cashierId = "cashier-1"; called.paymentQueue["q-c1"].caseId = "missing";
    await ref.set(called); assert.equal((await start(ref, context("cashier-1", { queueItemId: "q-c1" }))).status, "case_not_found");
    called.paymentQueue["q-c1"].caseId = "c1"; called.cases.c1.currentState = "in_cashier_attention";
    called.paymentQueue["q-c1"].state = "in_cashier_attention"; await ref.set(called);
    assert.equal((await start(ref, context("cashier-1", { queueItemId: "q-c1" }))).status, "invalid_case_state");
  } finally { await ref.remove(); await deleteApp(worker); }
});

const seedAuthority = async (database, centerId, uid, cashierId = "cashier-1") => {
  await database.ref(`centers/${centerId}`).set({ centerId, shortCode: "CCVI", enabled: true, timezone: "America/Santiago",
    serviceStartTime: "08:00", serviceEndTime: "17:00", windows: {}, cashiers: { [cashierId]: { cashierId, centerId,
      name: "Caja 1", enabled: true, displayOrder: 1 } }, documentaryRequirements: { representation: {} }, paymentMethods: {} });
  await database.ref(`users/${uid}`).set({ uid, role: "cashier", enabled: true, cashierId,
    centerIds: [centerId], centerAccess: { [centerId]: true } });
};

test("production callables enforce authority, work after business hours, and publish Call then Start", async () => {
  const database = getDatabase(); const centerId = `cashier-${process.pid}`; const uid = `cashier-user-${process.pid}`;
  const date = dayId(); const sessionId = `${centerId}-${date}`; const source = caseItem("c9", false, { centerId, sessionId });
  const queue = queueItem("c9", 1, { centerId, sessionId });
  try { await seedAuthority(database, centerId, uid); await database.ref(`days/${centerId}/${date}`).set({
      metadata: { consecutivePriorityCasesForCashier: 0 }, cases: { [source.caseId]: source }, paymentQueue: { [queue.queueItemId]: queue }, events: {} });
    const called = await callNextCashierCase.run({ data: { centerId }, auth: { uid, token: {} }, rawRequest: {} });
    assert.equal(called.outcome, "called"); assert.equal(called.queueItem.cashierId, "cashier-1");
    assert.equal((await database.ref(`public/displayCalls/${centerId}/${date}/${called.event.eventId}`).get()).val().destinationType, "cashier");
    const started = await startCashierAttention.run({ data: { centerId, queueItemId: queue.queueItemId }, auth: { uid, token: {} }, rawRequest: {} });
    assert.equal(started.outcome, "started"); assert.equal((await database.ref(`public/turns/${source.publicToken}/status`).get()).val(), "Atención en caja");
  } finally { await database.ref(`centers/${centerId}`).remove(); await database.ref(`users/${uid}`).remove();
    await database.ref(`days/${centerId}`).remove(); await database.ref(`public/turns/${source.publicToken}`).remove();
    await database.ref(`public/displays/${centerId}`).remove(); await database.ref(`public/displayCalls/${centerId}`).remove(); }
});

test("production callable rejects unauthenticated disabled wrong role cross-center and disabled station", async () => {
  const database = getDatabase(); const centerId = `deny-cashier-${process.pid}`; const uid = `deny-user-${process.pid}`;
  try { await seedAuthority(database, centerId, uid);
    assert.equal((await callNextCashierCase.run({ data: { centerId }, auth: undefined, rawRequest: {} })).outcome, "unauthenticated");
    await database.ref(`users/${uid}/enabled`).set(false); assert.equal((await callNextCashierCase.run({ data: { centerId }, auth: { uid, token: {} }, rawRequest: {} })).outcome, "unauthorized");
    await database.ref(`users/${uid}`).update({ enabled: true, role: "admin" }); assert.equal((await callNextCashierCase.run({ data: { centerId }, auth: { uid, token: {} }, rawRequest: {} })).outcome, "unauthorized");
    await database.ref(`users/${uid}`).update({ role: "cashier", centerIds: ["other"], centerAccess: { other: true } }); assert.equal((await callNextCashierCase.run({ data: { centerId }, auth: { uid, token: {} }, rawRequest: {} })).outcome, "unauthorized");
    await database.ref(`users/${uid}`).update({ centerIds: [centerId], centerAccess: { [centerId]: true } });
    await database.ref(`users/${uid}/cashierId`).remove(); assert.equal((await callNextCashierCase.run({ data: { centerId }, auth: { uid, token: {} }, rawRequest: {} })).outcome, "unauthorized");
    await database.ref(`users/${uid}/cashierId`).set("unconfigured"); assert.equal((await callNextCashierCase.run({ data: { centerId }, auth: { uid, token: {} }, rawRequest: {} })).outcome, "unauthorized");
    await database.ref(`users/${uid}/cashierId`).set("cashier-1"); await database.ref(`centers/${centerId}/enabled`).set(false);
    assert.equal((await callNextCashierCase.run({ data: { centerId }, auth: { uid, token: {} }, rawRequest: {} })).outcome, "config_unavailable");
    await database.ref(`centers/${centerId}/enabled`).set(true);
    await database.ref(`centers/${centerId}/cashiers/cashier-1/enabled`).set(false); assert.equal((await callNextCashierCase.run({ data: { centerId }, auth: { uid, token: {} }, rawRequest: {} })).outcome, "unauthorized");
  } finally { await database.ref(`centers/${centerId}`).remove(); await database.ref(`users/${uid}`).remove(); }
});

test("projection failures preserve private Call and Start commits with typed warnings", async () => {
  const database = getDatabase(); const centerId = `projection-cashier-${process.pid}`; const uid = `projection-user-${process.pid}`;
  const date = dayId(); const sessionId = `${centerId}-${date}`; const source = caseItem("cp", false, {
    centerId, sessionId, publicToken: "invalid.token",
  }); const queue = queueItem("cp", 1, { centerId, sessionId });
  try { await seedAuthority(database, centerId, uid); await database.ref(`days/${centerId}/${date}`).set({
      metadata: { consecutivePriorityCasesForCashier: 0 }, cases: { cp: source }, paymentQueue: { [queue.queueItemId]: queue }, events: {} });
    const called = await callNextCashierCase.run({ data: { centerId }, auth: { uid, token: {} }, rawRequest: {} });
    assert.equal(called.outcome, "called_projection_failed");
    assert.equal((await database.ref(`days/${centerId}/${date}/cases/cp/currentState`).get()).val(), "called_to_cashier");
    const started = await startCashierAttention.run({ data: { centerId, queueItemId: queue.queueItemId }, auth: { uid, token: {} }, rawRequest: {} });
    assert.equal(started.outcome, "started_projection_failed");
    assert.equal((await database.ref(`days/${centerId}/${date}/cases/cp/currentState`).get()).val(), "in_cashier_attention");
  } finally { await database.ref(`centers/${centerId}`).remove(); await database.ref(`users/${uid}`).remove();
    await database.ref(`days/${centerId}`).remove(); }
});
