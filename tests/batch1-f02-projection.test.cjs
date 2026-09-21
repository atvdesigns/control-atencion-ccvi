const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { createRequire } = require("node:module");

const root = path.resolve(__dirname, "..");
const functionsRequire = createRequire(path.join(root, "functions/package.json"));
const { buildOperationalViews } = functionsRequire("./lib/index.js");

const center = {
  windows: [{ windowId: "window-1", windowNumber: 1 }, { windowId: "window-2", windowNumber: 2 }],
  cashiers: [{ cashierId: "cashier-1" }, { cashierId: "cashier-2" }],
};
const day = {
  metadata: { sessionId: "center-2026-09-19", centerId: "center", date: "2026-09-19", status: "open", nextFolderNumber: 8 },
  cases: {
    a: {
      caseId: "a", centerId: "center", sessionId: "center-2026-09-19", publicCode: "V1-01",
      assignedWindowId: "window-1", assignedWindowNumber: 1, serviceType: "representation",
      serviceLabel: "Representación", isPriority: true, priorityType: "older_adult",
      priorityCreatedBy: "private-actor", rejectedCustomerName: "Private Name",
      rejectedCustomerPhone: "+56900000000", optionalInternalNote: "window-only note",
      currentState: "waiting_cashier", arrivalAt: 1, updatedAt: 2,
    },
    b: {
      caseId: "b", centerId: "center", sessionId: "center-2026-09-19", publicCode: "V2-01",
      assignedWindowId: "window-2", assignedWindowNumber: 2, serviceType: "vehicle_owner",
      serviceLabel: "Propietario", isPriority: false, priorityType: null,
      rejectedCustomerName: "Other Window", currentState: "waiting_document_validation", arrivalAt: 3, updatedAt: 3,
    },
    paused: {
      caseId: "paused", centerId: "center", sessionId: "center-2026-09-19", publicCode: "V1-02",
      assignedWindowId: "window-1", assignedWindowNumber: 1, serviceType: "representation",
      serviceLabel: "Representación", isPriority: true, priorityType: "disability", currentState: "paused",
      optionalInternalNote: "cashier retry note", rejectedCustomerName: "Private Paused Name",
      rejectedCustomerPhone: "+56911111111", internalNotes: "unrelated private note", arrivalAt: 4, updatedAt: 5,
    },
    foreignPaused: {
      caseId: "foreignPaused", centerId: "other-center", sessionId: "other-center-2026-09-19", publicCode: "V1-99",
      assignedWindowId: "foreign-window", assignedWindowNumber: 9, serviceType: "representation",
      serviceLabel: "Representación", isPriority: false, currentState: "paused",
      optionalInternalNote: "foreign note", arrivalAt: 6, updatedAt: 6,
    },
  },
  paymentQueue: {
    qa: { queueItemId: "qa", caseId: "a", centerId: "center", sessionId: "center-2026-09-19", publicCode: "V1-01", folderCode: "F1", queueNumber: 1, approvedAt: 1, state: "waiting_cashier", cashierId: null, updatedAt: 2 },
    qp: { queueItemId: "qp", caseId: "paused", centerId: "center", sessionId: "center-2026-09-19", publicCode: "V1-02", folderCode: "F2", queueNumber: 2, approvedAt: 2, state: "paused", cashierId: null, updatedAt: 5 },
    qf: { queueItemId: "qf", caseId: "foreignPaused", centerId: "other-center", sessionId: "other-center-2026-09-19", publicCode: "V1-99", folderCode: "FX", queueNumber: 99, approvedAt: 6, state: "paused", cashierId: null, updatedAt: 6 },
  },
  events: { secret: { actorId: "private-actor", optionalNote: "private" } },
};

const views = buildOperationalViews(day, center);

test("Window receives only its assigned cases", () => {
  assert.deepEqual(Object.keys(views.windows["window-1"].cases).sort(), ["a", "paused"]);
  assert.deepEqual(Object.keys(views.windows["window-2"].cases), ["b"]);
});

test("Window projection omits rejected contact, actors and internal notes", () => {
  const serialized = JSON.stringify(views.windows);
  assert.doesNotMatch(serialized, /Private Name|Other Window|\+569|private-actor|window-only note/);
});

test("Window keeps operational priority reason", () => {
  assert.equal(views.windows["window-1"].cases.a.priorityType, "older_adult");
});

test("Cashiers share unassigned FIFO candidates and same-day unowned paused payments", () => {
  assert.deepEqual(Object.keys(views.cashiers["cashier-1"].paymentQueue).sort(), ["qa", "qp"]);
  assert.deepEqual(Object.keys(views.cashiers["cashier-2"].paymentQueue).sort(), ["qa", "qp"]);
  assert.equal(views.cashiers["cashier-1"].paymentQueue.qp.cashierId, null);
  assert.equal(views.cashiers["cashier-2"].paymentQueue.qf, undefined);
});

test("Cashier receives no priority reason, rejected contact or actor data", () => {
  const serialized = JSON.stringify(views.cashiers);
  assert.doesNotMatch(serialized, /older_adult|Private Name|Other Window|\+569|private-actor/);
});

test("Eligible Cashiers receive the approved pending-payment note and preserved identity", () => {
  assert.equal(views.cashiers["cashier-1"].cases.paused.optionalInternalNote, "cashier retry note");
  assert.equal(views.cashiers["cashier-2"].cases.paused.optionalInternalNote, "cashier retry note");
  for (const cashierId of ["cashier-1", "cashier-2"]) {
    assert.equal(views.cashiers[cashierId].cases.paused.publicCode, "V1-02");
    assert.equal(views.cashiers[cashierId].cases.paused.isPriority, true);
    assert.equal(views.cashiers[cashierId].paymentQueue.qp.queueItemId, "qp");
    assert.equal(views.cashiers[cashierId].paymentQueue.qp.folderCode, "F2");
    assert.equal(views.cashiers[cashierId].paymentQueue.qp.state, "paused");
  }
});

test("Shared paused projection excludes private and cross-center data", () => {
  const serialized = JSON.stringify(views.cashiers);
  assert.doesNotMatch(serialized, /Private Paused Name|\+56911111111|disability|unrelated private note|foreign note|V1-99|FX/);
});

test("Operational projections contain no private trace events", () => {
  assert.deepEqual(views.windows["window-1"].events, {});
  assert.deepEqual(views.cashiers["cashier-1"].events, {});
});

test("Operational metadata omits counters and sequence internals", () => {
  assert.deepEqual(views.windows["window-1"].metadata, {
    sessionId: "center-2026-09-19", centerId: "center", date: "2026-09-19", status: "open",
    windowId: "window-1", windowNumber: 1,
  });
});
