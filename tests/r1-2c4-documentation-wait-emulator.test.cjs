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
  runDocumentationWaitTransaction, executeDocumentationWait, runFinishDocumentValidationTransaction,
  applyCallNextWindowMutation, pauseWindowForDocumentation, resumeWindowDocumentation,
} = require(path.join(root, "functions/lib/index.js"));
const projectId = process.env.GCLOUD_PROJECT || "ccvi-r1-2c4-emulator";
test.after(() => getDatabase().goOffline());
let appId = 0; let pathId = 0; let serial = 0;
const app = () => initializeApp({ projectId, databaseURL: `https://${projectId}-default-rtdb.firebaseio.com` }, `r12c4-${process.pid}-${++appId}`);
const pathName = () => `r1-2c4/${process.pid}/${++pathId}`;
const dateId = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const windows = {
  w1: { windowId: "w1", windowNumber: 1, serviceType: "representation", serviceLabel: "Representación", validationLevel: "enhanced", publicCodePrefix: "V1", enabled: true, displayOrder: 1 },
  w2: { windowId: "w2", windowNumber: 2, serviceType: "vehicle_owner", serviceLabel: "Propietario", validationLevel: "standard", publicCodePrefix: "V2", enabled: true, displayOrder: 2 },
  w3: { windowId: "w3-dynamic", windowNumber: 3, serviceType: "representation", serviceLabel: "Representación especial", validationLevel: "enhanced", publicCodePrefix: "V3", enabled: true, displayOrder: 3 },
};
const item = (caseId = "case-1", overrides = {}) => ({
  caseId, publicToken: `token-${caseId}-${process.pid}`, centerId: "center", sessionId: "center-day",
  publicCode: `V1-${++serial}`, globalArrivalSequence: serial, arrivalAt: 10 + serial,
  serviceType: "representation", serviceLabel: "Representación", validationLevel: "enhanced",
  assignedWindowId: "w1", assignedWindowNumber: 1, assignedOperatorId: "operator-window-1",
  isPriority: true, priorityType: "older_adult", operationalReassignmentQueuedAt: 55,
  currentState: "in_document_validation", documentStatus: "pending", calledToWindowAt: 5,
  documentValidationStartedAt: 7, updatedAt: 7, ...overrides,
});
const day = (...cases) => ({ metadata: { nextFolderNumber: 4, nextPaymentQueueNumber: 8, consecutivePriorityCasesByWindow: { w1: 2, w2: 1, "w3-dynamic": 1 } }, cases: Object.fromEntries(cases.map(value => [value.caseId, value])), events: {}, paymentQueue: {} });
const context = (caseId, operation, overrides = {}) => ({ centerId: "center", sessionId: "center-day", caseId, windowId: "w1", role: "operator-window-1", uid: "trusted-uid", operation, timestamp: 1000 + ++serial, eventId: `wait-${serial}`, ...overrides });
const finishContext = (caseId, outcome, overrides = {}) => ({ centerId: "center", sessionId: "center-day", caseId, windowId: "w1", serviceType: "representation", role: "operator-window-1", uid: "trusted-uid", outcome, shortCode: "CCVI", timestamp: 2000 + ++serial, eventIds: outcome === "approved" ? [`f-${serial}`, `q-${serial}`] : [`end-${serial}`], queueItemId: `PAY-${serial}`, ...overrides });
const subscribe = ref => (onValue, onError) => { const listener = ref.on("value", snap => onValue(snap.exists()), onError); return () => ref.off("value", listener); };
const transact = ref => async update => { const tx = await ref.transaction(value => update(value), undefined, false); return { committed: tx.committed, value: tx.snapshot.val() }; };
const waitOp = (ref, ctx) => runDocumentationWaitTransaction(subscribe(ref), transact(ref), ctx);
const finishOp = (ref, ctx) => runFinishDocumentValidationTransaction(subscribe(ref), transact(ref), ctx);
const cleanup = async (apps, ref) => { await ref.remove(); await Promise.all(apps.map(deleteApp)); };

test("Wait and Resume preserve identity priority counters and reassignment marker", async () => {
  const worker = app(); const ref = getDatabase(worker).ref(pathName()); const source = item();
  try {
    await ref.set(day(source)); const paused = await waitOp(ref, context(source.caseId, "pause")); let value = (await ref.get()).val();
    assert.equal(paused.status, "documentation_wait_started"); assert.equal(value.cases[source.caseId].currentState, "waiting_documentation");
    assert.equal(value.cases[source.caseId].documentationWaitingSince, paused.event.timestamp);
    const resumed = await waitOp(ref, context(source.caseId, "resume")); value = (await ref.get()).val();
    assert.equal(resumed.status, "documentation_wait_resumed"); assert.equal(value.cases[source.caseId].currentState, "in_document_validation"); assert.equal(value.cases[source.caseId].documentationWaitingSince, undefined);
    for (const key of ["caseId", "publicCode", "arrivalAt", "globalArrivalSequence", "isPriority", "priorityType", "operationalReassignmentQueuedAt"]) assert.deepEqual(value.cases[source.caseId][key], source[key]);
    assert.deepEqual(value.metadata, day(source).metadata); assert.equal(Object.keys(value.events).length, 2); assert.equal(Object.keys(value.paymentQueue || {}).length, 0);
  } finally { await cleanup([worker], ref); }
});

test("multiple Wait Resume cycles append one trusted trace per transition", async () => {
  const worker = app(); const ref = getDatabase(worker).ref(pathName()); const source = item();
  try {
    await ref.set(day(source)); for (let cycle = 0; cycle < 2; cycle++) { await waitOp(ref, context(source.caseId, "pause")); await waitOp(ref, context(source.caseId, "resume")); }
    const value = (await ref.get()).val(); assert.equal(value.cases[source.caseId].currentState, "in_document_validation"); assert.equal(Object.keys(value.events).length, 4);
    assert.ok(Object.values(value.events).every(event => event.actorId === "trusted-uid" && event.timestamp >= 1000));
  } finally { await cleanup([worker], ref); }
});

test("Wait releases the Window and the waiting case stays outside Call Next eligibility", async () => {
  const worker = app(); const ref = getDatabase(worker).ref(pathName()); const source = item("waiting-source");
  const queued = item("queued", { currentState: "waiting_document_validation", isPriority: false, priorityType: null });
  try {
    await ref.set(day(source, queued)); await waitOp(ref, context(source.caseId, "pause"));
    const value = (await ref.get()).val();
    const callNext = applyCallNextWindowMutation(value, {
      centerId: "center", sessionId: "center-day", windowId: "w1", role: "operator-window-1",
      uid: "trusted-uid", timestamp: 5000, eventId: "call-after-wait",
    });
    assert.equal(callNext.status, "called"); assert.equal(callNext.caseId, queued.caseId);
    assert.equal(callNext.day.cases[source.caseId].currentState, "waiting_documentation");
  } finally { await cleanup([worker], ref); }
});

for (const outcome of ["incomplete", "approved", "rejected"]) test(`Wait + ${outcome} has one authoritative winner`, async () => {
  const seed = app(); const a = app(); const b = app(); const name = pathName(); const ref = getDatabase(seed).ref(name); const source = item();
  try {
    await ref.set(day(source)); const results = await Promise.all([waitOp(getDatabase(a).ref(name), context(source.caseId, "pause")), finishOp(getDatabase(b).ref(name), finishContext(source.caseId, outcome))]);
    const value = (await ref.get()).val(); assert.equal(results.filter(result => ["documentation_wait_started", outcome].includes(result.status)).length, 1);
    const approved = value.cases[source.caseId].currentState === "waiting_cashier"; assert.equal(value.metadata.nextFolderNumber, approved ? 5 : 4); assert.ok(Object.keys(value.events).length <= 2);
  } finally { await cleanup([seed, a, b], ref); }
});

test("Resume + Resume commits once", async () => {
  const seed = app(); const a = app(); const b = app(); const name = pathName(); const ref = getDatabase(seed).ref(name); const source = item("resume", { currentState: "waiting_documentation", documentationWaitingSince: 100 });
  try {
    await ref.set(day(source)); const results = await Promise.all([waitOp(getDatabase(a).ref(name), context(source.caseId, "resume")), waitOp(getDatabase(b).ref(name), context(source.caseId, "resume"))]);
    const value = (await ref.get()).val(); assert.equal(results.filter(result => result.status === "documentation_wait_resumed").length, 1); assert.equal(Object.keys(value.events).length, 1);
  } finally { await cleanup([seed, a, b], ref); }
});

test("Resume rejects a busy exact Window without preemption", async () => {
  const worker = app(); const ref = getDatabase(worker).ref(pathName()); const waiting = item("waiting", { currentState: "waiting_documentation", documentationWaitingSince: 100 }); const active = item("active");
  try { await ref.set(day(waiting, active)); const result = await waitOp(ref, context(waiting.caseId, "resume")); const value = (await ref.get()).val(); assert.equal(result.status, "active_case_exists"); assert.equal(value.cases.waiting.currentState, "waiting_documentation"); assert.equal(value.events, undefined); } finally { await cleanup([worker], ref); }
});

test("authoritative deletion before commit never reconstructs the day", async () => {
  const worker = app(); const ref = getDatabase(worker).ref(pathName()); const source = item(); let deleted = false;
  try { await ref.set(day(source)); const result = await runDocumentationWaitTransaction(subscribe(ref), async update => { if (!deleted) { deleted = true; await ref.remove(); } return transact(ref)(update); }, context(source.caseId, "pause")); assert.equal(result.status, "case_not_found"); assert.equal((await ref.get()).exists(), false); } finally { await deleteApp(worker); }
});

for (const operation of ["pause", "resume"]) test(`${operation} projection failure remains committed`, async () => {
  const worker = app(); const ref = getDatabase(worker).ref(pathName()); const source = item(operation, operation === "resume" ? { currentState: "waiting_documentation", documentationWaitingSince: 100 } : {});
  try { await ref.set(day(source)); const result = await executeDocumentationWait(subscribe(ref), transact(ref), context(source.caseId, operation), async () => { throw new Error("forced"); }); assert.equal(result.ok, true); assert.equal(result.outcome, operation === "pause" ? "documentation_wait_projection_failed" : "documentation_resume_projection_failed"); assert.equal((await ref.child(`cases/${source.caseId}`).get()).val().currentState, operation === "pause" ? "waiting_documentation" : "in_document_validation"); } finally { await cleanup([worker], ref); }
});

const seedAuthority = async (db, centerId, uid, role, profileWindowId) => {
  await db.ref(`centers/${centerId}`).set({ centerId, enabled: true, timezone: "America/Santiago", serviceStartTime: "23:58", serviceEndTime: "23:59", windows, documentaryRequirements: { representation: {}, vehicle_owner: {} }, paymentMethods: {} });
  await db.ref(`users/${uid}`).set({ uid, role, enabled: true, centerIds: [centerId], centerAccess: { [centerId]: true }, ...(profileWindowId ? { windowId: profileWindowId } : {}) });
};

test("actual callables preserve legacy W1 W2 and authorize dynamic W3 after closing", async () => {
  const db = getDatabase(); const centerId = `auth-c4-${process.pid}`; const date = dateId(); const sessionId = `${centerId}-${date}`; const users = [["u1", "operator-window-1", null, "w1"], ["u2", "operator-window-2", null, "w2"], ["u3", "operator-window-1", "w3-dynamic", "w3-dynamic"]];
  const cases = users.map(([uid, role, , windowId], index) => item(uid, { centerId, sessionId, publicToken: `${uid}-token-${process.pid}`, publicCode: `V${index + 1}-20`, assignedWindowId: windowId, assignedWindowNumber: index + 1, assignedOperatorId: role, serviceType: windowId === "w2" ? "vehicle_owner" : "representation" }));
  try {
    for (const [uid, role, profileWindowId] of users) await seedAuthority(db, centerId, uid, role, profileWindowId); await db.ref(`days/${centerId}/${date}`).set(day(...cases));
    for (const [uid] of users) { const paused = await pauseWindowForDocumentation.run({ data: { centerId, caseId: uid }, auth: { uid, token: {} }, rawRequest: {} }); assert.equal(paused.outcome, "documentation_wait_started"); const resumed = await resumeWindowDocumentation.run({ data: { centerId, caseId: uid }, auth: { uid, token: {} }, rawRequest: {} }); assert.equal(resumed.outcome, "documentation_wait_resumed"); }
    const w3ToW1 = await pauseWindowForDocumentation.run({ data: { centerId, caseId: "u1" }, auth: { uid: "u3", token: {} }, rawRequest: {} }); assert.equal(w3ToW1.outcome, "unauthorized");
    assert.equal((await db.ref(`public/displays/${centerId}/${date}/cases/u3/status`).get()).val(), "Atención en ventanilla");
  } finally { await db.ref(`centers/${centerId}`).remove(); for (const [uid] of users) { await db.ref(`users/${uid}`).remove(); await db.ref(`public/turns/${uid}-token-${process.pid}`).remove(); } await db.ref(`days/${centerId}`).remove(); await db.ref(`public/displays/${centerId}`).remove(); }
});

test("Pause clears both active Window projection paths and preserves unrelated public state", async () => {
  const db = getDatabase(); const centerId = `projection-c4-${process.pid}`; const uid = `projection-user-${process.pid}`;
  const date = dateId(); const sessionId = `${centerId}-${date}`;
  const source = item("case-pause", { centerId, sessionId, publicToken: `pause-token-${process.pid}`, publicCode: "V1-91" });
  const rootProjection = `public/displays/${centerId}/${date}/${source.caseId}`;
  const compatibilityProjection = `public/displays/${centerId}/${date}/cases/${source.caseId}`;
  const unrelatedWindowProjection = `public/displays/${centerId}/${date}/other-window`;
  const unrelatedCashierProjection = `public/displays/${centerId}/${date}/other-cashier`;
  const displayCall = `public/displayCalls/${centerId}/${date}/historical-call`;
  try {
    await seedAuthority(db, centerId, uid, "operator-window-1", "w1");
    await db.ref(`days/${centerId}/${date}`).set(day(source));
    const activeWindow = { publicCode: source.publicCode, isPriority: source.isPriority, status: "Atención en ventanilla", destination: "Ventanilla 1", updatedAt: source.updatedAt };
    const otherWindow = { publicCode: "V2-90", isPriority: false, status: "Diríjase a Ventanilla 2", destination: "Ventanilla 2", updatedAt: 8 };
    const cashier = { publicCode: "V1-80", isPriority: false, status: "Atención en caja", destination: "Caja 1", updatedAt: 9 };
    const historicalCall = { publicCode: source.publicCode, isPriority: source.isPriority, destinationType: "window", destinationLabel: "Ventanilla 1", calledAt: 5 };
    await db.ref().update({ [rootProjection]: activeWindow, [compatibilityProjection]: activeWindow, [unrelatedWindowProjection]: otherWindow, [unrelatedCashierProjection]: cashier, [displayCall]: historicalCall });

    const paused = await pauseWindowForDocumentation.run({ data: { centerId, caseId: source.caseId }, auth: { uid, token: {} }, rawRequest: {} });
    assert.equal(paused.outcome, "documentation_wait_started");
    assert.equal((await db.ref(rootProjection).get()).exists(), false);
    assert.equal((await db.ref(compatibilityProjection).get()).exists(), false);
    assert.deepEqual((await db.ref(unrelatedWindowProjection).get()).val(), otherWindow);
    assert.deepEqual((await db.ref(unrelatedCashierProjection).get()).val(), cashier);
    assert.deepEqual((await db.ref(displayCall).get()).val(), historicalCall);
    const persisted = (await db.ref(`days/${centerId}/${date}/cases/${source.caseId}`).get()).val();
    assert.equal(persisted.currentState, "waiting_documentation");
    assert.equal(typeof persisted.documentationWaitingSince, "number");
    assert.equal(persisted.publicCode, source.publicCode);
    assert.equal(persisted.isPriority, source.isPriority);

    const resumed = await resumeWindowDocumentation.run({ data: { centerId, caseId: source.caseId }, auth: { uid, token: {} }, rawRequest: {} });
    assert.equal(resumed.outcome, "documentation_wait_resumed");
    assert.equal((await db.ref(rootProjection).get()).exists(), false);
    assert.equal((await db.ref(`${compatibilityProjection}/publicCode`).get()).val(), source.publicCode);
    assert.deepEqual((await db.ref(displayCall).get()).val(), historicalCall);
  } finally {
    await db.ref(`centers/${centerId}`).remove(); await db.ref(`users/${uid}`).remove(); await db.ref(`days/${centerId}`).remove();
    await db.ref(`public/turns/${source.publicToken}`).remove(); await db.ref(`public/displays/${centerId}`).remove(); await db.ref(`public/displayCalls/${centerId}`).remove();
  }
});

test("actual callable rejects cross Window center disabled profile and disabled center", async () => {
  const db = getDatabase(); const centerId = `deny-c4-${process.pid}`; const other = `other-c4-${process.pid}`; const uid = `deny-c4-user-${process.pid}`; const date = dateId(); const source = item("target", { centerId, sessionId: `${centerId}-${date}`, assignedWindowId: "w2", assignedWindowNumber: 2, assignedOperatorId: "operator-window-2", serviceType: "vehicle_owner" });
  const invoke = center => pauseWindowForDocumentation.run({ data: { centerId: center, caseId: source.caseId }, auth: { uid, token: {} }, rawRequest: {} });
  try { await seedAuthority(db, centerId, uid, "operator-window-1", "w1"); await db.ref(`centers/${other}`).set({ centerId: other, enabled: true, timezone: "America/Santiago", windows }); await db.ref(`days/${centerId}/${date}`).set(day(source)); assert.equal((await invoke(centerId)).outcome, "unauthorized"); assert.equal((await invoke(other)).outcome, "unauthorized"); await db.ref(`users/${uid}`).update({ enabled: false }); assert.equal((await invoke(centerId)).outcome, "unauthorized"); await db.ref(`users/${uid}`).update({ enabled: true }); await db.ref(`centers/${centerId}/enabled`).set(false); assert.equal((await invoke(centerId)).outcome, "config_unavailable"); } finally { await db.ref(`centers/${centerId}`).remove(); await db.ref(`centers/${other}`).remove(); await db.ref(`users/${uid}`).remove(); await db.ref(`days/${centerId}`).remove(); }
});
