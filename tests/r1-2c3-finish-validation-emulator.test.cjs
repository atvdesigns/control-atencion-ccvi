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
  runFinishDocumentValidationTransaction, executeFinishDocumentValidation,
  finishWindowDocumentValidation,
} = require(path.join(root, "functions/lib/index.js"));
const projectId = process.env.GCLOUD_PROJECT || "ccvi-r1-2c3-emulator";
test.after(() => getDatabase().goOffline());
let appId = 0; let pathId = 0; let id = 0;
const app = () => initializeApp({ projectId, databaseURL: `https://${projectId}-default-rtdb.firebaseio.com` }, `r12c3-${process.pid}-${++appId}`);
const pathName = () => `r1-2c3/${process.pid}/${++pathId}`;
const currentDayId = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const item = (caseId = "case-1", overrides = {}) => ({
  caseId, publicToken: `token-${caseId}-${process.pid}`, centerId: "center", sessionId: "center-day",
  publicCode: `V1-${String(++id).padStart(2, "0")}`, globalArrivalSequence: id, arrivalAt: 10 + id,
  serviceType: "representation", serviceLabel: "Representación", validationLevel: "enhanced",
  assignedWindowId: "w1", assignedWindowNumber: 1, assignedOperatorId: "operator-window-1",
  isPriority: true, priorityType: "older_adult", currentState: "in_document_validation",
  calledToWindowAt: 5, documentValidationStartedAt: 7, updatedAt: 7, ...overrides,
});
const day = (...cases) => ({
  metadata: { nextFolderNumber: 4, nextPaymentQueueNumber: 8, consecutivePriorityCasesByWindow: { w1: 1 } },
  cases: Object.fromEntries(cases.map(value => [value.caseId, value])), events: {}, paymentQueue: {},
});
const context = (caseId = "case-1", outcome = "approved", overrides = {}) => ({
  centerId: "center", sessionId: "center-day", caseId, windowId: "w1", serviceType: "representation",
  role: "operator-window-1", uid: "trusted-uid", outcome, shortCode: "CCVI", timestamp: 1000 + ++id,
  eventIds: outcome === "approved" ? [`folder-${id}`, `queue-${id}`] : [`finish-${id}`],
  queueItemId: `CCVI-PAY-${id}`, ...overrides,
});
const subscribe = reference => (onValue, onError) => { const listener = reference.on("value", snap => onValue(snap.exists()), onError); return () => reference.off("value", listener); };
const transact = reference => async update => { const tx = await reference.transaction(value => update(value), undefined, false); return { committed: tx.committed, value: tx.snapshot.val() }; };
const finish = (reference, ctx) => runFinishDocumentValidationTransaction(subscribe(reference), transact(reference), ctx);
const cleanup = async (apps, reference) => { await reference.remove(); await Promise.all(apps.map(deleteApp)); };

for (const outcome of ["approved", "incomplete", "rejected"]) test(`${outcome} commits exact authoritative transition and trace`, async () => {
  const worker = app(); const ref = getDatabase(worker).ref(pathName()); const original = item(); const ctx = context(original.caseId, outcome);
  if (outcome === "rejected") Object.assign(ctx, { rejectedCustomerName: "Ana", rejectedCustomerPhone: "+56965732008" });
  try {
    await ref.set(day(original)); const result = await finish(ref, ctx); const persisted = (await ref.get()).val(); const changed = persisted.cases[original.caseId];
    assert.equal(result.status, outcome); assert.equal(changed.currentState, outcome === "approved" ? "waiting_cashier" : outcome === "incomplete" ? "documentation_incomplete" : "rejected");
    for (const key of ["caseId", "publicCode", "arrivalAt", "globalArrivalSequence", "isPriority", "priorityType"]) assert.deepEqual(changed[key], original[key]);
    assert.ok(Object.values(persisted.events).every(event => event.actorId === "trusted-uid" && event.timestamp === ctx.timestamp));
    if (outcome === "approved") {
      assert.equal(changed.folderCode, "CCVI-F004"); assert.equal(changed.paymentQueueNumber, 8);
      assert.equal(persisted.metadata.nextFolderNumber, 5); assert.equal(persisted.metadata.nextPaymentQueueNumber, 9);
      assert.equal(persisted.paymentQueue[ctx.queueItemId].publicCode, original.publicCode); assert.equal(Object.keys(persisted.events).length, 2);
    } else {
      assert.equal(persisted.metadata.nextFolderNumber, 4); assert.equal(persisted.metadata.nextPaymentQueueNumber, 8);
      assert.equal(Object.keys(persisted.paymentQueue || {}).length, 0); assert.equal(Object.keys(persisted.events).length, 1);
    }
    if (outcome === "rejected") { assert.equal(changed.rejectedCustomerName, "Ana"); assert.equal(changed.rejectedCustomerPhone, "+56965732008"); }
  } finally { await cleanup([worker], ref); }
});

test("rejected contact remains optional and absent fields are not persisted", async () => {
  const worker = app(); const ref = getDatabase(worker).ref(pathName()); const source = item();
  try {
    await ref.set(day(source)); const result = await finish(ref, context(source.caseId, "rejected"));
    const changed = (await ref.child(`cases/${source.caseId}`).get()).val();
    assert.equal(result.status, "rejected"); assert.equal(changed.rejectedCustomerName, undefined); assert.equal(changed.rejectedCustomerPhone, undefined);
  } finally { await cleanup([worker], ref); }
});

test("two different approvals from fresh Admin caches allocate unique identifiers exactly twice", async () => {
  const seed = app(); const a = app(); const b = app(); const name = pathName(); const ref = getDatabase(seed).ref(name); const one = item("one"); const two = item("two");
  try {
    await ref.set(day(one, two)); const results = await Promise.all([
      finish(getDatabase(a).ref(name), context("one", "approved")), finish(getDatabase(b).ref(name), context("two", "approved")),
    ]); const value = (await ref.get()).val();
    assert.equal(results.filter(result => result.status === "approved").length, 2);
    assert.equal(new Set(Object.values(value.cases).map(value => value.folderCode)).size, 2);
    assert.equal(new Set(Object.keys(value.paymentQueue)).size, 2); assert.equal(value.metadata.nextFolderNumber, 6); assert.equal(value.metadata.nextPaymentQueueNumber, 10);
    assert.equal(Object.keys(value.events).length, 4);
  } finally { await cleanup([seed, a, b], ref); }
});

for (const pair of [["approved", "approved"], ["approved", "incomplete"], ["approved", "rejected"], ["incomplete", "rejected"]]) test(`same case ${pair.join(" + ")} has one winner without duplicate side effects`, async () => {
  const seed = app(); const a = app(); const b = app(); const name = pathName(); const ref = getDatabase(seed).ref(name); const source = item();
  try {
    await ref.set(day(source)); const results = await Promise.all([
      finish(getDatabase(a).ref(name), context(source.caseId, pair[0])), finish(getDatabase(b).ref(name), context(source.caseId, pair[1])),
    ]); const value = (await ref.get()).val();
    assert.equal(results.filter(result => ["approved", "incomplete", "rejected"].includes(result.status)).length, 1);
    const approved = value.cases[source.caseId].currentState === "waiting_cashier";
    assert.equal(Object.keys(value.paymentQueue || {}).length, approved ? 1 : 0);
    assert.equal(value.metadata.nextFolderNumber, approved ? 5 : 4); assert.equal(value.metadata.nextPaymentQueueNumber, approved ? 9 : 8);
    assert.equal(Object.keys(value.events).length, approved ? 2 : 1);
  } finally { await cleanup([seed, a, b], ref); }
});

test("authoritative deletion before transaction commit never recreates day or consumes counters", async () => {
  const worker = app(); const ref = getDatabase(worker).ref(pathName()); const source = item(); let deleted = false;
  try {
    await ref.set(day(source)); const result = await runFinishDocumentValidationTransaction(subscribe(ref), async update => {
      if (!deleted) { deleted = true; await ref.remove(); } return transact(ref)(update);
    }, context(source.caseId, "approved"));
    assert.equal(result.status, "case_not_found"); assert.equal((await ref.get()).exists(), false);
  } finally { await deleteApp(worker); }
});

for (const outcome of ["approved", "incomplete", "rejected"]) test(`${outcome} projection failure returns committed typed warning`, async () => {
  const worker = app(); const ref = getDatabase(worker).ref(pathName()); const source = item(); const ctx = context(source.caseId, outcome);
  try {
    await ref.set(day(source)); const result = await executeFinishDocumentValidation(subscribe(ref), transact(ref), ctx, async () => { throw new Error("forced"); });
    assert.equal(result.ok, true); assert.equal(result.outcome, `${outcome}_projection_failed`); assert.equal((await ref.child(`cases/${source.caseId}/currentState`).get()).val(), outcome === "approved" ? "waiting_cashier" : outcome === "incomplete" ? "documentation_incomplete" : "rejected");
  } finally { await cleanup([worker], ref); }
});

const windows = {
  w1: { windowId: "w1", windowNumber: 1, serviceType: "representation", serviceLabel: "Representación", validationLevel: "enhanced", publicCodePrefix: "V1", enabled: true, displayOrder: 1 },
  w2: { windowId: "w2", windowNumber: 2, serviceType: "vehicle_owner", serviceLabel: "Propietario", validationLevel: "standard", publicCodePrefix: "V2", enabled: true, displayOrder: 2 },
};
const seedAuthority = async (database, centerId, uid, overrides = {}) => {
  await database.ref(`centers/${centerId}`).set({ centerId, shortCode: "CCVI", enabled: true, timezone: "America/Santiago", serviceStartTime: "23:58", serviceEndTime: "23:59", windows, documentaryRequirements: { representation: {}, vehicle_owner: {} }, paymentMethods: {}, ...overrides.center });
  await database.ref(`users/${uid}`).set({ uid, role: "operator-window-1", enabled: true, centerIds: [centerId], centerAccess: { [centerId]: true }, ...overrides.user });
};

test("production callable authorizes after closing and publishes all three sanitized outcomes", async () => {
  const database = getDatabase(); const centerId = `finish-${process.pid}`; const uid = `finish-user-${process.pid}`; const date = currentDayId(); const sessionId = `${centerId}-${date}`;
  const sources = ["approved", "incomplete", "rejected"].map((outcome, index) => item(outcome, {
    centerId, sessionId, publicCode: `V1-${77 + index}`, publicToken: `finish-${outcome}-token-${process.pid}`,
  }));
  try {
    await seedAuthority(database, centerId, uid); await database.ref(`days/${centerId}/${date}`).set(day(...sources));
    for (const source of sources) await database.ref(`public/displays/${centerId}/${date}/cases/${source.caseId}`).set({ publicCode: source.publicCode });
    for (const source of sources) {
      const outcome = source.caseId;
      const result = await finishWindowDocumentValidation.run({ data: { centerId, caseId: source.caseId, outcome, ...(outcome === "rejected" ? { rejectedContact: { customerName: " Ana ", customerPhone: "965732008" } } : {}) }, auth: { uid, token: {} }, rawRequest: {} });
      assert.equal(result.outcome, outcome); if (outcome === "rejected") assert.equal(result.caseRecord.rejectedCustomerPhone, "+56965732008");
      const publicTurn = (await database.ref(`public/turns/${source.publicToken}`).get()).val(); assert.equal(publicTurn.publicCode, source.publicCode); assert.equal(publicTurn.rejectedCustomerPhone, undefined);
      assert.equal(publicTurn.status, outcome === "approved" ? "Espere el llamado a caja" : outcome === "incomplete" ? "El trámite no puede continuar por ahora" : "El trámite no puede continuar");
      assert.equal((await database.ref(`public/displays/${centerId}/${date}/cases/${source.caseId}`).get()).exists(), false);
    }
  } finally { await database.ref(`centers/${centerId}`).remove(); await database.ref(`users/${uid}`).remove(); await database.ref(`days/${centerId}`).remove(); for (const source of sources) await database.ref(`public/turns/${source.publicToken}`).remove(); await database.ref(`public/displays/${centerId}`).remove(); }
});

test("production callable rejects auth profile center Window and state violations without mutation", async () => {
  const database = getDatabase(); const centerId = `deny-finish-${process.pid}`; const uid = `deny-user-${process.pid}`; const date = currentDayId(); const source = item("deny", { centerId, sessionId: `${centerId}-${date}` }); const ref = database.ref(`days/${centerId}/${date}`);
  const invoke = auth => finishWindowDocumentValidation.run({ data: { centerId, caseId: source.caseId, outcome: "incomplete" }, auth, rawRequest: {} });
  try {
    await seedAuthority(database, centerId, uid); await ref.set(day(source)); const before = (await ref.get()).val();
    assert.equal((await invoke(undefined)).outcome, "unauthenticated");
    await database.ref(`users/${uid}/enabled`).set(false); assert.equal((await invoke({ uid, token: {} })).outcome, "unauthorized");
    await database.ref(`users/${uid}`).update({ enabled: true, role: "cashier" }); assert.equal((await invoke({ uid, token: {} })).outcome, "unauthorized");
    await database.ref(`users/${uid}`).update({ role: "operator-window-1", centerAccess: { other: true }, centerIds: ["other"] }); assert.equal((await invoke({ uid, token: {} })).outcome, "unauthorized");
    await database.ref(`users/${uid}`).update({ centerAccess: { [centerId]: true }, centerIds: [centerId] }); await database.ref(`centers/${centerId}/enabled`).set(false); assert.equal((await invoke({ uid, token: {} })).outcome, "config_unavailable");
    await database.ref(`centers/${centerId}/enabled`).set(true); await ref.child(`cases/${source.caseId}/assignedWindowId`).set("w2"); assert.equal((await invoke({ uid, token: {} })).outcome, "unauthorized");
    await ref.set(day({ ...source, currentState: "called_to_window" })); assert.equal((await invoke({ uid, token: {} })).outcome, "invalid_case_state");
    assert.equal((await ref.child("metadata/nextFolderNumber").get()).val(), before.metadata.nextFolderNumber);
  } finally { await database.ref(`centers/${centerId}`).remove(); await database.ref(`users/${uid}`).remove(); await database.ref(`days/${centerId}`).remove(); }
});
