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
  runPriorityArrivalTransaction,
  completePriorityArrivalAfterCommit,
  createPriorityArrival,
  setPriorityArrivalAfterCommitTestHook,
  setPriorityArrivalBeforeTransactionTestHook,
} = require(path.join(root, "functions/lib/index.js"));
const projectId = process.env.GCLOUD_PROJECT || "ccvi-r1-2b1-emulator";
let appId = 0; let pathId = 0;
const app = () => initializeApp({ projectId, databaseURL: `https://${projectId}-default-rtdb.firebaseio.com` }, `r12b1-${process.pid}-${++appId}`);
const pathName = () => `r1-2b1/${process.pid}/${++pathId}`;
const windows = {
  w1: { windowId: "w1", windowNumber: 1, serviceType: "representation", serviceLabel: "Representación", validationLevel: "enhanced", publicCodePrefix: "V1", enabled: true, displayOrder: 1 },
  w2: { windowId: "w2", windowNumber: 2, serviceType: "vehicle_owner", serviceLabel: "Propietario", validationLevel: "standard", publicCodePrefix: "V2", enabled: true, displayOrder: 2 },
};
let sequence = 0;
const context = (windowKey = "w1") => { const n = ++sequence; return { centerId: "center", dayId: "2026-09-17", sessionId: "center-2026-09-17", role: windowKey === "w1" ? "operator-window-1" : "operator-window-2", window: windows[windowKey], priorityType: "other", timestamp: 1000 + n, caseId: `case-${n}`, publicToken: `token-${n}`, priorityEventId: `trace-${n}-0-priority`, arrivalEventId: `trace-${n}-1-arrival` }; };
const run = async (reference, ctx, beforeTransaction) => {
  let detachments = 0; let callbacks = 0;
  const result = await runPriorityArrivalTransaction(
    (onValue, onError) => { const listener = reference.on("value", snap => onValue(snap.exists()), onError); return () => { detachments += 1; reference.off("value", listener); }; },
    async update => { if (beforeTransaction) await beforeTransaction(); const tx = await reference.transaction(value => { callbacks += 1; return update(value); }, undefined, false); return { committed: tx.committed, value: tx.snapshot.val() }; }, ctx,
  );
  return { result, detachments, callbacks };
};
const clean = async (apps, reference) => { await reference.remove(); await Promise.all(apps.map(deleteApp)); };

test("fresh cache initializes a nonexistent operational day", async () => { const worker = app(); const ref = getDatabase(worker).ref(pathName()); try { const out = await run(ref, context()); assert.equal(out.result.status, "created"); assert.ok(out.callbacks); } finally { await clean([worker], ref); } });
test("existing day data and counters are preserved", async () => { const worker = app(); const ref = getDatabase(worker).ref(pathName()); try { await ref.set({ metadata: { status: "open", nextGlobalArrivalSequence: 8, windowSequences: { w1: 4 }, marker: true }, cases: { old: { publicCode: "V1-04" } }, events: {} }); const out = await run(ref, context()); const value = (await ref.get()).val(); assert.equal(out.result.caseRecord.publicCode, "V1-05"); assert.ok(value.cases.old); assert.equal(value.metadata.nextGlobalArrivalSequence, 9); } finally { await clean([worker], ref); } });
test("W1 creates priority metadata and two trace events", async () => { const worker = app(); const ref = getDatabase(worker).ref(pathName()); try { const ctx = context("w1"); await run(ref, ctx); const value = (await ref.get()).val(); assert.equal(value.cases[ctx.caseId].assignedWindowId, "w1"); assert.equal(value.cases[ctx.caseId].isPriority, true); assert.equal(Object.keys(value.events).length, 2); } finally { await clean([worker], ref); } });
test("W2 is isolated with V2 numbering", async () => { const worker = app(); const ref = getDatabase(worker).ref(pathName()); try { const out = await run(ref, context("w2")); assert.equal(out.result.caseRecord.assignedWindowId, "w2"); assert.equal(out.result.caseRecord.publicCode, "V2-01"); } finally { await clean([worker], ref); } });
for (const [label, pair, expectedCodes, expectedW1, expectedW2] of [
  ["W1/W1", ["w1", "w1"], ["V1-11", "V1-12"], 12, 20],
  ["W2/W2", ["w2", "w2"], ["V2-21", "V2-22"], 10, 22],
  ["W1/W2", ["w1", "w2"], ["V1-11", "V2-21"], 11, 21],
]) test(`concurrent ${label} creation preserves exact isolated counters`, async () => {
  const seed = app(); const a = app(); const b = app(); const name = pathName(); const ref = getDatabase(seed).ref(name);
  try {
    await ref.set({ metadata: { status: "open", nextGlobalArrivalSequence: 21, windowSequences: { w1: 10, w2: 20 } }, cases: {}, events: {} });
    const [x, y] = await Promise.all([
      run(getDatabase(a).ref(name), context(pair[0])),
      run(getDatabase(b).ref(name), context(pair[1])),
    ]);
    assert.equal(x.result.status, "created"); assert.equal(y.result.status, "created");
    const value = (await ref.get()).val();
    const codes = Object.values(value.cases).map(item => item.publicCode).sort();
    assert.deepEqual(codes, expectedCodes);
    assert.equal(value.metadata.windowSequences.w1, expectedW1);
    assert.equal(value.metadata.windowSequences.w2, expectedW2);
    assert.equal(value.metadata.nextGlobalArrivalSequence, 23);
    assert.equal(Object.keys(value.cases).length, 2);
    assert.equal(Object.keys(value.events).length, 4);
    for (const caseItem of Object.values(value.cases)) {
      assert.deepEqual(
        Object.values(value.events).filter(event => event.caseId === caseItem.caseId).map(event => event.action),
        ["priority_created", "arrival_created"],
      );
    }
  } finally { await clean([seed, a, b], ref); }
});
test("closed day aborts safely", async () => { const worker = app(); const ref = getDatabase(worker).ref(pathName()); try { await ref.set({ metadata: { status: "closed" } }); const out = await run(ref, context()); assert.equal(out.result.status, "closed"); assert.equal(Object.keys((await ref.get()).val()).length, 1); } finally { await clean([worker], ref); } });
test("concurrent deletion never reconstructs an existing day", async () => { const worker = app(); const ref = getDatabase(worker).ref(pathName()); try { await ref.set({ metadata: { status: "open" }, cases: {}, events: {} }); const out = await run(ref, context(), () => ref.remove()); assert.equal(out.result.status, "transaction-conflict"); assert.equal((await ref.get()).exists(), false); } finally { await deleteApp(worker); } });
test("listener is detached after success", async () => { const worker = app(); const ref = getDatabase(worker).ref(pathName()); try { const out = await run(ref, context()); assert.equal(out.detachments, 1); } finally { await clean([worker], ref); } });
test("priority type, actor and persisted trace order remain authoritative", async () => { const writer = app(); const reader = app(); const name = pathName(); const ref = getDatabase(writer).ref(name); try { const ctx = { ...context(), priorityType: "pregnant" }; await run(ref, ctx); const value = (await getDatabase(reader).ref(name).get()).val(); assert.equal(value.cases[ctx.caseId].priorityType, "pregnant"); assert.equal(value.events[ctx.priorityEventId].actorRole, "operator-window-1"); assert.equal(value.events[ctx.priorityEventId].optionalNote, "pregnant"); assert.deepEqual(Object.values(value.events).map(event => event.action), ["priority_created", "arrival_created"]); } finally { await clean([writer, reader], ref); } });
test("publicCode continues beyond 99 without priority marker persistence", async () => { const worker = app(); const ref = getDatabase(worker).ref(pathName()); try { await ref.set({ metadata: { status: "open", nextGlobalArrivalSequence: 100, windowSequences: { w1: 99 } }, cases: {}, events: {} }); const out = await run(ref, context("w1")); assert.equal(out.result.caseRecord.publicCode, "V1-100"); assert.equal(out.result.caseRecord.publicCode.includes("P"), false); assert.equal((await ref.child("metadata/windowSequences/w1").get()).val(), 100); } finally { await clean([worker], ref); } });
test("post-commit exception reports created once and never suggests retry", async () => { const worker = app(); const ref = getDatabase(worker).ref(pathName()); try { const ctx = context("w1"); const out = await run(ref, ctx); const committed = { createdCase: out.result.caseRecord, metadata: out.result.committedDay.metadata, events: [out.result.committedDay.events[ctx.priorityEventId], out.result.committedDay.events[ctx.arrivalEventId]] }; const response = await completePriorityArrivalAfterCommit(committed, async () => { throw new Error("forced post-commit failure"); }); const value = (await ref.get()).val(); assert.equal(response.outcome, "created_but_projection_sync_failed"); assert.equal(response.ok, true); assert.equal(Object.keys(value.cases).length, 1); assert.equal(value.metadata.windowSequences.w1, 1); assert.equal(value.cases[ctx.caseId].publicCode, "V1-01"); assert.deepEqual(response.events.map(event => event.action), ["priority_created", "arrival_created"]); } finally { await clean([worker], ref); } });

const seedCallableAuthority = async (database, centerId, uid) => {
  await database.ref(`centers/${centerId}`).set({
    centerId, enabled: true, timezone: "America/Santiago", serviceStartTime: "00:00", serviceEndTime: "23:59",
    windows: { w1: { ...windows.w1, centerId } }, documentaryRequirements: { representation: {} }, paymentMethods: {},
  });
  await database.ref(`users/${uid}`).set({ uid, role: "operator-window-1", enabled: true, centerIds: [centerId], centerAccess: { [centerId]: true } });
};

test("production callable preserves pre-commit internal failure semantics", async () => {
  const database = getDatabase(); const centerId = `precommit-center-${process.pid}`; const uid = `precommit-user-${process.pid}`;
  try {
    await seedCallableAuthority(database, centerId, uid);
    setPriorityArrivalBeforeTransactionTestHook(() => { throw new Error("forced pre-commit failure"); });
    const response = await createPriorityArrival.run({ data: { centerId, priorityType: "other" }, auth: { uid, token: {} }, rawRequest: {} });
    assert.equal(response.outcome, "internal_error");
    assert.equal((await database.ref(`days/${centerId}`).get()).exists(), false);
  } finally {
    setPriorityArrivalBeforeTransactionTestHook(null);
    await database.ref(`centers/${centerId}`).remove(); await database.ref(`users/${uid}`).remove(); await database.ref(`days/${centerId}`).remove();
  }
});

test("production callable normal path creates and projects exactly once", async () => {
  const database = getDatabase(); const centerId = `normal-center-${process.pid}`; const uid = `normal-user-${process.pid}`;
  try {
    await seedCallableAuthority(database, centerId, uid);
    const response = await createPriorityArrival.run({ data: { centerId, priorityType: "other" }, auth: { uid, token: {} }, rawRequest: {} });
    const days = (await database.ref(`days/${centerId}`).get()).val(); const day = Object.values(days)[0];
    assert.equal(response.outcome, "created"); assert.equal(Object.keys(day.cases).length, 1);
    assert.equal(day.metadata.windowSequences.w1, 1); assert.equal(Object.values(day.cases)[0].publicCode, "V1-01");
    assert.equal((await database.ref(`public/turns/${response.createdCase.publicToken}`).get()).exists(), true);
  } finally {
    await database.ref(`centers/${centerId}`).remove(); await database.ref(`users/${uid}`).remove();
    await database.ref(`days/${centerId}`).remove(); await database.ref("public/turns").remove();
  }
});

test("production callable outer catch preserves a commit when the immediate post-commit hook throws", async () => {
  const database = getDatabase();
  const centerId = `callable-center-${process.pid}`;
  const uid = `callable-user-${process.pid}`;
  try {
    await seedCallableAuthority(database, centerId, uid);
    setPriorityArrivalAfterCommitTestHook(() => { throw new Error("forced immediate post-commit failure"); });
    const response = await createPriorityArrival.run({
      data: { centerId, priorityType: "other" }, auth: { uid, token: {} }, rawRequest: {},
    });
    setPriorityArrivalAfterCommitTestHook(null);
    const days = (await database.ref(`days/${centerId}`).get()).val();
    const day = Object.values(days)[0];
    const cases = Object.values(day.cases);
    const eventKeys = Object.keys(day.events);
    const events = Object.values(day.events);
    assert.equal(response.outcome, "created_but_projection_sync_failed");
    assert.equal(response.ok, true);
    assert.equal(cases.length, 1);
    assert.equal(day.metadata.windowSequences.w1, 1);
    assert.equal(cases[0].publicCode, "V1-01");
    assert.match(eventKeys[0], /-0-priority$/);
    assert.match(eventKeys[1], /-1-arrival$/);
    assert.deepEqual(events.map(event => event.action), ["priority_created", "arrival_created"]);
  } finally {
    setPriorityArrivalAfterCommitTestHook(null);
    await database.ref(`centers/${centerId}`).remove();
    await database.ref(`users/${uid}`).remove();
    await database.ref(`days/${centerId}`).remove();
    database.goOffline();
  }
});
