const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "functions/src/index.ts"), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const exportsFromFunctions = {};
class HttpsError extends Error {}
vm.runInNewContext(code, {
  exports: exportsFromFunctions,
  console,
  Intl,
  Date,
  require(name) {
    if (name === "firebase-admin/app") return { initializeApp() {} };
    if (name === "firebase-admin/database") return { getDatabase() { throw new Error("DATABASE_NOT_ALLOWED_IN_UNIT_TEST"); } };
    if (name === "firebase-functions/v2/https") return { HttpsError, onCall: (_options, handler) => handler };
    if (name === "node:crypto") return require(name);
    throw new Error(`Unexpected dependency: ${name}`);
  },
});

const {
  authorizedWindowId,
  selectNextWindowCase,
  applyCallNextWindowMutation,
  runCallNextWindowTransaction,
  callNextWindowResponse,
} = exportsFromFunctions;
const centerId = "ccvi-san-bernardo";
const sessionId = `${centerId}-2026-09-16`;
const windowId = "window-1";
const windows = [
  { windowId, windowNumber: 1 },
  { windowId: "window-2", windowNumber: 2 },
];
const profile = (overrides = {}) => ({
  uid: "user-1",
  role: "operator-window-1",
  centerIds: [centerId],
  centerAccess: { [centerId]: true },
  enabled: true,
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
  assignedWindowId: windowId,
  assignedWindowNumber: 1,
  assignedOperatorId: null,
  isPriority,
  currentState: "waiting_document_validation",
  arrivalAt,
  calledToWindowAt: null,
  updatedAt: arrivalAt,
  ...overrides,
});
const choose = (items, count = 0) => selectNextWindowCase(
  Object.fromEntries(items.map((item) => [item.caseId, item])),
  centerId,
  sessionId,
  windowId,
  count,
);
const sequence = (labels) => {
  let count = 0;
  const remaining = labels.map((label, index) => makeCase(`${label}-${index}`, label === "P", index + 1));
  const result = [];
  while (remaining.length) {
    const next = choose(remaining, count);
    result.push(next.isPriority ? "P" : "R");
    count = next.isPriority ? count + 1 : 0;
    remaining.splice(remaining.findIndex((item) => item.caseId === next.caseId), 1);
  }
  return result.join("");
};

test("unauthenticated caller is denied", () => {
  assert.equal(authorizedWindowId(null, "", centerId, windowId, windows), null);
});
test("disabled profile is denied", () => {
  assert.equal(authorizedWindowId(profile({ enabled: false }), "user-1", centerId, windowId, windows), null);
});
test("Cashier is denied", () => {
  assert.equal(authorizedWindowId(profile({ role: "cashier" }), "user-1", centerId, windowId, windows), null);
});
test("wrong Window role is denied", () => {
  assert.equal(authorizedWindowId(profile({ role: "operator-window-2" }), "user-1", centerId, windowId, windows), null);
});
test("cross-center request is denied", () => {
  assert.equal(authorizedWindowId(profile(), "user-1", "other-center", windowId, windows), null);
});
test("correct Window is allowed", () => {
  assert.equal(authorizedWindowId(profile(), "user-1", centerId, windowId, windows), windowId);
});

test("regular-only queue is FIFO", () => {
  assert.equal(choose([makeCase("r2", false, 2), makeCase("r1", false, 1)]).caseId, "r1");
});
test("priority-only queue is FIFO", () => {
  assert.equal(choose([makeCase("p2", true, 2), makeCase("p1", true, 1)]).caseId, "p1");
});
test("P P R selection preserves 2P:1R", () => assert.equal(sequence(["P", "P", "R"]), "PPR"));
test("P R selection preserves priority-first", () => assert.equal(sequence(["P", "R"]), "PR"));
test("R selection returns regular", () => assert.equal(sequence(["R"]), "R"));
test("P P P R selection forces regular third", () => assert.equal(sequence(["P", "P", "P", "R"]), "PPRP"));
test("representative mixed sequence preserves FIFO within groups", () => {
  assert.equal(sequence(["R", "P", "P", "R", "P", "R"]), "PPRPRR");
});

const mutation = () => {
  const selected = makeCase("selected", true, 1);
  const unrelated = makeCase("unrelated", false, 2, { assignedWindowId: "window-2", publicCode: "V2-01" });
  const day = {
    metadata: { consecutivePriorityCasesByWindow: { [windowId]: 0 }, untouched: "value" },
    cases: { selected, unrelated },
    events: { existing: { eventId: "existing" } },
  };
  const result = applyCallNextWindowMutation(day, {
    centerId,
    sessionId,
    windowId,
    role: "operator-window-1",
    uid: "user-1",
    timestamp: 123456,
    eventId: "event-1",
  });
  return { day, result, selected, unrelated };
};

test("selected case becomes called_to_window", () => {
  assert.equal(mutation().result.day.cases.selected.currentState, "called_to_window");
});
test("assigned Window remains correct", () => {
  assert.equal(mutation().result.day.cases.selected.assignedWindowId, windowId);
});
test("actor and timestamp are recorded", () => {
  const result = mutation().result;
  assert.equal(result.day.cases.selected.assignedOperatorId, "operator-window-1");
  assert.equal(result.day.cases.selected.calledToWindowAt, 123456);
  assert.equal(result.day.events["event-1"].actorId, "operator-window-1");
});
test("expected trace is generated", () => {
  const event = mutation().result.day.events["event-1"];
  assert.equal(event.action, "called_to_window");
  assert.equal(event.fromState, "waiting_document_validation");
  assert.equal(event.toState, "called_to_window");
});
test("publicCode remains unchanged", () => {
  const { result, selected } = mutation();
  assert.equal(result.day.cases.selected.publicCode, selected.publicCode);
});
test("unrelated case remains unchanged", () => {
  const { result, unrelated } = mutation();
  assert.deepEqual(result.day.cases.unrelated, unrelated);
});
test("no eligible case returns a safe no-op", () => {
  const result = applyCallNextWindowMutation({ metadata: {}, cases: {}, events: {} }, {
    centerId, sessionId, windowId, role: "operator-window-1", uid: "user-1", timestamp: 1, eventId: "event-1",
  });
  assert.equal(result.status, "no-eligible-case");
  assert.equal(result.day, undefined);
});

const transactionContext = (overrides = {}) => ({
  centerId,
  sessionId,
  windowId,
  role: "operator-window-1",
  uid: "user-1",
  timestamp: 123456,
  eventId: "event-transaction",
  ...overrides,
});
const populatedDay = (...cases) => ({
  metadata: { consecutivePriorityCasesByWindow: { [windowId]: 0, "window-2": 0 } },
  cases: Object.fromEntries(cases.map((item) => [item.caseId, item])),
  events: {},
});
const transactionOver = (readCurrent, writeCurrent) => async (update) => {
  const next = update(readCurrent());
  if (next === undefined) return { committed: false, value: readCurrent() };
  writeCurrent(next);
  return { committed: true, value: readCurrent() };
};

test("genuinely nonexistent authoritative day returns no eligible", async () => {
  let transactions = 0;
  const result = await runCallNextWindowTransaction(
    async () => null,
    async () => { transactions += 1; throw new Error("transaction must not start"); },
    transactionContext(),
  );
  assert.equal(result.status, "no-eligible-case");
  assert.equal(transactions, 0);
});

test("existing authoritative day with an empty queue returns no eligible", async () => {
  let current = populatedDay();
  const result = await runCallNextWindowTransaction(
    async () => current,
    transactionOver(() => current, (next) => { current = next; }),
    transactionContext(),
  );
  assert.equal(result.status, "no-eligible-case");
});

test("populated authoritative day calls an eligible case", async () => {
  let current = populatedDay(makeCase("eligible", false, 1));
  const result = await runCallNextWindowTransaction(
    async () => current,
    transactionOver(() => current, (next) => { current = next; }),
    transactionContext(),
  );
  assert.equal(result.status, "called");
  assert.equal(result.caseId, "eligible");
  assert.equal(current.cases.eligible.currentState, "called_to_window");
});

test("initial transaction null is not classified as no eligible", async () => {
  let current = populatedDay(makeCase("eligible-after-null", false, 1));
  let transactionAttempts = 0;
  const result = await runCallNextWindowTransaction(
    async () => current,
    async (update) => {
      transactionAttempts += 1;
      if (transactionAttempts === 1) {
        assert.equal(update(null), undefined);
        return { committed: false, value: null };
      }
      const next = update(current);
      current = next;
      return { committed: true, value: current };
    },
    transactionContext(),
  );
  assert.equal(result.status, "called");
  assert.equal(result.caseId, "eligible-after-null");
  assert.equal(transactionAttempts, 2);
});

test("day deleted after preload is not recreated from preloaded data", async () => {
  const preloaded = populatedDay(makeCase("deleted", false, 1));
  let loads = 0;
  const result = await runCallNextWindowTransaction(
    async () => (loads++ === 0 ? preloaded : null),
    async (update) => {
      assert.equal(update(null), undefined);
      return { committed: false, value: null };
    },
    transactionContext(),
  );
  assert.equal(result.status, "no-eligible-case");
  assert.equal(result.committedDay, null);
});

test("simultaneous calls never commit the same case", async () => {
  let current = populatedDay(
    makeCase("first", false, 1),
    makeCase("second", false, 2),
  );
  let transactionQueue = Promise.resolve();
  const transact = (update) => {
    const result = transactionQueue.then(() => {
      const next = update(current);
      if (next === undefined) return { committed: false, value: current };
      current = next;
      return { committed: true, value: current };
    });
    transactionQueue = result.then(() => undefined);
    return result;
  };
  const results = await Promise.all([
    runCallNextWindowTransaction(async () => current, transact, transactionContext({ eventId: "event-a" })),
    runCallNextWindowTransaction(async () => current, transact, transactionContext({ eventId: "event-b" })),
  ]);
  const called = results.filter((result) => result.status === "called");
  assert.equal(called.length, 1);
  assert.equal(new Set(called.map((result) => result.caseId)).size, called.length);
});

test("transaction retry recomputes selection from current state", async () => {
  const first = makeCase("first", false, 1);
  const second = makeCase("second", false, 2);
  let current = populatedDay(first, second);
  const result = await runCallNextWindowTransaction(
    async () => current,
    async (update) => {
      const staleResult = update(current);
      assert.equal(staleResult.cases.first.currentState, "called_to_window");
      current = populatedDay({ ...first, currentState: "completed", updatedAt: 2 }, second);
      const retriedResult = update(current);
      current = retriedResult;
      return { committed: true, value: current };
    },
    transactionContext(),
  );
  assert.equal(result.caseId, "second");
  assert.equal(current.cases.second.currentState, "called_to_window");
});

test("Window 2 transaction only selects its own queue", async () => {
  const windowTwoCase = makeCase("window-two", false, 1, {
    assignedWindowId: "window-2",
    assignedWindowNumber: 2,
    publicCode: "V2-01",
  });
  let current = populatedDay(makeCase("window-one", false, 1), windowTwoCase);
  const result = await runCallNextWindowTransaction(
    async () => current,
    transactionOver(() => current, (next) => { current = next; }),
    transactionContext({ windowId: "window-2", role: "operator-window-2" }),
  );
  assert.equal(result.caseId, "window-two");
  assert.equal(current.cases["window-one"].currentState, "waiting_document_validation");
});

test("called maps to the explicit client outcome contract", () => {
  const response = callNextWindowResponse("called", "V1-01");
  assert.equal(response.ok, true);
  assert.equal(response.outcome, "called");
  assert.equal(response.publicCode, "V1-01");
});
test("no eligible maps to an explicit business outcome", () => {
  const response = callNextWindowResponse("no-eligible-case");
  assert.equal(response.ok, false);
  assert.equal(response.outcome, "no_eligible_case");
});
test("active case maps to an explicit business outcome", () => {
  const response = callNextWindowResponse("active-case");
  assert.equal(response.ok, false);
  assert.equal(response.outcome, "active_case_exists");
});

const appText = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
const appSource = ts.createSourceFile("App.tsx", appText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const appDeclarations = new Map();
for (const statement of appSource.statements) {
  if (!ts.isVariableStatement(statement)) continue;
  for (const declaration of statement.declarationList.declarations) {
    appDeclarations.set(declaration.name.getText(appSource), declaration.initializer?.getText(appSource));
  }
}
const uiExports = {};
vm.runInNewContext(ts.transpileModule(
  `exports.callNextWindowFeedback = ${appDeclarations.get("callNextWindowFeedback")};\n` +
  `exports.executeCallNextWindow = ${appDeclarations.get("executeCallNextWindow")};`,
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText, { exports: uiExports });
const { callNextWindowFeedback, executeCallNextWindow } = uiExports;

test("no eligible outcome has visible safe feedback", () => {
  assert.equal(callNextWindowFeedback("no_eligible_case"), "No hay turnos disponibles para llamar.");
});
test("active case outcome has visible safe feedback", () => {
  assert.equal(
    callNextWindowFeedback("active_case_exists"),
    "Finalice la atención actual antes de llamar otro turno.",
  );
});
test("called outcome does not add failure feedback", () => {
  assert.equal(callNextWindowFeedback("called"), null);
});

const executeFixture = async (request) => {
  const pendingRef = { current: false };
  const loading = [];
  const results = [];
  let errors = 0;
  await executeCallNextWindow({
    pendingRef,
    setLoading: (value) => loading.push(value),
    request,
    onResult: (value) => results.push(value),
    onError: () => { errors += 1; },
  });
  return { pendingRef, loading, results, errors };
};

test("loading resets after successful call", async () => {
  const result = await executeFixture(async () => ({ outcome: "called" }));
  assert.deepEqual(result.loading, [true, false]);
  assert.equal(result.pendingRef.current, false);
  assert.equal(result.results[0].outcome, "called");
});
test("loading resets after business no-op", async () => {
  const result = await executeFixture(async () => ({ outcome: "no_eligible_case" }));
  assert.deepEqual(result.loading, [true, false]);
  assert.equal(result.results[0].outcome, "no_eligible_case");
});
test("authorization or callable error shows safe feedback and resets loading", async () => {
  const result = await executeFixture(async () => { throw new Error("permission-denied"); });
  assert.deepEqual(result.loading, [true, false]);
  assert.equal(result.errors, 1);
  assert.equal(result.pendingRef.current, false);
});
test("duplicate click while pending does not issue another request", async () => {
  const pendingRef = { current: false };
  let requests = 0;
  let release;
  const first = executeCallNextWindow({
    pendingRef,
    setLoading() {},
    request: () => { requests += 1; return new Promise((resolve) => { release = resolve; }); },
    onResult() {},
    onError() {},
  });
  await executeCallNextWindow({
    pendingRef,
    setLoading() {},
    request: async () => { requests += 1; return {}; },
    onResult() {},
    onError() {},
  });
  assert.equal(requests, 1);
  release({ outcome: "called" });
  await first;
});

test("client layers propagate the callable outcome instead of discarding it", () => {
  const firebaseSource = fs.readFileSync(path.join(root, "src/services/firebase.ts"), "utf8");
  const storeSource = fs.readFileSync(path.join(root, "src/store.ts"), "utf8");
  assert.match(firebaseSource, /result\.data\.outcome/);
  assert.match(storeSource, /outcome: result\.outcome/);
});
test("backend emits one guarded privacy-safe final outcome", () => {
  assert.match(source, /if \(finalOutcomeLogged\) return/);
  assert.match(source, /operation: "callNextWindowCase"/);
  for (const forbidden of ["email", "publicToken", "caseId", "priorityType", "optionalInternalNote"]) {
    const loggingBlock = source.slice(source.indexOf("const logFinalOutcome"), source.indexOf("try {", source.indexOf("const logFinalOutcome")));
    assert.doesNotMatch(loggingBlock, new RegExp(forbidden));
  }
});
