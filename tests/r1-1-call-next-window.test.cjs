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

const { authorizedWindowId, selectNextWindowCase, applyCallNextWindowMutation } = exportsFromFunctions;
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
