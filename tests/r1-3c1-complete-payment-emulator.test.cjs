const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { createRequire } = require("node:module");

if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw new Error("FIREBASE_DATABASE_EMULATOR_HOST is required");
const root = path.resolve(__dirname, "..");
const req = createRequire(path.join(root, "functions/package.json"));
const { getDatabase } = req("firebase-admin/database");
let fixtureIndex = 0;
const today = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const call = (fn, centerId, uid, extra = {}) => fn.run({
  data: { centerId, queueItemId: "q", ...extra }, auth: uid ? { uid, token: {} } : undefined, rawRequest: {},
});
const day = (centerId, date, cashierId = "cashier-1", state = "in_cashier_attention") => ({
  metadata: { consecutivePriorityCasesForCashier: 2 },
  cases: { c: {
    caseId: "c", publicToken: "token", centerId, sessionId: `${centerId}-${date}`, publicCode: "V1-01",
    globalArrivalSequence: 1, serviceType: "representation", serviceLabel: "Representación",
    assignedWindowId: "window-1", assignedWindowNumber: 1, assignedOperatorId: null, isPriority: true,
    priorityType: "older_adult", priorityReason: "internal", currentState: state, arrivalAt: 1,
    calledToWindowAt: 2, folderCode: "F1", paymentTicketId: "q", cashierId,
    cashierStartedAt: 10, updatedAt: 10,
  } },
  paymentQueue: { q: {
    queueItemId: "q", centerId, sessionId: `${centerId}-${date}`, caseId: "c", publicCode: "V1-01",
    folderCode: "F1", queueNumber: 1, approvedAt: 3, state, cashierId, updatedAt: 10,
  } },
  events: {},
});
const center = (centerId, commission = 750) => ({
  centerId, enabled: true, timezone: "America/Santiago", serviceStartTime: "00:00", serviceEndTime: "00:01",
  cashierCommissionRate: commission,
  cashiers: {
    "cashier-1": { cashierId: "cashier-1", centerId, name: "Caja 1", cashierName: "Operador Caja Norte", enabled: true },
    "cashier-2": { cashierId: "cashier-2", centerId, name: "Caja 2", cashierName: "Operador Caja Sur", enabled: true },
  },
});
const profile = (uid, centerId, cashierId = "cashier-1", overrides = {}) => ({
  uid, role: "cashier", enabled: true, cashierId, centerIds: [centerId], centerAccess: { [centerId]: true }, ...overrides,
});
const fixture = async (work, options = {}) => {
  const db = getDatabase();
  const centerId = `complete-${process.pid}-${++fixtureIndex}`;
  const uid = `user-${centerId}`;
  const date = today();
  try {
    await db.ref(`centers/${centerId}`).set(center(centerId, options.commission));
    await db.ref(`users/${uid}`).set(profile(uid, centerId));
    await db.ref(`days/${centerId}/${date}`).set(day(centerId, date));
    return await work({ db, centerId, uid, date });
  } finally {
    await db.ref(`centers/${centerId}`).remove();
    await db.ref(`users/${uid}`).remove();
    await db.ref(`days/${centerId}`).remove();
    await db.ref("public/turns/token").remove();
    await db.ref(`public/displays/${centerId}`).remove();
    await db.ref(`public/displayCalls/${centerId}`).remove();
  }
};

const functions = require(path.join(root, "functions/lib/index.js"));
const complete = functions.completeCashierPayment;
test.after(() => getDatabase().goOffline());

test("authorized completion atomically persists case, queue, trusted trace, identity, and fixed CLP commission", () =>
  fixture(async ({ db, centerId, uid, date }) => {
    const result = await call(complete, centerId, uid);
    assert.equal(result.outcome, "completed");
    const persisted = (await db.ref(`days/${centerId}/${date}`).get()).val();
    assert.equal(persisted.cases.c.currentState, "completed");
    assert.equal(persisted.paymentQueue.q.state, "completed");
    assert.equal(persisted.cases.c.cashierNameAtCompletion, "Operador Caja Norte");
    assert.equal(persisted.cases.c.commissionRateApplied, 750);
    assert.equal(persisted.cases.c.commissionAmount, 750);
    assert.equal(persisted.cases.c.publicCode, "V1-01");
    assert.equal(persisted.cases.c.folderCode, "F1");
    assert.equal(persisted.cases.c.paymentTicketId, "q");
    assert.equal(persisted.cases.c.isPriority, true);
    assert.equal(persisted.cases.c.priorityReason, "internal");
    assert.equal(persisted.metadata.consecutivePriorityCasesForCashier, 2);
    const traces = Object.values(persisted.events).filter((event) => event.action === "payment_completed");
    assert.equal(traces.length, 1);
    assert.equal(traces[0].actorId, uid);
    assert.equal(traces[0].cashierId, "cashier-1");
    assert.equal(traces[0].actorRole, "cashier");
  }));

test("successful completion writes completed public turn, clears current display, and creates no display call", () =>
  fixture(async ({ db, centerId, uid, date }) => {
    await db.ref(`public/displays/${centerId}/${date}/c`).set({ publicCode: "V1-01" });
    const result = await call(complete, centerId, uid);
    assert.equal(result.outcome, "completed");
    assert.equal((await db.ref("public/turns/token/status").get()).val(), "Proceso finalizado con éxito");
    assert.equal((await db.ref("public/turns/token/destination").get()).exists(), false);
    assert.equal((await db.ref(`public/displays/${centerId}/${date}/c`).get()).exists(), false);
    assert.equal((await db.ref(`public/displayCalls/${centerId}/${date}`).get()).exists(), false);
  }));

test("active completion remains allowed after configured closing time", () =>
  fixture(async ({ centerId, uid }) => assert.equal((await call(complete, centerId, uid)).outcome, "completed")));

test("unauthenticated request is rejected", () =>
  fixture(async ({ centerId }) => assert.equal((await call(complete, centerId, null)).outcome, "unauthenticated")));

test("disabled profile and wrong role are rejected", () => fixture(async ({ db, centerId, uid }) => {
  await db.ref(`users/${uid}/enabled`).set(false);
  assert.equal((await call(complete, centerId, uid)).outcome, "unauthorized");
  await db.ref(`users/${uid}`).update({ enabled: true, role: "admin" });
  assert.equal((await call(complete, centerId, uid)).outcome, "unauthorized");
}));

test("wrong center access and missing cashierId are rejected", () => fixture(async ({ db, centerId, uid }) => {
  await db.ref(`users/${uid}`).update({ centerIds: ["other"], centerAccess: { other: true } });
  assert.equal((await call(complete, centerId, uid)).outcome, "unauthorized");
  await db.ref(`users/${uid}`).set(profile(uid, centerId, null));
  assert.equal((await call(complete, centerId, uid)).outcome, "unauthorized");
}));

test("unconfigured and disabled cashier stations are rejected", () => fixture(async ({ db, centerId, uid }) => {
  await db.ref(`users/${uid}/cashierId`).set("missing");
  assert.equal((await call(complete, centerId, uid)).outcome, "unauthorized");
  await db.ref(`users/${uid}/cashierId`).set("cashier-1");
  await db.ref(`centers/${centerId}/cashiers/cashier-1/enabled`).set(false);
  assert.equal((await call(complete, centerId, uid)).outcome, "unauthorized");
}));

test("wrong cashier ownership is rejected", () => fixture(async ({ db, centerId, uid, date }) => {
  await db.ref(`users/${uid}/cashierId`).set("cashier-2");
  assert.equal((await call(complete, centerId, uid)).outcome, "unauthorized");
  assert.equal((await db.ref(`days/${centerId}/${date}/cases/c/currentState`).get()).val(), "in_cashier_attention");
}));

test("case and queue state mismatches including paused and completed are rejected", () => fixture(async ({ db, centerId, uid, date }) => {
  for (const state of ["called_to_cashier", "paused", "completed", "waiting_cashier", "no_show", "rejected"]) {
    await db.ref(`days/${centerId}/${date}`).set(day(centerId, date, "cashier-1", state));
    assert.equal((await call(complete, centerId, uid)).outcome, "invalid_case_state");
  }
  await db.ref(`days/${centerId}/${date}`).set(day(centerId, date));
  await db.ref(`days/${centerId}/${date}/paymentQueue/q/state`).set("paused");
  assert.equal((await call(complete, centerId, uid)).outcome, "invalid_case_state");
}));

test("inconsistent case, queue, folder, payment, and public identities are rejected", () => fixture(async ({ db, centerId, uid, date }) => {
  for (const [relative, value] of [["cases/c/paymentTicketId", "other"], ["cases/c/folderCode", "F2"], ["cases/c/publicCode", "V1-99"]]) {
    await db.ref(`days/${centerId}/${date}`).set(day(centerId, date));
    await db.ref(`days/${centerId}/${date}/${relative}`).set(value);
    assert.equal((await call(complete, centerId, uid)).outcome, "invalid_case_state");
  }
}));

test("browser cannot override commission, cashier identity, name, role, or timestamp", () => fixture(async ({ db, centerId, uid, date }) => {
  const result = await call(complete, centerId, uid, {
    commissionRate: 999999, cashierId: "cashier-2", cashierName: "Spoof", role: "admin", timestamp: 1,
  });
  assert.equal(result.outcome, "invalid_request");
  assert.equal((await db.ref(`days/${centerId}/${date}/cases/c/currentState`).get()).val(), "in_cashier_attention");
}));

test("absent commission preserves completion without commission fields", () => fixture(async ({ db, centerId, uid, date }) => {
  await db.ref(`centers/${centerId}/cashierCommissionRate`).remove();
  assert.equal((await call(complete, centerId, uid)).outcome, "completed");
  assert.equal((await db.ref(`days/${centerId}/${date}/cases/c/commissionRateApplied`).get()).exists(), false);
  assert.equal((await db.ref(`days/${centerId}/${date}/cases/c/commissionAmount`).get()).exists(), false);
}));

test("same-cashier concurrent completion has one winner, one trace, and one commission mutation", () =>
  fixture(async ({ db, centerId, uid, date }) => {
    const [a, b] = await Promise.all([call(complete, centerId, uid), call(complete, centerId, uid)]);
    assert.equal([a, b].filter((result) => result.outcome === "completed").length, 1);
    const persisted = (await db.ref(`days/${centerId}/${date}`).get()).val();
    assert.equal(Object.values(persisted.events).filter((event) => event.action === "payment_completed").length, 1);
    assert.equal(persisted.cases.c.commissionAmount, 750);
  }));

test("different-cashier concurrent completion has one authorized winner and no duplicate side effects", () =>
  fixture(async ({ db, centerId, uid, date }) => {
    const uid2 = `${uid}-other`;
    await db.ref(`users/${uid2}`).set(profile(uid2, centerId, "cashier-2"));
    const [a, b] = await Promise.all([call(complete, centerId, uid), call(complete, centerId, uid2)]);
    assert.equal([a, b].filter((result) => result.outcome === "completed").length, 1);
    const persisted = (await db.ref(`days/${centerId}/${date}`).get()).val();
    assert.equal(Object.values(persisted.events).filter((event) => event.action === "payment_completed").length, 1);
    assert.equal(persisted.cases.c.commissionAmount, 750);
    await db.ref(`users/${uid2}`).remove();
  }));

test("projection failure returns typed warning after durable private completion without a second trace", () =>
  fixture(async ({ db, centerId, uid, date }) => {
    await db.ref(`days/${centerId}/${date}/cases/c/publicToken`).set("invalid.token");
    const result = await call(complete, centerId, uid);
    assert.equal(result.outcome, "completed_projection_failed");
    const persisted = (await db.ref(`days/${centerId}/${date}`).get()).val();
    assert.equal(persisted.cases.c.currentState, "completed");
    assert.equal(Object.values(persisted.events).filter((event) => event.action === "payment_completed").length, 1);
  }));
