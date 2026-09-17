const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { createRequire } = require("node:module");

if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) {
  throw new Error("FIREBASE_DATABASE_EMULATOR_HOST is required");
}

const root = path.resolve(__dirname, "..");
const requireFromFunctions = createRequire(path.join(root, "functions/package.json"));
const { initializeApp, deleteApp, getApps } = requireFromFunctions("firebase-admin/app");
const { getDatabase } = requireFromFunctions("firebase-admin/database");
const { runCallNextWindowTransaction } = require(path.join(root, "functions/lib/index.js"));

const projectId = process.env.GCLOUD_PROJECT || "ccvi-r1-1-3-emulator";
const databaseURL = `https://${projectId}-default-rtdb.firebaseio.com`;
let appSequence = 0;
let pathSequence = 0;
const centerId = "ccvi-san-bernardo";
const sessionId = `${centerId}-2026-09-16`;
const windowOne = "window-1";
const windowTwo = "window-2";

const app = () => initializeApp(
  { projectId, databaseURL },
  `r113-${process.pid}-${++appSequence}`,
);
const testPath = () => `r1-1-3/${process.pid}/${++pathSequence}`;
const context = (overrides = {}) => ({
  centerId,
  sessionId,
  windowId: windowOne,
  role: "operator-window-1",
  uid: "test-operator",
  timestamp: 123456,
  eventId: `event-${pathSequence}`,
  ...overrides,
});
const makeCase = (caseId, isPriority, arrivalAt, overrides = {}) => ({
  caseId,
  publicToken: `token-${caseId}`,
  centerId,
  sessionId,
  publicCode: `V1-${String(arrivalAt).padStart(2, "0")}`,
  globalArrivalSequence: arrivalAt,
  serviceType: "representation",
  serviceLabel: "Representación",
  assignedWindowId: windowOne,
  assignedWindowNumber: 1,
  assignedOperatorId: null,
  isPriority,
  currentState: "waiting_document_validation",
  arrivalAt,
  calledToWindowAt: null,
  updatedAt: arrivalAt,
  ...overrides,
});
const day = (...cases) => ({
  metadata: { consecutivePriorityCasesByWindow: { [windowOne]: 0, [windowTwo]: 0 } },
  cases: Object.fromEntries(cases.map((item) => [item.caseId, item])),
  events: {},
});

const runWithReference = async (reference, callContext, options = {}) => {
  let detachments = 0;
  let callbacks = 0;
  const result = await runCallNextWindowTransaction(
    (onValue, onError) => {
      const listener = reference.on("value", (snapshot) => onValue(snapshot.exists()), onError);
      return () => {
        detachments += 1;
        reference.off("value", listener);
      };
    },
    async (update) => {
      if (options.beforeTransaction) await options.beforeTransaction();
      const transaction = await reference.transaction((currentValue) => {
        callbacks += 1;
        if (options.onTransactionValue) options.onTransactionValue(currentValue);
        return update(currentValue);
      }, undefined, false);
      return { committed: transaction.committed, value: transaction.snapshot.val() };
    },
    callContext,
  );
  return { result, detachments, callbacks };
};

test("A: populated day with a fresh Admin cache commits", async () => {
  const seedApp = app();
  const workerApp = app();
  const pathName = testPath();
  try {
    await getDatabase(seedApp).ref(pathName).set(day(makeCase("fresh", false, 1)));
    const values = [];
    const run = await runWithReference(getDatabase(workerApp).ref(pathName), context(), {
      onTransactionValue: (value) => values.push(value),
    });
    assert.equal(run.result.status, "called");
    assert.equal(run.result.caseId, "fresh");
    assert.ok(values[0]);
  } finally {
    await getDatabase(seedApp).ref(pathName).remove();
    await Promise.all([deleteApp(seedApp), deleteApp(workerApp)]);
  }
});

test("B: populated W1 calls the correct W1 case", async () => {
  const worker = app();
  const reference = getDatabase(worker).ref(testPath());
  try {
    await reference.set(day(
      makeCase("w1", false, 1),
      makeCase("w2", false, 1, { assignedWindowId: windowTwo, assignedWindowNumber: 2 }),
    ));
    const run = await runWithReference(reference, context());
    assert.equal(run.result.caseId, "w1");
  } finally {
    await reference.remove();
    await deleteApp(worker);
  }
});

test("C: populated W2 calls the correct W2 case", async () => {
  const worker = app();
  const reference = getDatabase(worker).ref(testPath());
  try {
    await reference.set(day(
      makeCase("w1", false, 1),
      makeCase("w2", false, 1, { assignedWindowId: windowTwo, assignedWindowNumber: 2 }),
    ));
    const run = await runWithReference(reference, context({
      windowId: windowTwo,
      role: "operator-window-2",
    }));
    assert.equal(run.result.caseId, "w2");
  } finally {
    await reference.remove();
    await deleteApp(worker);
  }
});

test("D: genuinely nonexistent day returns no eligible", async () => {
  const worker = app();
  const reference = getDatabase(worker).ref(testPath());
  try {
    const run = await runWithReference(reference, context());
    assert.equal(run.result.status, "no-eligible-case");
    assert.equal(run.callbacks, 0);
  } finally {
    await deleteApp(worker);
  }
});

test("E: concurrent calls from separate Admin caches never call the same case", async () => {
  const seed = app();
  const firstWorker = app();
  const secondWorker = app();
  const pathName = testPath();
  try {
    await getDatabase(seed).ref(pathName).set(day(makeCase("only", false, 1)));
    const [first, second] = await Promise.all([
      runWithReference(getDatabase(firstWorker).ref(pathName), context({ eventId: "event-a" })),
      runWithReference(getDatabase(secondWorker).ref(pathName), context({ eventId: "event-b" })),
    ]);
    const called = [first.result, second.result].filter((item) => item.status === "called");
    assert.equal(called.length, 1);
    assert.equal(new Set(called.map((item) => item.caseId)).size, 1);
  } finally {
    await getDatabase(seed).ref(pathName).remove();
    await Promise.all([deleteApp(seed), deleteApp(firstWorker), deleteApp(secondWorker)]);
  }
});

test("F: contention retries and recomputes from callback state", async () => {
  const seed = app();
  const firstWorker = app();
  const secondWorker = app();
  const pathName = testPath();
  try {
    await getDatabase(seed).ref(pathName).set(day(
      makeCase("w1", false, 1),
      makeCase("w2", false, 1, { assignedWindowId: windowTwo, assignedWindowNumber: 2 }),
    ));
    const [first, second] = await Promise.all([
      runWithReference(getDatabase(firstWorker).ref(pathName), context({ eventId: "event-w1" })),
      runWithReference(getDatabase(secondWorker).ref(pathName), context({
        windowId: windowTwo,
        role: "operator-window-2",
        eventId: "event-w2",
      })),
    ]);
    assert.equal(first.result.caseId, "w1");
    assert.equal(second.result.caseId, "w2");
    assert.ok(first.callbacks + second.callbacks >= 3);
  } finally {
    await getDatabase(seed).ref(pathName).remove();
    await Promise.all([deleteApp(seed), deleteApp(firstWorker), deleteApp(secondWorker)]);
  }
});

test("G: deletion after hydration never recreates the day", async () => {
  const worker = app();
  const reference = getDatabase(worker).ref(testPath());
  try {
    await reference.set(day(makeCase("deleted", false, 1)));
    const run = await runWithReference(reference, context(), {
      beforeTransaction: () => reference.remove(),
    });
    assert.equal(run.result.status, "no-eligible-case");
    assert.equal((await reference.get()).exists(), false);
  } finally {
    await deleteApp(worker);
  }
});

test("H: listener is detached after success", async () => {
  const worker = app();
  const reference = getDatabase(worker).ref(testPath());
  try {
    await reference.set(day(makeCase("cleanup", false, 1)));
    const run = await runWithReference(reference, context());
    assert.equal(run.detachments, 1);
  } finally {
    await reference.remove();
    await deleteApp(worker);
  }
});

test("I: real transaction preserves 2P:1R", async () => {
  const worker = app();
  const reference = getDatabase(worker).ref(testPath());
  try {
    await reference.set(day(
      makeCase("p1", true, 1),
      makeCase("p2", true, 2),
      makeCase("p3", true, 3),
      makeCase("r1", false, 4),
    ));
    const selected = [];
    for (let index = 0; index < 3; index += 1) {
      const run = await runWithReference(reference, context({ eventId: `event-sequence-${index}` }));
      selected.push(run.result.caseId);
      await reference.child(`cases/${run.result.caseId}`).update({ currentState: "completed" });
    }
    assert.deepEqual(selected, ["p1", "p2", "r1"]);
  } finally {
    await reference.remove();
    await deleteApp(worker);
  }
});

test("J: real transaction preserves FIFO", async () => {
  const worker = app();
  const reference = getDatabase(worker).ref(testPath());
  try {
    await reference.set(day(makeCase("later", false, 2), makeCase("earlier", false, 1)));
    const run = await runWithReference(reference, context());
    assert.equal(run.result.caseId, "earlier");
  } finally {
    await reference.remove();
    await deleteApp(worker);
  }
});

test.after(async () => {
  await Promise.all(getApps().map((currentApp) => deleteApp(currentApp)));
});
