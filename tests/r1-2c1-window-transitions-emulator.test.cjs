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
  runWindowTransitionTransaction,
  completeWindowTransitionAfterCommit,
  startWindowValidation,
  markWindowCaseNoShow,
} = require(path.join(root, "functions/lib/index.js"));
const projectId = process.env.GCLOUD_PROJECT || "ccvi-r1-2c1-emulator";
let appId = 0; let pathId = 0; let sequence = 0;
const app = () => initializeApp({ projectId, databaseURL: `https://${projectId}-default-rtdb.firebaseio.com` }, `r12c1-${process.pid}-${++appId}`);
const pathName = () => `r1-2c1/${process.pid}/${++pathId}`;
const dayId = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const windows = {
  w1: { windowId: "w1", windowNumber: 1, serviceType: "representation", serviceLabel: "Representación", validationLevel: "enhanced", publicCodePrefix: "V1", enabled: true, displayOrder: 1 },
  w2: { windowId: "w2", windowNumber: 2, serviceType: "vehicle_owner", serviceLabel: "Propietario", validationLevel: "standard", publicCodePrefix: "V2", enabled: true, displayOrder: 2 },
};
const caseRecord = (windowKey = "w1", centerId = "center") => ({
  caseId: "case-1", publicToken: "token-1", centerId, sessionId: `${centerId}-${dayId()}`,
  publicCode: windowKey === "w1" ? "V1-08" : "V2-05", globalArrivalSequence: 8, publicSequence: 8,
  serviceType: windows[windowKey].serviceType, serviceLabel: windows[windowKey].serviceLabel,
  validationLevel: windows[windowKey].validationLevel, assignedWindowId: windowKey,
  assignedWindowNumber: windows[windowKey].windowNumber,
  assignedOperatorId: windowKey === "w1" ? "operator-window-1" : "operator-window-2",
  isPriority: true, priorityType: "older_adult", priorityCreatedBy: "operator-window-1", priorityCreatedAt: 5,
  currentState: "called_to_window", arrivalAt: 1, calledToWindowAt: 10,
  documentValidationStartedAt: null, folderCode: null, paymentTicketId: null, updatedAt: 10,
});
const day = (item = caseRecord()) => ({
  metadata: { consecutivePriorityCasesByWindow: { w1: 2, w2: 1 }, nextFolderNumber: 3, nextPaymentQueueNumber: 4, windowSequences: { w1: 8, w2: 5 } },
  cases: { [item.caseId]: item }, events: {}, paymentQueue: {},
});
const context = (operation, windowKey = "w1", centerId = "center") => ({
  centerId, sessionId: `${centerId}-${dayId()}`, caseId: "case-1", windowId: windowKey,
  serviceType: windows[windowKey].serviceType, role: windowKey === "w1" ? "operator-window-1" : "operator-window-2",
  uid: `${windowKey}-uid`, operation, timestamp: 1000 + ++sequence, eventId: `event-${sequence}`,
});
const run = async (reference, ctx) => {
  let detachments = 0;
  const result = await runWindowTransitionTransaction(
    (onValue, onError) => { const listener = reference.on("value", snap => onValue(snap.exists()), onError); return () => { detachments += 1; reference.off("value", listener); }; },
    async update => { const tx = await reference.transaction(value => update(value), undefined, false); return { committed: tx.committed, value: tx.snapshot.val() }; },
    ctx,
  );
  return { result, detachments };
};
const clean = async (apps, reference) => { await reference.remove(); await Promise.all(apps.map(deleteApp)); };

for (const [operation, expectedState, action] of [
  ["start", "in_document_validation", "validation_started"],
  ["no_show", "no_show", "window_no_show"],
]) test(`${operation} commits only trusted transition and trace`, async () => {
  const worker = app(); const ref = getDatabase(worker).ref(pathName());
  try {
    const original = caseRecord(); await ref.set(day(original)); const ctx = context(operation); const out = await run(ref, ctx); const value = (await ref.get()).val();
    const changed = value.cases["case-1"];
    assert.equal(out.result.status, operation === "start" ? "started" : "no_show"); assert.equal(out.detachments, 1);
    assert.equal(changed.currentState, expectedState); assert.equal(changed.updatedAt, ctx.timestamp);
    assert.equal(value.events[ctx.eventId].action, action); assert.equal(value.events[ctx.eventId].actorId, ctx.uid);
    for (const key of ["publicCode", "arrivalAt", "globalArrivalSequence", "isPriority", "priorityType", "assignedWindowId", "assignedWindowNumber", "folderCode", "paymentTicketId"]) {
      assert.deepEqual(changed[key] ?? null, original[key] ?? null);
    }
    assert.deepEqual(value.metadata, day(original).metadata); assert.equal(Object.keys(value.cases).length, 1);
  } finally { await clean([worker], ref); }
});

for (const [label, a, b] of [
  ["START+START", "start", "start"], ["NO-SHOW+NO-SHOW", "no_show", "no_show"],
  ["START+NO-SHOW", "start", "no_show"], ["NO-SHOW+START", "no_show", "start"],
]) test(`${label} commits one valid same-case transition`, async () => {
  const seed = app(); const first = app(); const second = app(); const name = pathName(); const ref = getDatabase(seed).ref(name);
  try {
    await ref.set(day());
    const [x, y] = await Promise.all([run(getDatabase(first).ref(name), context(a)), run(getDatabase(second).ref(name), context(b))]);
    const value = (await ref.get()).val();
    assert.ok(["in_document_validation", "no_show"].includes(value.cases["case-1"].currentState));
    assert.equal([x, y].filter(out => ["started", "no_show"].includes(out.result.status)).length, 1);
    assert.equal(Object.keys(value.events).length, 1); assert.deepEqual(value.metadata, day().metadata);
  } finally { await clean([seed, first, second], ref); }
});

test("missing, unauthorized and invalid-state transitions abort without trace", async () => {
  const worker = app(); const ref = getDatabase(worker).ref(pathName());
  try {
    await ref.set(day());
    assert.equal((await run(ref, { ...context("start"), caseId: "missing" })).result.status, "case_not_found");
    assert.equal((await run(ref, context("start", "w2"))).result.status, "unauthorized");
    await ref.child("cases/case-1/currentState").set("in_document_validation");
    assert.equal((await run(ref, context("no_show"))).result.status, "invalid_case_state");
    assert.equal((await ref.child("events").get()).exists(), false);
  } finally { await clean([worker], ref); }
});

test("concurrent deletion never recreates case or day", async () => {
  const worker = app(); const ref = getDatabase(worker).ref(pathName());
  try {
    await ref.set(day()); let deleted = false;
    const result = await runWindowTransitionTransaction(
      (onValue, onError) => { const listener = ref.on("value", snap => onValue(snap.exists()), onError); return () => ref.off("value", listener); },
      async update => { if (!deleted) { deleted = true; await ref.remove(); } const tx = await ref.transaction(value => update(value), undefined, false); return { committed: tx.committed, value: tx.snapshot.val() }; },
      context("start"),
    );
    assert.equal(result.status, "case_not_found"); assert.equal((await ref.get()).exists(), false);
  } finally { await deleteApp(worker); }
});

const seedAuthority = async (database, centerId, uid, role = "operator-window-1", enabled = true, allowed = true) => {
  await database.ref(`centers/${centerId}`).set({ centerId, enabled: true, timezone: "America/Santiago", serviceStartTime: "23:58", serviceEndTime: "23:59", windows, documentaryRequirements: { representation: {}, vehicle_owner: {} }, paymentMethods: {} });
  await database.ref(`users/${uid}`).set({ uid, role, enabled, centerIds: allowed ? [centerId] : [], centerAccess: allowed ? { [centerId]: true } : {} });
};

test("production callables authorize W1/W2, project state, remove no-show display and work after closing", async () => {
  const database = getDatabase(); const centerId = `transition-center-${process.pid}`; const uid1 = `w1-${process.pid}`; const uid2 = `w2-${process.pid}`;
  try {
    await seedAuthority(database, centerId, uid1); await seedAuthority(database, centerId, uid2, "operator-window-2");
    const item1 = caseRecord("w1", centerId); const item2 = { ...caseRecord("w2", centerId), caseId: "case-2", publicToken: "token-2" };
    await database.ref(`days/${centerId}/${dayId()}`).set({ ...day(item1), cases: { "case-1": item1, "case-2": item2 } });
    await database.ref(`public/displays/${centerId}/${dayId()}/cases/case-2`).set({ publicCode: item2.publicCode });
    const started = await startWindowValidation.run({ data: { centerId, caseId: "case-1" }, auth: { uid: uid1, token: {} }, rawRequest: {} });
    const absent = await markWindowCaseNoShow.run({ data: { centerId, caseId: "case-2" }, auth: { uid: uid2, token: {} }, rawRequest: {} });
    assert.equal(started.outcome, "started"); assert.equal(absent.outcome, "no_show");
    assert.equal((await database.ref(`public/turns/token-1/status`).get()).val(), "Atención en ventanilla");
    assert.equal((await database.ref(`public/displays/${centerId}/${dayId()}/cases/case-1`).get()).exists(), true);
    assert.equal((await database.ref(`public/turns/token-2/status`).get()).val(), "No se registró su presentación");
    assert.equal((await database.ref(`public/displays/${centerId}/${dayId()}/cases/case-2`).get()).exists(), false);
  } finally {
    await database.ref(`centers/${centerId}`).remove(); await database.ref(`users/${uid1}`).remove(); await database.ref(`users/${uid2}`).remove();
    await database.ref(`days/${centerId}`).remove(); await database.ref("public/turns/token-1").remove(); await database.ref("public/turns/token-2").remove(); await database.ref(`public/displays/${centerId}`).remove();
  }
});

test("production callable denies unauthenticated, disabled, wrong role, wrong center and wrong Window", async () => {
  const database = getDatabase(); const centerId = `auth-center-${process.pid}`; const other = `other-${process.pid}`; const uid = `auth-user-${process.pid}`;
  try {
    await seedAuthority(database, centerId, uid); await database.ref(`centers/${other}`).set({ centerId: other, enabled: true, timezone: "America/Santiago", windows });
    const item = caseRecord("w1", centerId); const w2 = { ...caseRecord("w2", centerId), caseId: "case-2" };
    await database.ref(`days/${centerId}/${dayId()}`).set({ ...day(item), cases: { "case-1": item, "case-2": w2 } });
    const invoke = (data, auth = { uid, token: {} }) => startWindowValidation.run({ data, auth: auth === null ? undefined : auth, rawRequest: {} });
    assert.equal((await invoke({ centerId, caseId: "case-1" }, null)).outcome, "unauthenticated");
    assert.equal((await invoke({ centerId, caseId: "missing" })).outcome, "case_not_found");
    assert.equal((await invoke({ centerId, caseId: "case-2" })).outcome, "unauthorized");
    assert.equal((await invoke({ centerId: other, caseId: "case-1" })).outcome, "unauthorized");
    await database.ref(`users/${uid}`).update({ enabled: false }); assert.equal((await invoke({ centerId, caseId: "case-1" })).outcome, "unauthorized");
    await database.ref(`users/${uid}`).update({ enabled: true, role: "cashier" }); assert.equal((await invoke({ centerId, caseId: "case-1" })).outcome, "unauthorized");
  } finally {
    await database.ref(`centers/${centerId}`).remove(); await database.ref(`centers/${other}`).remove(); await database.ref(`users/${uid}`).remove(); await database.ref(`days/${centerId}`).remove();
    database.goOffline();
  }
});

test("post-commit projection failure keeps committed identity and returns warning", async () => {
  const item = { ...caseRecord(), currentState: "in_document_validation", documentValidationStartedAt: 123, updatedAt: 123 };
  const event = { eventId: "event", action: "validation_started" };
  const response = await completeWindowTransitionAfterCommit(
    { status: "started", caseRecord: item, event },
    async () => { throw new Error("forced projection failure"); },
  );
  assert.equal(response.ok, true); assert.equal(response.outcome, "started_projection_failed");
  assert.equal(response.caseRecord, item); assert.equal(response.event, event);
  const noShow = await completeWindowTransitionAfterCommit(
    { status: "no_show", caseRecord: { ...item, currentState: "no_show" }, event: { ...event, action: "window_no_show" } },
    async () => { throw new Error("forced projection failure"); },
  );
  assert.equal(noShow.ok, true); assert.equal(noShow.outcome, "no_show_projection_failed");
});
