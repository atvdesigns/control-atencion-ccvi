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
  runExistingCasePriorityTransaction,
  updateCasePriority,
} = require(path.join(root, "functions/lib/index.js"));
const projectId = process.env.GCLOUD_PROJECT || "ccvi-r1-2b2-emulator";
let appId = 0; let pathId = 0; let eventId = 0;
const app = () => initializeApp({ projectId, databaseURL: `https://${projectId}-default-rtdb.firebaseio.com` }, `r12b2-${process.pid}-${++appId}`);
const pathName = () => `r1-2b2/${process.pid}/${++pathId}`;
const dayId = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const windows = {
  w1: { windowId: "w1", windowNumber: 1, serviceType: "representation", serviceLabel: "Representación", validationLevel: "enhanced", publicCodePrefix: "V1", enabled: true, displayOrder: 1 },
  w2: { windowId: "w2", windowNumber: 2, serviceType: "vehicle_owner", serviceLabel: "Propietario", validationLevel: "standard", publicCodePrefix: "V2", enabled: true, displayOrder: 2 },
};
const caseRecord = (windowKey = "w1", priorityType = null) => ({
  caseId: "case-1", publicToken: "public-token-1", centerId: "center", sessionId: `center-${dayId()}`,
  publicCode: windowKey === "w1" ? "V1-07" : "V2-04", globalArrivalSequence: 7,
  serviceType: windows[windowKey].serviceType, serviceLabel: windows[windowKey].serviceLabel,
  assignedWindowId: windowKey, assignedWindowNumber: windows[windowKey].windowNumber,
  assignedOperatorId: null, isPriority: Boolean(priorityType), priorityType,
  currentState: "waiting_document_validation", arrivalAt: 10, calledToWindowAt: null, updatedAt: 10,
});
const day = (item = caseRecord()) => ({
  metadata: { status: "open", nextGlobalArrivalSequence: 8, windowSequences: { w1: 7, w2: 4 } },
  cases: { [item.caseId]: item }, events: {},
});
const context = (operation, priorityType, windowKey = "w1") => ({
  centerId: "center", sessionId: `center-${dayId()}`, caseId: "case-1", windowId: windowKey,
  serviceType: windows[windowKey].serviceType, role: windowKey === "w1" ? "operator-window-1" : "operator-window-2",
  uid: `${windowKey}-user`, operation, priorityType: priorityType ?? null, timestamp: 100 + ++eventId, eventId: `event-${eventId}`,
});
const run = async (reference, ctx) => {
  let detached = 0;
  const result = await runExistingCasePriorityTransaction(
    (onValue, onError) => { const listener = reference.on("value", snap => onValue(snap.exists()), onError); return () => { detached += 1; reference.off("value", listener); }; },
    async update => { const tx = await reference.transaction(value => update(value), undefined, false); return { committed: tx.committed, value: tx.snapshot.val() }; },
    ctx,
  );
  return { result, detached };
};
const clean = async (apps, reference) => { await reference.remove(); await Promise.all(apps.map(deleteApp)); };

for (const windowKey of ["w1", "w2"]) test(`authorized ${windowKey.toUpperCase()} adds priority with trusted atomic trace`, async () => {
  const worker = app(); const ref = getDatabase(worker).ref(pathName());
  try {
    const original = caseRecord(windowKey); await ref.set(day(original));
    const ctx = context("set", "older_adult", windowKey); const out = await run(ref, ctx); const value = (await ref.get()).val();
    assert.equal(out.result.status, "updated"); assert.equal(out.detached, 1);
    assert.equal(value.cases["case-1"].isPriority, true); assert.equal(value.cases["case-1"].priorityType, "older_adult");
    assert.equal(value.events[ctx.eventId].actorId, ctx.uid); assert.equal(value.events[ctx.eventId].action, "priority_created");
    assert.equal(value.cases["case-1"].publicCode, original.publicCode); assert.deepEqual(value.metadata.windowSequences, { w1: 7, w2: 4 });
    assert.equal(Object.keys(value.cases).length, 1);
  } finally { await clean([worker], ref); }
});

test("change and remove preserve identity and counters", async () => {
  const worker = app(); const ref = getDatabase(worker).ref(pathName());
  try {
    await ref.set(day(caseRecord("w1", "other")));
    assert.equal((await run(ref, context("change", "pregnant"))).result.status, "updated");
    assert.equal((await run(ref, context("remove"))).result.status, "removed");
    const value = (await ref.get()).val(); assert.equal(value.cases["case-1"].isPriority, false); assert.equal(value.cases["case-1"].priorityType ?? null, null);
    assert.equal(value.cases["case-1"].publicCode, "V1-07"); assert.equal(Object.keys(value.cases).length, 1);
    assert.deepEqual(Object.values(value.events).map(item => item.action), ["priority_updated", "priority_removed"]);
  } finally { await clean([worker], ref); }
});

test("missing case, wrong window and invalid state abort without writes", async () => {
  const worker = app(); const ref = getDatabase(worker).ref(pathName());
  try {
    await ref.set(day());
    assert.equal((await run(ref, { ...context("set", "other"), caseId: "missing" })).result.status, "case_not_found");
    assert.equal((await run(ref, context("set", "other", "w2"))).result.status, "unauthorized");
    await ref.child("cases/case-1/currentState").set("completed");
    assert.equal((await run(ref, context("set", "other"))).result.status, "invalid_case_state");
    assert.equal((await ref.child("events").get()).exists(), false);
  } finally { await clean([worker], ref); }
});

for (const [label, initial, a, b] of [
  ["set + set", null, ["set", "other"], ["set", "pregnant"]],
  ["change + change", "other", ["change", "pregnant"], ["change", "disability"]],
  ["change + remove", "other", ["change", "pregnant"], ["remove", null]],
  ["remove + change", "other", ["remove", null], ["change", "pregnant"]],
]) test(`same-case concurrency ${label} remains valid`, async () => {
  const seed = app(); const aApp = app(); const bApp = app(); const name = pathName(); const ref = getDatabase(seed).ref(name);
  try {
    await ref.set(day(caseRecord("w1", initial)));
    const [x, y] = await Promise.all([
      run(getDatabase(aApp).ref(name), context(a[0], a[1])),
      run(getDatabase(bApp).ref(name), context(b[0], b[1])),
    ]);
    const value = (await ref.get()).val(); const item = value.cases["case-1"];
    assert.ok(["updated", "removed", "conflict"].includes(x.result.status)); assert.ok(["updated", "removed", "conflict"].includes(y.result.status));
    assert.equal(typeof item.isPriority, "boolean"); assert.equal(item.isPriority, item.priorityType != null);
    assert.equal(item.publicCode, "V1-07"); assert.equal(Object.keys(value.cases).length, 1); assert.deepEqual(value.metadata.windowSequences, { w1: 7, w2: 4 });
    assert.equal(Object.keys(value.events || {}).length, [x, y].filter(out => ["updated", "removed"].includes(out.result.status)).length);
  } finally { await clean([seed, aApp, bApp], ref); }
});

test("concurrent deletion never reconstructs the day", async () => {
  const worker = app(); const ref = getDatabase(worker).ref(pathName());
  try {
    await ref.set(day()); let deleted = false;
    const result = await runExistingCasePriorityTransaction(
      (onValue, onError) => { const listener = ref.on("value", snap => onValue(snap.exists()), onError); return () => ref.off("value", listener); },
      async update => { if (!deleted) { deleted = true; await ref.remove(); } const tx = await ref.transaction(value => update(value), undefined, false); return { committed: tx.committed, value: tx.snapshot.val() }; },
      context("set", "other"),
    );
    assert.equal(result.status, "case_not_found"); assert.equal((await ref.get()).exists(), false);
  } finally { await deleteApp(worker); }
});

const seedAuthority = async (database, centerId, uid, role = "operator-window-1", enabled = true, allowed = true) => {
  await database.ref(`centers/${centerId}`).set({ centerId, enabled: true, timezone: "America/Santiago", serviceStartTime: "23:58", serviceEndTime: "23:59", windows });
  await database.ref(`users/${uid}`).set({ uid, role, enabled, centerIds: allowed ? [centerId] : [], centerAccess: allowed ? { [centerId]: true } : {} });
  const item = { ...caseRecord(role === "operator-window-2" ? "w2" : "w1"), centerId, sessionId: `${centerId}-${dayId()}` };
  await database.ref(`days/${centerId}/${dayId()}`).set(day(item));
};

test("callable validates auth, profile, role, center access, input and still works after closing", async () => {
  const database = getDatabase(); const centerId = `mutation-center-${process.pid}`; const otherCenterId = `other-center-${process.pid}`; const uid = `mutation-user-${process.pid}`;
  try {
    await seedAuthority(database, centerId, uid);
    const invoke = (data, auth = { uid, token: {} }) => updateCasePriority.run({ data, auth: auth === null ? undefined : auth, rawRequest: {} });
    assert.equal((await invoke({ centerId, caseId: "case-1", operation: "set", priorityType: "other" })).outcome, "updated");
    assert.equal((await invoke({ centerId, caseId: "missing", operation: "set", priorityType: "other" })).outcome, "case_not_found");
    const w2 = { ...caseRecord("w2"), centerId, sessionId: `${centerId}-${dayId()}`, caseId: "case-w2" };
    await database.ref(`days/${centerId}/${dayId()}/cases/case-w2`).set(w2);
    assert.equal((await invoke({ centerId, caseId: "case-w2", operation: "set", priorityType: "other" })).outcome, "unauthorized");
    await database.ref(`centers/${otherCenterId}`).set({ centerId: otherCenterId, enabled: true, timezone: "America/Santiago", windows });
    assert.equal((await invoke({ centerId: otherCenterId, caseId: "case-1", operation: "set", priorityType: "other" })).outcome, "unauthorized");
    assert.equal((await invoke({ centerId, caseId: "case-1", operation: "change", priorityType: "bad" })).outcome, "invalid_priority");
    assert.equal((await invoke({ centerId, caseId: "case-1", operation: "bad", priorityType: "other" })).outcome, "invalid_operation");
    assert.equal((await invoke({ centerId, caseId: "case-1", operation: "remove" }, null)).outcome, "unauthenticated");
    await database.ref(`users/${uid}/enabled`).set(false);
    assert.equal((await invoke({ centerId, caseId: "case-1", operation: "remove" })).outcome, "unauthorized");
    await database.ref(`users/${uid}`).update({ enabled: true, role: "cashier" });
    assert.equal((await invoke({ centerId, caseId: "case-1", operation: "remove" })).outcome, "unauthorized");
    await database.ref(`users/${uid}`).update({ role: "operator-window-1", centerIds: [], centerAccess: {} });
    assert.equal((await invoke({ centerId, caseId: "case-1", operation: "remove" })).outcome, "unauthorized");
  } finally {
    await database.ref(`centers/${centerId}`).remove(); await database.ref(`centers/${otherCenterId}`).remove(); await database.ref(`users/${uid}`).remove();
    await database.ref(`days/${centerId}`).remove(); await database.ref("public/turns/public-token-1").remove(); await database.ref(`public/displays/${centerId}`).remove();
    database.goOffline();
  }
});
