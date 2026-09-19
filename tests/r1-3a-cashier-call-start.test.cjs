const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const lib = require(path.resolve(__dirname, "../functions/lib/index.js"));

let id = 0;
const caseItem = (name, priority, overrides = {}) => ({
  caseId: name, publicToken: `token-${name}`, centerId: "center", sessionId: "center-day",
  publicCode: `V1-${String(++id).padStart(2, "0")}`, globalArrivalSequence: id,
  serviceType: "representation", serviceLabel: "Representación", assignedWindowId: "w1",
  assignedWindowNumber: 1, assignedOperatorId: "operator-window-1", isPriority: priority,
  currentState: "waiting_cashier", arrivalAt: id, calledToWindowAt: 1, updatedAt: 2, ...overrides,
});
const queueItem = (name, approvedAt, queueNumber, overrides = {}) => ({
  queueItemId: `queue-${name}`, centerId: "center", sessionId: "center-day", caseId: name,
  publicCode: `V1-${queueNumber}`, folderCode: `F-${queueNumber}`, queueNumber, approvedAt,
  state: "waiting_cashier", cashierId: null, ...overrides,
});
const context = (overrides = {}) => ({ centerId: "center", sessionId: "center-day", cashierId: "cashier-1",
  uid: "cashier-user", timestamp: 1000, eventId: "event-1", ...overrides });

test("authority binds enabled Cashier profile to configured station", () => {
  const profile = { uid: "cashier-user", role: "cashier", enabled: true, centerIds: ["center"],
    centerAccess: { center: true }, cashierId: "cashier-1" };
  const stations = [{ cashierId: "cashier-1", centerId: "center", name: "Caja 1", enabled: true, displayOrder: 1 }];
  assert.equal(lib.authorizeCashierStation(profile, "cashier-user", "center", stations).cashierId, "cashier-1");
  assert.equal(lib.authorizeCashierStation({ ...profile, role: "admin" }, "cashier-user", "center", stations), null);
  assert.equal(lib.authorizeCashierStation({ ...profile, enabled: false }, "cashier-user", "center", stations), null);
  assert.equal(lib.authorizeCashierStation(profile, "cashier-user", "other", stations), null);
});

test("FIFO tie breakers and 2P:1R scheduler are preserved", () => {
  const cases = { p1: caseItem("p1", true), p2: caseItem("p2", true), r1: caseItem("r1", false), r2: caseItem("r2", false) };
  const queue = { p1: queueItem("p1", 10, 2), p2: queueItem("p2", 10, 1), r1: queueItem("r1", 5, 2), r2: queueItem("r2", 5, 1) };
  assert.equal(lib.selectNextCashierQueueItem(cases, queue, "center", "center-day", 0).caseId, "p2");
  assert.equal(lib.selectNextCashierQueueItem(cases, queue, "center", "center-day", 2).caseId, "r2");
});

test("Call Next mutates case queue shared counter and one trace atomically", () => {
  const current = caseItem("p1", true); const queue = queueItem("p1", 1, 1);
  const result = lib.applyCallNextCashierMutation({ metadata: { consecutivePriorityCasesForCashier: 1 },
    cases: { p1: current }, paymentQueue: { [queue.queueItemId]: queue }, events: {} }, context());
  assert.equal(result.status, "called"); assert.equal(result.day.metadata.consecutivePriorityCasesForCashier, 2);
  assert.equal(result.committed.caseRecord.currentState, "called_to_cashier");
  assert.equal(result.committed.queueItem.cashierId, "cashier-1"); assert.equal(Object.keys(result.day.events).length, 1);
});

test("busy and empty Call Next are typed no-ops", () => {
  const active = queueItem("a", 1, 1, { state: "called_to_cashier", cashierId: "cashier-1" });
  const activeCase = caseItem("a", false, { currentState: "called_to_cashier", cashierId: "cashier-1" });
  assert.equal(lib.applyCallNextCashierMutation({ cases: { a: activeCase }, paymentQueue: { a: active } }, context()).status, "cashier_busy");
  assert.equal(lib.applyCallNextCashierMutation({ cases: {}, paymentQueue: {} }, context()).status, "queue_empty");
});

test("Start requires authoritative ownership and preserves counter", () => {
  const current = caseItem("a", false, { currentState: "called_to_cashier", cashierId: "cashier-1" });
  const queue = queueItem("a", 1, 1, { state: "called_to_cashier", cashierId: "cashier-1" });
  const day = { metadata: { consecutivePriorityCasesForCashier: 2 }, cases: { a: current }, paymentQueue: { q: queue }, events: {} };
  const result = lib.applyStartCashierMutation(day, context({ queueItemId: "q" }));
  assert.equal(result.status, "started"); assert.equal(result.committed.caseRecord.currentState, "in_cashier_attention");
  assert.deepEqual(result.day.metadata, day.metadata);
  assert.equal(lib.applyStartCashierMutation(day, context({ queueItemId: "q", cashierId: "cashier-2" })).status, "unauthorized");
});

test("authoritative listener is detached on success and transaction failure", async () => {
  let detached = 0;
  const subscribe = (onValue) => { onValue(true); return () => { detached += 1; }; };
  const mutation = () => ({ status: "queue_empty", day: undefined, committed: null });
  await lib.runCashierTransaction(subscribe, async update => { update({}); return { committed: false }; }, mutation);
  assert.equal(detached, 1);
  await assert.rejects(() => lib.runCashierTransaction(subscribe, async () => { throw new Error("forced"); }, mutation));
  assert.equal(detached, 2);
});
