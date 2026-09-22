const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { createRequire } = require("node:module");

if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw new Error("FIREBASE_DATABASE_EMULATOR_HOST is required");
const root = path.resolve(__dirname, "..");
const requireFromFunctions = createRequire(path.join(root, "functions/package.json"));
const { getDatabase } = requireFromFunctions("firebase-admin/database");
const functions = require(path.join(root, "functions/lib/index.js"));
const database = getDatabase();
const today = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const windows = {
  w1: { windowId: "w1", windowNumber: 1, serviceType: "representation", serviceLabel: "Representación",
    validationLevel: "enhanced", publicCodePrefix: "V1", enabled: true, displayOrder: 1 },
  w2: { windowId: "w2", windowNumber: 2, serviceType: "vehicle_owner", serviceLabel: "Propietario",
    validationLevel: "standard", publicCodePrefix: "V2", enabled: true, displayOrder: 2 },
};
const center = id => ({ centerId: id, shortCode: "CCVI", enabled: true, timezone: "America/Santiago",
  serviceStartTime: "00:00", serviceEndTime: "23:59", windows,
  cashiers: { c1: { cashierId: "c1", centerId: id, name: "Caja 1", enabled: true, displayOrder: 1 } },
  documentaryRequirements: { representation: {}, vehicle_owner: {} }, paymentMethods: {} });
const auth = uid => ({ uid, token: {} });
const invoke = (callable, data, uid) => callable.run({ data, auth: uid ? auth(uid) : undefined, rawRequest: {} });

const cleanup = async (centerId, uids = []) => {
  await Promise.all([
    database.ref(`centers/${centerId}`).remove(), database.ref(`days/${centerId}`).remove(),
    database.ref(`public/displays/${centerId}`).remove(), database.ref(`public/displayCalls/${centerId}`).remove(),
    ...uids.map(uid => database.ref(`users/${uid}`).remove()),
  ]);
};

test.after(() => database.goOffline());

test("kiosk command replays sequentially and concurrently without a second case", async () => {
  const centerId = `idem-kiosk-${process.pid}`; const commandId = randomUUID();
  try {
    await database.ref(`centers/${centerId}`).set(center(centerId));
    const data = { centerId, serviceType: "representation", commandId };
    const first = await invoke(functions.createKioskArrival, data);
    const [second, third] = await Promise.all([
      invoke(functions.createKioskArrival, data), invoke(functions.createKioskArrival, data),
    ]);
    assert.deepEqual(second, first); assert.deepEqual(third, first);
    const day = (await database.ref(`days/${centerId}/${today()}`).get()).val();
    assert.equal(Object.keys(day.cases).length, 1); assert.equal(Object.keys(day.events).length, 1);
    assert.equal(day.metadata.windowSequences.w1, 1); assert.equal(Object.keys(day.commandReceipts).length, 1);
    await assert.rejects(() => invoke(functions.createKioskArrival,
      { centerId, serviceType: "vehicle_owner", commandId }), error => error.code === "already-exists");
    await invoke(functions.createKioskArrival, { centerId, serviceType: "representation", commandId: randomUUID() });
    assert.equal(Object.keys((await database.ref(`days/${centerId}/${today()}/cases`).get()).val()).length, 2);
  } finally { await cleanup(centerId); }
});

test("priority command replays original case and rejects incompatible context", async () => {
  const centerId = `idem-priority-${process.pid}`; const uid = `priority-${process.pid}`; const commandId = randomUUID();
  try {
    await database.ref(`centers/${centerId}`).set(center(centerId));
    await database.ref(`users/${uid}`).set({ uid, role: "operator-window-1", enabled: true,
      centerIds: [centerId], centerAccess: { [centerId]: true }, windowId: "w1" });
    const data = { centerId, priorityType: "other", commandId };
    const [first, second] = await Promise.all([
      invoke(functions.createPriorityArrival, data, uid), invoke(functions.createPriorityArrival, data, uid),
    ]);
    assert.equal(first.createdCase.caseId, second.createdCase.caseId);
    const day = (await database.ref(`days/${centerId}/${today()}`).get()).val();
    assert.equal(Object.keys(day.cases).length, 1); assert.equal(Object.keys(day.events).length, 2);
    assert.equal(day.metadata.windowSequences.w1, 1);
    const conflict = await invoke(functions.createPriorityArrival,
      { centerId, priorityType: "pregnant", commandId }, uid);
    assert.equal(conflict.outcome, "idempotency_conflict");
    await invoke(functions.createPriorityArrival, { centerId, priorityType: "other", commandId: randomUUID() }, uid);
    assert.equal(Object.keys((await database.ref(`days/${centerId}/${today()}/cases`).get()).val()).length, 2);
  } finally { await cleanup(centerId, [uid]); }
});

const waitingCase = (centerId, sessionId, id, windowId = "w1") => ({ caseId: id, publicToken: randomUUID(),
  centerId, sessionId, publicCode: `V1-${id}`, globalArrivalSequence: Number(id.replace(/\D/g, "")) || 1,
  publicSequence: Number(id.replace(/\D/g, "")) || 1,
  serviceType: "representation", serviceLabel: "Representación", validationLevel: "enhanced",
  assignedWindowId: windowId, assignedWindowNumber: 1, assignedOperatorId: null, isPriority: false,
  currentState: "waiting_document_validation", arrivalAt: Number(id.replace(/\D/g, "")) || 1,
  updatedAt: Number(id.replace(/\D/g, "")) || 1 });

test("window retry replays case A after it advances and never calls case B", async () => {
  const centerId = `idem-window-${process.pid}`; const uid = `window-${process.pid}`; const dayId = today();
  const sessionId = `${centerId}-${dayId}`; const commandId = randomUUID();
  try {
    await database.ref(`centers/${centerId}`).set(center(centerId));
    await database.ref(`users/${uid}`).set({ uid, role: "operator-window-1", enabled: true,
      centerIds: [centerId], centerAccess: { [centerId]: true }, windowId: "w1" });
    await database.ref(`days/${centerId}/${dayId}`).set({ metadata: { status: "open",
      consecutivePriorityCasesByWindow: { w1: 0 } }, cases: {
      c1: waitingCase(centerId, sessionId, "c1"), c2: waitingCase(centerId, sessionId, "c2"),
    }, events: {} });
    const data = { centerId, windowId: "w1", commandId };
    const [first, concurrentReplay] = await Promise.all([
      invoke(functions.callNextWindowCase, data, uid), invoke(functions.callNextWindowCase, data, uid),
    ]);
    assert.equal(concurrentReplay.publicCode, first.publicCode);
    await database.ref(`days/${centerId}/${dayId}/cases/c1/currentState`).set("waiting_cashier");
    const replay = await invoke(functions.callNextWindowCase, data, uid);
    assert.equal(replay.publicCode, first.publicCode);
    const day = (await database.ref(`days/${centerId}/${dayId}`).get()).val();
    assert.equal(day.cases.c2.currentState, "waiting_document_validation");
    assert.equal(Object.keys(day.events).length, 1);
    const next = await invoke(functions.callNextWindowCase, { ...data, commandId: randomUUID() }, uid);
    assert.equal(next.publicCode, "V1-c2");
  } finally { await cleanup(centerId, [uid]); }
});

test("cashier retry replays the original queue selection after it advances", async () => {
  const centerId = `idem-cashier-${process.pid}`; const uid = `cashier-${process.pid}`; const dayId = today();
  const sessionId = `${centerId}-${dayId}`; const commandId = randomUUID();
  const cases = { a: { ...waitingCase(centerId, sessionId, "1"), caseId: "a", publicToken: "invalid.token", currentState: "waiting_cashier" },
    b: { ...waitingCase(centerId, sessionId, "2"), caseId: "b", currentState: "waiting_cashier" } };
  const queue = Object.fromEntries(["a", "b"].map((id, index) => [`q-${id}`, { queueItemId: `q-${id}`, centerId,
    sessionId, caseId: id, publicCode: cases[id].publicCode, folderCode: `F-${id}`, queueNumber: index + 1,
    approvedAt: index + 1, state: "waiting_cashier", cashierId: null }]));
  try {
    await database.ref(`centers/${centerId}`).set(center(centerId));
    await database.ref(`users/${uid}`).set({ uid, role: "cashier", enabled: true, cashierId: "c1",
      centerIds: [centerId], centerAccess: { [centerId]: true } });
    await database.ref(`days/${centerId}/${dayId}`).set({ metadata: { status: "open",
      consecutivePriorityCasesForCashier: 0 }, cases, paymentQueue: queue, events: {} });
    const data = { centerId, commandId };
    const [first, concurrentReplay] = await Promise.all([
      invoke(functions.callNextCashierCase, data, uid), invoke(functions.callNextCashierCase, data, uid),
    ]);
    assert.equal(first.outcome, "called_projection_failed");
    assert.equal(concurrentReplay.caseRecord.caseId, first.caseRecord.caseId);
    await database.ref(`days/${centerId}/${dayId}`).update({
      [`cases/${first.caseRecord.caseId}/currentState`]: "completed",
      [`paymentQueue/${first.queueItem.queueItemId}/state`]: "completed",
    });
    const replay = await invoke(functions.callNextCashierCase, data, uid);
    assert.equal(replay.caseRecord.caseId, first.caseRecord.caseId);
    assert.equal(replay.outcome, "called_projection_failed");
    const day = (await database.ref(`days/${centerId}/${dayId}`).get()).val();
    assert.equal(day.paymentQueue["q-b"].state, "waiting_cashier");
    assert.equal(Object.keys(day.events).length, 1);
    const next = await invoke(functions.callNextCashierCase, { centerId, commandId: randomUUID() }, uid);
    assert.equal(next.caseRecord.caseId, "b");
  } finally { await cleanup(centerId, [uid]); }
});
