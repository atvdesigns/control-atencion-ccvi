const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { createRequire } = require("node:module");

if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw new Error("FIREBASE_DATABASE_EMULATOR_HOST is required");
const root = path.resolve(__dirname, "..");
const requireFromFunctions = createRequire(path.join(root, "functions/package.json"));
const { initializeApp, deleteApp } = requireFromFunctions("firebase-admin/app");
const { getDatabase } = requireFromFunctions("firebase-admin/database");
const {
  runReassignWindowCaseTransaction, runCallNextWindowTransaction, reassignWindowCase,
  callNextWindowCase, executeReassignWindowCase,
} = require(path.join(root, "functions/lib/index.js"));
const projectId = process.env.GCLOUD_PROJECT || "ccvi-r1-2c2-emulator";
test.after(() => getDatabase().goOffline());
let appId = 0; let pathId = 0; let eventId = 0;
const app = () => initializeApp({ projectId, databaseURL: `https://${projectId}-default-rtdb.firebaseio.com` }, `r12c2-${process.pid}-${++appId}`);
const pathName = () => `r1-2c2/${process.pid}/${++pathId}`;
const dayId = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const windows = {
  w1: { windowId: "w1", windowNumber: 1, serviceType: "representation", serviceLabel: "Representación", validationLevel: "enhanced", publicCodePrefix: "V1", enabled: true, displayOrder: 1 },
  w2: { windowId: "w2", windowNumber: 2, serviceType: "vehicle_owner", serviceLabel: "Propietario", validationLevel: "standard", publicCodePrefix: "V2", enabled: true, displayOrder: 2 },
};
const item = (caseId = "case-1", overrides = {}) => ({
  caseId, publicToken: `token-${caseId}`, centerId: "center", sessionId: "center-day",
  publicCode: `V1-${caseId}`, globalArrivalSequence: 10, arrivalAt: 10, serviceType: "representation",
  serviceLabel: "Representación", validationLevel: "enhanced", assignedWindowId: "w1", assignedWindowNumber: 1,
  assignedOperatorId: "operator-window-1", isPriority: false, priorityType: null,
  currentState: "in_document_validation", calledToWindowAt: 5, documentValidationStartedAt: 7, updatedAt: 7,
  ...overrides,
});
const day = (...cases) => ({ metadata: { consecutivePriorityCasesByWindow: { w1: 1, w2: 2 } }, cases: Object.fromEntries(cases.map(x => [x.caseId, x])), events: {} });
const reassignContext = (overrides = {}) => ({ centerId: "center", sessionId: "center-day", caseId: "case-1", sourceWindow: windows.w1, destinationWindow: windows.w2, role: "operator-window-1", uid: "uid-1", timestamp: 100 + ++eventId, eventId: `reassign-${eventId}`, ...overrides });
const callContext = (overrides = {}) => ({ centerId: "center", sessionId: "center-day", windowId: "w2", role: "operator-window-2", uid: "uid-2", timestamp: 500 + ++eventId, eventId: `call-${eventId}`, ...overrides });
const subscribe = reference => (onValue, onError) => { const listener = reference.on("value", snap => onValue(snap.exists()), onError); return () => reference.off("value", listener); };
const transact = reference => async update => { const tx = await reference.transaction(value => update(value), undefined, false); return { committed: tx.committed, value: tx.snapshot.val() }; };
const reassign = (reference, ctx = reassignContext()) => runReassignWindowCaseTransaction(subscribe(reference), transact(reference), ctx);
const callNext = (reference, ctx = callContext()) => runCallNextWindowTransaction(subscribe(reference), transact(reference), ctx);
const cleanup = async (apps, reference) => { await reference.remove(); await Promise.all(apps.map(deleteApp)); };

test("fresh Admin cache reassigns atomically and preserves identity", async () => {
  const seed = app(); const worker = app(); const name = pathName(); const ref = getDatabase(seed).ref(name);
  try {
    const original = item(); await ref.set(day(original));
    const result = await reassign(getDatabase(worker).ref(name)); const value = (await ref.get()).val(); const changed = value.cases["case-1"];
    assert.equal(result.status, "reassigned"); assert.equal(changed.publicCode, original.publicCode); assert.equal(changed.arrivalAt, original.arrivalAt);
    assert.equal(changed.operationalReassignmentQueuedAt, 101); assert.equal(Object.keys(value.events).length, 1);
  } finally { await cleanup([seed, worker], ref); }
});

test("two simultaneous reassignments of the same case commit once", async () => {
  const seed = app(); const a = app(); const b = app(); const name = pathName(); const ref = getDatabase(seed).ref(name);
  try {
    await ref.set(day(item()));
    const results = await Promise.all([reassign(getDatabase(a).ref(name)), reassign(getDatabase(b).ref(name))]);
    const value = (await ref.get()).val(); assert.equal(results.filter(x => x.status === "reassigned").length, 1); assert.equal(Object.keys(value.events).length, 1);
  } finally { await cleanup([seed, a, b], ref); }
});

test("reassignment competing with state change has one authoritative winner", async () => {
  const seed = app(); const worker = app(); const name = pathName(); const ref = getDatabase(seed).ref(name);
  try {
    await ref.set(day(item()));
    await Promise.all([
      reassign(getDatabase(worker).ref(name)),
      ref.transaction(value => { if (value?.cases?.["case-1"]?.currentState !== "in_document_validation") return; value.cases["case-1"].currentState = "rejected"; return value; }, undefined, false),
    ]);
    const value = (await ref.get()).val(); assert.ok(["waiting_document_validation", "rejected"].includes(value.cases["case-1"].currentState)); assert.ok(Object.keys(value.events || {}).length <= 1);
  } finally { await cleanup([seed, worker], ref); }
});

test("concurrent deletion never recreates reassigned case or day", async () => {
  const worker = app(); const ref = getDatabase(worker).ref(pathName());
  try {
    await ref.set(day(item())); let deleted = false;
    const result = await runReassignWindowCaseTransaction(subscribe(ref), async update => { if (!deleted) { deleted = true; await ref.remove(); } return transact(ref)(update); }, reassignContext());
    assert.equal(result.status, "case_not_found"); assert.equal((await ref.get()).exists(), false);
  } finally { await deleteApp(worker); }
});

test("two simultaneous Call Next requests consume one transfer once", async () => {
  const seed = app(); const a = app(); const b = app(); const name = pathName(); const ref = getDatabase(seed).ref(name);
  const transferred = item("transfer", { assignedWindowId: "w2", assignedWindowNumber: 2, serviceType: "vehicle_owner", currentState: "waiting_document_validation", assignedOperatorId: null, operationalReassignmentQueuedAt: 20 });
  try {
    await ref.set(day(transferred)); const results = await Promise.all([callNext(getDatabase(a).ref(name)), callNext(getDatabase(b).ref(name))]);
    const value = (await ref.get()).val(); assert.equal(results.filter(x => x.status === "called").length, 1);
    assert.equal(value.cases.transfer.operationalReassignmentQueuedAt ?? null, null); assert.equal(Object.keys(value.events).length, 1);
  } finally { await cleanup([seed, a, b], ref); }
});

test("transfer FIFO precedes preferential and regular and leaves P/R counter unchanged", async () => {
  const worker = app(); const ref = getDatabase(worker).ref(pathName());
  const makeWaiting = (id, overrides) => item(id, { assignedWindowId: "w2", assignedWindowNumber: 2, serviceType: "vehicle_owner", currentState: "waiting_document_validation", assignedOperatorId: null, ...overrides });
  try {
    await ref.set(day(makeWaiting("new", { operationalReassignmentQueuedAt: 30 }), makeWaiting("old", { operationalReassignmentQueuedAt: 20 }), makeWaiting("priority", { isPriority: true, arrivalAt: 1 }), makeWaiting("regular", { arrivalAt: 2 })));
    const before = (await ref.child("metadata/consecutivePriorityCasesByWindow/w2").get()).val(); const result = await callNext(ref); const after = (await ref.child("metadata/consecutivePriorityCasesByWindow/w2").get()).val();
    assert.equal(result.caseId, "old"); assert.equal(after, before);
  } finally { await cleanup([worker], ref); }
});

test("regular and preferential transfers preserve priority and do not consume P/R state", async () => {
  for (const priority of [false, true]) {
    const worker = app(); const ref = getDatabase(worker).ref(pathName());
    try {
      await ref.set(day(item("transfer", { assignedWindowId: "w2", assignedWindowNumber: 2, serviceType: "vehicle_owner", currentState: "waiting_document_validation", assignedOperatorId: null, isPriority: priority, priorityType: priority ? "older_adult" : null, operationalReassignmentQueuedAt: 20 })));
      await callNext(ref); const value = (await ref.get()).val(); assert.equal(value.cases.transfer.isPriority, priority); assert.equal(value.metadata.consecutivePriorityCasesByWindow.w2, 2);
    } finally { await cleanup([worker], ref); }
  }
});

const seedAuthority = async (database, centerId, uid, role = "operator-window-1", allowed = true, destinationEnabled = true) => {
  await database.ref(`centers/${centerId}`).set({ centerId, enabled: true, timezone: "America/Santiago", serviceStartTime: "23:58", serviceEndTime: "23:59", windows: { ...windows, w2: { ...windows.w2, enabled: destinationEnabled } }, documentaryRequirements: { representation: {}, vehicle_owner: {} }, paymentMethods: {} });
  await database.ref(`users/${uid}`).set({ uid, role, enabled: true, centerIds: allowed ? [centerId] : [], centerAccess: allowed ? { [centerId]: true } : {} });
};

test("production callable authorizes, works after closing, projects and removes display", async () => {
  const database = getDatabase(); const centerId = `reassign-${process.pid}`; const uid = `uid-${process.pid}`; const currentDay = dayId();
  try {
    await seedAuthority(database, centerId, uid); const source = item("case-1", { centerId, sessionId: `${centerId}-${currentDay}`, publicToken: `token-${process.pid}` });
    await database.ref(`days/${centerId}/${currentDay}`).set(day(source)); await database.ref(`public/displays/${centerId}/${currentDay}/cases/case-1`).set({ publicCode: source.publicCode });
    const result = await reassignWindowCase.run({ data: { centerId, caseId: "case-1", destinationWindowId: "w2" }, auth: { uid, token: {} }, rawRequest: {} });
    assert.equal(result.outcome, "reassigned"); assert.equal(result.caseRecord.assignedWindowId, "w2");
    assert.equal((await database.ref(`public/turns/${source.publicToken}/destination`).get()).val(), "Ventanilla 2"); assert.equal((await database.ref(`public/displays/${centerId}/${currentDay}/cases/case-1`).get()).exists(), false);
  } finally { await database.ref(`centers/${centerId}`).remove(); await database.ref(`users/${uid}`).remove(); await database.ref(`days/${centerId}`).remove(); await database.ref(`public/turns/token-${process.pid}`).remove(); await database.ref(`public/displays/${centerId}`).remove(); }
});

test("production callable rejects same, disabled, wrong-center and wrong-role destinations", async () => {
  const database = getDatabase(); const centerId = `deny-${process.pid}`; const uid = `deny-uid-${process.pid}`; const currentDay = dayId();
  try {
    await seedAuthority(database, centerId, uid); const source = item("case-1", { centerId, sessionId: `${centerId}-${currentDay}` }); await database.ref(`days/${centerId}/${currentDay}`).set(day(source));
    const invoke = data => reassignWindowCase.run({ data, auth: { uid, token: {} }, rawRequest: {} });
    assert.equal((await invoke({ centerId, caseId: "case-1", destinationWindowId: "w1" })).outcome, "invalid_destination");
    await database.ref(`centers/${centerId}/windows/w2/enabled`).set(false); assert.equal((await invoke({ centerId, caseId: "case-1", destinationWindowId: "w2" })).outcome, "invalid_destination");
    await database.ref(`users/${uid}/role`).set("cashier"); assert.equal((await invoke({ centerId, caseId: "case-1", destinationWindowId: "w2" })).outcome, "unauthorized");
  } finally { await database.ref(`centers/${centerId}`).remove(); await database.ref(`users/${uid}`).remove(); await database.ref(`days/${centerId}`).remove(); }
});

test("E1-A actual callable rejects a center-a user targeting a center-b case without mutation", async () => {
  const database = getDatabase();
  const centerA = `e1-center-a-${process.pid}`; const centerB = `e1-center-b-${process.pid}`;
  const uid = `e1-center-a-user-${process.pid}`; const currentDay = dayId();
  const target = item("cross-center", {
    centerId: centerB, sessionId: `${centerB}-${currentDay}`, publicToken: `cross-token-${process.pid}`,
  });
  try {
    await seedAuthority(database, centerA, uid);
    await database.ref(`centers/${centerB}`).set({
      centerId: centerB, enabled: true, timezone: "America/Santiago",
      serviceStartTime: "00:00", serviceEndTime: "23:59", windows,
      documentaryRequirements: { representation: {}, vehicle_owner: {} }, paymentMethods: {},
    });
    await database.ref(`days/${centerB}/${currentDay}`).set(day(target));
    const before = (await database.ref(`days/${centerB}/${currentDay}`).get()).val();
    const result = await reassignWindowCase.run({
      data: { centerId: centerB, caseId: target.caseId, destinationWindowId: "w2" },
      auth: { uid, token: {} }, rawRequest: {},
    });
    const after = (await database.ref(`days/${centerB}/${currentDay}`).get()).val();
    assert.notEqual(centerA, centerB); assert.equal(result.outcome, "unauthorized");
    assert.deepEqual(after, before); assert.equal(after.cases[target.caseId].operationalReassignmentQueuedAt, undefined);
    assert.equal(Object.keys(after.events || {}).length, 0);
    assert.equal((await database.ref(`public/turns/${target.publicToken}`).get()).exists(), false);
    assert.equal((await database.ref(`days/${centerA}`).get()).exists(), false);
  } finally {
    await database.ref(`centers/${centerA}`).remove(); await database.ref(`centers/${centerB}`).remove();
    await database.ref(`users/${uid}`).remove(); await database.ref(`days/${centerA}`).remove();
    await database.ref(`days/${centerB}`).remove(); await database.ref(`public/turns/${target.publicToken}`).remove();
    await database.ref(`public/displays/${centerB}`).remove();
  }
});

test("E1-B actual Call Next resumes 2P:1R from the unchanged counter after transfer", async () => {
  const database = getDatabase(); const centerId = `e1-scheduler-${process.pid}`;
  const uid = `e1-w2-${process.pid}`; const currentDay = dayId(); const sessionId = `${centerId}-${currentDay}`;
  const waiting = (caseId, overrides = {}) => item(caseId, {
    centerId, sessionId, publicToken: `${caseId}-token-${process.pid}`,
    publicCode: `V2-${caseId}`, assignedWindowId: "w2", assignedWindowNumber: 2,
    serviceType: "vehicle_owner", serviceLabel: "Propietario", validationLevel: "standard",
    assignedOperatorId: null, currentState: "waiting_document_validation",
    calledToWindowAt: null, documentValidationStartedAt: null, ...overrides,
  });
  const transfer = waiting("T", { arrivalAt: 40, globalArrivalSequence: 40, operationalReassignmentQueuedAt: 10 });
  const p1 = waiting("P1", { arrivalAt: 20, globalArrivalSequence: 20, isPriority: true, priorityType: "older_adult" });
  const p2 = waiting("P2", { arrivalAt: 30, globalArrivalSequence: 30, isPriority: true, priorityType: "pregnant" });
  const regular = waiting("R1", { arrivalAt: 15, globalArrivalSequence: 15, isPriority: false, priorityType: null });
  const dayRef = database.ref(`days/${centerId}/${currentDay}`);
  const invoke = () => callNextWindowCase.run({ data: { centerId, windowId: "w2" }, auth: { uid, token: {} }, rawRequest: {} });
  try {
    await seedAuthority(database, centerId, uid, "operator-window-2");
    await dayRef.set({ ...day(transfer, p1, p2, regular), metadata: { consecutivePriorityCasesByWindow: { w1: 0, w2: 1 } } });
    const first = await invoke(); let persisted = (await dayRef.get()).val();
    assert.equal(first.publicCode, transfer.publicCode); assert.equal(persisted.cases.T.currentState, "called_to_window");
    assert.equal(persisted.cases.T.operationalReassignmentQueuedAt, undefined);
    assert.equal(persisted.metadata.consecutivePriorityCasesByWindow.w2, 1);
    await dayRef.child("cases/T").update({ currentState: "no_show", updatedAt: 600 });

    const second = await invoke(); persisted = (await dayRef.get()).val();
    assert.equal(second.publicCode, p1.publicCode); assert.equal(persisted.metadata.consecutivePriorityCasesByWindow.w2, 2);
    await dayRef.child("cases/P1").update({ currentState: "no_show", updatedAt: 700 });

    const third = await invoke(); persisted = (await dayRef.get()).val();
    assert.equal(third.publicCode, regular.publicCode); assert.equal(persisted.metadata.consecutivePriorityCasesByWindow.w2, 0);
    assert.equal(persisted.cases.P2.currentState, "waiting_document_validation");
  } finally {
    await database.ref(`centers/${centerId}`).remove(); await database.ref(`users/${uid}`).remove();
    await database.ref(`days/${centerId}`).remove();
    for (const entry of [transfer, p1, p2, regular]) await database.ref(`public/turns/${entry.publicToken}`).remove();
    await database.ref(`public/displays/${centerId}`).remove(); await database.ref(`public/displayCalls/${centerId}`).remove();
  }
});

test("E1-C authoritative state invalidation aborts Call Next and preserves transfer marker", async () => {
  const worker = app(); const ref = getDatabase(worker).ref(pathName()); const marker = 424242;
  const transferred = item("transfer", {
    assignedWindowId: "w2", assignedWindowNumber: 2, serviceType: "vehicle_owner",
    currentState: "waiting_document_validation", assignedOperatorId: null,
    operationalReassignmentQueuedAt: marker,
  });
  try {
    await ref.set(day(transferred)); const counterBefore = (await ref.child("metadata/consecutivePriorityCasesByWindow/w2").get()).val();
    let invalidated = false;
    const result = await runCallNextWindowTransaction(
      subscribe(ref),
      async update => {
        if (!invalidated) {
          invalidated = true;
          await ref.child("cases/transfer/currentState").set("rejected");
        }
        return transact(ref)(update);
      },
      callContext(),
    );
    const persisted = (await ref.get()).val();
    assert.equal(result.status, "no-eligible-case"); assert.equal(persisted.cases.transfer.currentState, "rejected");
    assert.equal(persisted.cases.transfer.operationalReassignmentQueuedAt, marker);
    assert.equal(Object.keys(persisted.events || {}).length, 0);
    assert.equal(persisted.metadata.consecutivePriorityCasesByWindow.w2, counterBefore);
  } finally { await cleanup([worker], ref); }
});

test("E2 real Admin transaction retains committed reassignment when projection throws", async () => {
  const seed = app(); const worker = app(); const centerId = `e2-center-${process.pid}`;
  const uid = `e2-user-${process.pid}`; const currentDay = dayId(); const sessionId = `${centerId}-${currentDay}`;
  const reference = getDatabase(worker).ref(`days/${centerId}/${currentDay}`);
  const original = item("e2-case", {
    centerId, sessionId, publicToken: `e2-token-${process.pid}`, publicCode: "V1-24",
    arrivalAt: 24, globalArrivalSequence: 24,
  });
  const ctx = reassignContext({
    centerId, sessionId, caseId: original.caseId, uid, timestamp: 909090,
    eventId: "e2-reassignment-event",
  });
  try {
    await seedAuthority(getDatabase(seed), centerId, uid);
    await getDatabase(seed).ref(`days/${centerId}/${currentDay}`).set(day(original));
    let projectionAttempts = 0;
    const result = await executeReassignWindowCase(
      subscribe(reference),
      transact(reference),
      ctx,
      async () => { projectionAttempts += 1; throw new Error("forced post-commit projection failure"); },
    );
    const persisted = (await reference.get()).val(); const changed = persisted.cases[original.caseId];
    assert.equal(result.ok, true); assert.equal(result.outcome, "reassigned_projection_failed");
    assert.equal(projectionAttempts, 1); assert.equal(changed.currentState, "waiting_document_validation");
    assert.equal(changed.assignedWindowId, "w2"); assert.equal(changed.operationalReassignmentQueuedAt, ctx.timestamp);
    assert.equal(changed.publicCode, original.publicCode); assert.equal(changed.arrivalAt, original.arrivalAt);
    assert.equal(Object.keys(persisted.events).length, 1);
    assert.equal(persisted.events[ctx.eventId].action, "case_reassigned");
    assert.equal((await getDatabase(seed).ref(`public/turns/${original.publicToken}`).get()).exists(), false);
  } finally {
    await getDatabase(seed).ref(`centers/${centerId}`).remove(); await getDatabase(seed).ref(`users/${uid}`).remove();
    await getDatabase(seed).ref(`days/${centerId}`).remove(); await getDatabase(seed).ref(`public/turns/${original.publicToken}`).remove();
    await Promise.all([deleteApp(seed), deleteApp(worker)]);
  }
});
