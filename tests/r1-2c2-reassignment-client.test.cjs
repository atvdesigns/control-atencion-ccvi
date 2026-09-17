const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const {
  applyReassignWindowCaseMutation,
  applyCallNextWindowMutation,
  applyWindowTransitionMutation,
  completeReassignWindowCaseAfterCommit,
} = require(path.join(root, "functions/lib/index.js"));
const store = fs.readFileSync(path.join(root, "src/store.ts"), "utf8");
const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");

const windows = {
  w1: { windowId: "w1", windowNumber: 1, serviceType: "representation", serviceLabel: "Representación", validationLevel: "enhanced", enabled: true },
  w2: { windowId: "w2", windowNumber: 2, serviceType: "vehicle_owner", serviceLabel: "Propietario", validationLevel: "standard", enabled: true },
};
const item = (caseId = "case-1", overrides = {}) => ({
  caseId, publicToken: `token-${caseId}`, centerId: "center", sessionId: "center-day",
  publicCode: "V1-24", globalArrivalSequence: 24, arrivalAt: 10, serviceType: "representation",
  serviceLabel: "Representación", validationLevel: "enhanced", assignedWindowId: "w1",
  assignedWindowNumber: 1, assignedOperatorId: "operator-window-1", isPriority: false,
  priorityType: null, currentState: "in_document_validation", calledToWindowAt: 5,
  documentValidationStartedAt: 7, updatedAt: 7, ...overrides,
});
const context = (overrides = {}) => ({
  centerId: "center", sessionId: "center-day", caseId: "case-1", sourceWindow: windows.w1,
  destinationWindow: windows.w2, role: "operator-window-1", uid: "uid-1", timestamp: 100,
  eventId: "event-1", ...overrides,
});
const day = (...cases) => ({
  metadata: { consecutivePriorityCasesByWindow: { w1: 1, w2: 2 }, untouched: true },
  cases: Object.fromEntries(cases.map((value) => [value.caseId, value])), events: {},
});

test("reassignment preserves identity, arrival and priority while using authoritative destination", () => {
  const original = item();
  const result = applyReassignWindowCaseMutation(day(original), context());
  assert.equal(result.status, "reassigned");
  const next = result.caseRecord;
  for (const key of ["caseId", "publicCode", "arrivalAt", "globalArrivalSequence", "isPriority", "priorityType"]) {
    assert.deepEqual(next[key], original[key]);
  }
  assert.equal(next.assignedWindowId, "w2"); assert.equal(next.serviceType, "vehicle_owner");
  assert.equal(next.currentState, "waiting_document_validation"); assert.equal(next.operationalReassignmentQueuedAt, 100);
});

test("reassignment trace records trusted source, destination, actor and time atomically", () => {
  const result = applyReassignWindowCaseMutation(day(item()), context());
  const event = result.event;
  assert.equal(result.day.events[event.eventId], event);
  assert.equal(event.sourceWindowId, "w1"); assert.equal(event.destinationWindowId, "w2");
  assert.equal(event.actorId, "uid-1"); assert.equal(event.timestamp, 100);
});

for (const [name, mutation, status] of [
  ["same Window", { destinationWindow: windows.w1 }, "invalid_destination"],
  ["wrong source Window", { sourceWindow: windows.w2, destinationWindow: windows.w1 }, "unauthorized"],
  ["wrong state", {}, "invalid_case_state"],
]) test(`${name} aborts without trace`, () => {
  const source = name === "wrong state" ? item("case-1", { currentState: "waiting_document_validation" }) : item();
  const result = applyReassignWindowCaseMutation(day(source), context(mutation));
  assert.equal(result.status, status); assert.equal(result.day, undefined);
});

test("oldest transfer wins before ordinary priority and regular cases", () => {
  const transferOld = item("transfer-old", { assignedWindowId: "w2", assignedWindowNumber: 2, serviceType: "vehicle_owner", currentState: "waiting_document_validation", operationalReassignmentQueuedAt: 20 });
  const transferNew = item("transfer-new", { assignedWindowId: "w2", assignedWindowNumber: 2, serviceType: "vehicle_owner", currentState: "waiting_document_validation", operationalReassignmentQueuedAt: 30 });
  const preferential = item("priority", { assignedWindowId: "w2", assignedWindowNumber: 2, serviceType: "vehicle_owner", currentState: "waiting_document_validation", isPriority: true, arrivalAt: 1 });
  const regular = item("regular", { assignedWindowId: "w2", assignedWindowNumber: 2, serviceType: "vehicle_owner", currentState: "waiting_document_validation", arrivalAt: 2 });
  const result = applyCallNextWindowMutation(day(transferNew, preferential, regular, transferOld), {
    centerId: "center", sessionId: "center-day", windowId: "w2", role: "operator-window-2", uid: "uid-2", timestamp: 200, eventId: "call",
  });
  assert.equal(result.caseId, "transfer-old");
});

for (const isPriority of [false, true]) test(`transfer ${isPriority ? "preferential" : "regular"} preserves P/R counter and clears marker`, () => {
  const transferred = item("transfer", { assignedWindowId: "w2", assignedWindowNumber: 2, serviceType: "vehicle_owner", currentState: "waiting_document_validation", isPriority, operationalReassignmentQueuedAt: 20 });
  const original = day(transferred);
  const result = applyCallNextWindowMutation(original, {
    centerId: "center", sessionId: "center-day", windowId: "w2", role: "operator-window-2", uid: "uid-2", timestamp: 200, eventId: "call",
  });
  assert.deepEqual(result.day.metadata, original.metadata);
  assert.equal(result.day.cases.transfer.operationalReassignmentQueuedAt, null);
  assert.equal(result.day.cases.transfer.isPriority, isPriority);
});

test("ordinary scheduler resumes unchanged after transfer marker is consumed", () => {
  const priority = item("priority", { assignedWindowId: "w2", assignedWindowNumber: 2, serviceType: "vehicle_owner", currentState: "waiting_document_validation", isPriority: true, arrivalAt: 1 });
  const regular = item("regular", { assignedWindowId: "w2", assignedWindowNumber: 2, serviceType: "vehicle_owner", currentState: "waiting_document_validation", arrivalAt: 2 });
  const result = applyCallNextWindowMutation(day(priority, regular), {
    centerId: "center", sessionId: "center-day", windowId: "w2", role: "operator-window-2", uid: "uid-2", timestamp: 200, eventId: "call",
  });
  assert.equal(result.caseId, "regular");
});

test("projection failure returns committed identity and typed warning", async () => {
  const committed = { caseRecord: item(), event: { eventId: "event" } };
  const result = await completeReassignWindowCaseAfterCommit(committed, async () => { throw new Error("forced"); });
  assert.equal(result.ok, true); assert.equal(result.outcome, "reassigned_projection_failed");
  assert.equal(result.caseRecord, committed.caseRecord);
});

test("a later W2 to W1 reassignment replaces the consumed marker with a new trusted time", () => {
  const returned = item("case-1", { assignedWindowId: "w2", assignedWindowNumber: 2,
    serviceType: "vehicle_owner", assignedOperatorId: "operator-window-2", operationalReassignmentQueuedAt: null });
  const result = applyReassignWindowCaseMutation(day(returned), context({
    sourceWindow: windows.w2, destinationWindow: windows.w1, role: "operator-window-2",
    uid: "uid-2", timestamp: 200, eventId: "event-2",
  }));
  assert.equal(result.status, "reassigned"); assert.equal(result.caseRecord.operationalReassignmentQueuedAt, 200);
  assert.equal(result.caseRecord.assignedWindowId, "w1");
});

test("no-show after a transfer call does not restore the consumed marker", () => {
  const transferred = item("case-1", { assignedWindowId: "w2", assignedWindowNumber: 2,
    serviceType: "vehicle_owner", currentState: "waiting_document_validation", assignedOperatorId: null,
    operationalReassignmentQueuedAt: 20 });
  const called = applyCallNextWindowMutation(day(transferred), {
    centerId: "center", sessionId: "center-day", windowId: "w2", role: "operator-window-2",
    uid: "uid-2", timestamp: 200, eventId: "call",
  }).day.cases["case-1"];
  const noShow = applyWindowTransitionMutation(day(called), {
    centerId: "center", sessionId: "center-day", caseId: "case-1", windowId: "w2",
    serviceType: "vehicle_owner", role: "operator-window-2", uid: "uid-2",
    operation: "no_show", timestamp: 300, eventId: "no-show",
  });
  assert.equal(noShow.status, "no_show"); assert.equal(noShow.caseRecord.operationalReassignmentQueuedAt ?? null, null);
});

test("an active destination case prevents transfer preemption and leaves marker intact", () => {
  const active = item("active", { assignedWindowId: "w2", assignedWindowNumber: 2,
    serviceType: "vehicle_owner", currentState: "in_document_validation", assignedOperatorId: "operator-window-2" });
  const transferred = item("transfer", { assignedWindowId: "w2", assignedWindowNumber: 2,
    serviceType: "vehicle_owner", currentState: "waiting_document_validation", assignedOperatorId: null,
    operationalReassignmentQueuedAt: 20 });
  const result = applyCallNextWindowMutation(day(active, transferred), {
    centerId: "center", sessionId: "center-day", windowId: "w2", role: "operator-window-2",
    uid: "uid-2", timestamp: 200, eventId: "call",
  });
  assert.equal(result.status, "active-case"); assert.equal(result.day, undefined);
  assert.equal(transferred.operationalReassignmentQueuedAt, 20);
});

test("client reassignment is callable-only and guarded by existing pending primitive", () => {
  const body = store.slice(store.indexOf("export const reassignCaseRealtime"), store.indexOf("export const finishDocumentValidation"));
  assert.match(body, /reassignWindowCaseCallable/); assert.doesNotMatch(body, /runTransaction|`days\//);
  assert.match(app, /No pudimos reasignar el turno\. Intente nuevamente\./);
  assert.match(app, /request: \(\) => reassignCaseRealtime/);
});
