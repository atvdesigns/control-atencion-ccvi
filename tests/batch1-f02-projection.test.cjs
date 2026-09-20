const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { createRequire } = require("node:module");

const root = path.resolve(__dirname, "..");
const functionsRequire = createRequire(path.join(root, "functions/package.json"));
const { buildOperationalViews } = functionsRequire("./lib/index.js");

const center = {
  windows: [{ windowId: "window-1" }, { windowId: "window-2" }],
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
      serviceLabel: "Representación", isPriority: false, priorityType: null, currentState: "paused",
      optionalInternalNote: "cashier retry note", rejectedCustomerPhone: "+56911111111", arrivalAt: 4, updatedAt: 5,
    },
  },
  paymentQueue: {
    qa: { queueItemId: "qa", caseId: "a", centerId: "center", sessionId: "center-2026-09-19", publicCode: "V1-01", folderCode: "F1", queueNumber: 1, approvedAt: 1, state: "waiting_cashier", cashierId: null, updatedAt: 2 },
    qp: { queueItemId: "qp", caseId: "paused", centerId: "center", sessionId: "center-2026-09-19", publicCode: "V1-02", folderCode: "F2", queueNumber: 2, approvedAt: 2, state: "paused", cashierId: "cashier-1", updatedAt: 5 },
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

test("Cashiers share only unassigned FIFO queue candidates", () => {
  assert.deepEqual(Object.keys(views.cashiers["cashier-1"].paymentQueue).sort(), ["qa", "qp"]);
  assert.deepEqual(Object.keys(views.cashiers["cashier-2"].paymentQueue), ["qa"]);
});

test("Cashier receives no priority reason, rejected contact or actor data", () => {
  const serialized = JSON.stringify(views.cashiers);
  assert.doesNotMatch(serialized, /older_adult|Private Name|Other Window|\+569|private-actor/);
});

test("Cashier receives its own pause note only", () => {
  assert.equal(views.cashiers["cashier-1"].cases.paused.optionalInternalNote, "cashier retry note");
  assert.equal(views.cashiers["cashier-2"].cases.paused, undefined);
});

test("Operational projections contain no private trace events", () => {
  assert.deepEqual(views.windows["window-1"].events, {});
  assert.deepEqual(views.cashiers["cashier-1"].events, {});
});

test("Operational metadata omits counters and sequence internals", () => {
  assert.deepEqual(views.windows["window-1"].metadata, {
    sessionId: "center-2026-09-19", centerId: "center", date: "2026-09-19", status: "open",
  });
});
