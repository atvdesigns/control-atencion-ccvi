const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");

const functions = require(path.resolve(__dirname, "../functions/lib/index.js"));
const windows = [
  { windowId: "w1", windowNumber: 1, serviceType: "representation", serviceLabel: "Representación", validationLevel: "enhanced", publicCodePrefix: "V1", enabled: true, displayOrder: 1 },
  { windowId: "w2", windowNumber: 2, serviceType: "vehicle_owner", serviceLabel: "Propietario", validationLevel: "standard", publicCodePrefix: "V2", enabled: true, displayOrder: 2 },
];
const profile = (overrides = {}) => ({ uid: "user", role: "operator-window-1", centerIds: ["center"], centerAccess: { center: true }, enabled: true, ...overrides });

test("validates the minimal priority input and rejects arbitrary fields", () => {
  assert.equal(functions.isPriorityArrivalInput({ centerId: "center", priorityType: "other" }), true);
  assert.equal(functions.isPriorityArrivalInput({ centerId: "center", priorityType: "invalid" }), false);
  assert.equal(functions.isPriorityArrivalInput({ centerId: "center", priorityType: "other", publicCode: "V1-99" }), false);
});

for (const [name, candidate] of [
  ["missing profile", null], ["disabled profile", profile({ enabled: false })],
  ["wrong uid", profile({ uid: "other" })], ["wrong role", profile({ role: "admin" })],
  ["centerIds denied", profile({ centerIds: [] })], ["centerAccess denied", profile({ centerAccess: {} })],
]) test(`authorization rejects ${name}`, () => {
  assert.equal(functions.authorizePriorityWindow(candidate, "user", "center", windows), null);
});

test("W1 and W2 roles derive separate authoritative windows", () => {
  assert.equal(functions.authorizePriorityWindow(profile(), "user", "center", windows).windowId, "w1");
  assert.equal(functions.authorizePriorityWindow(profile({ role: "operator-window-2" }), "user", "center", windows).windowId, "w2");
});

test("disabled authoritative window fails closed", () => {
  assert.equal(functions.authorizePriorityWindow(profile(), "user", "center", [{ ...windows[0], enabled: false }]), null);
});

const center = (overrides = {}) => ({
  centerId: "center", enabled: true, timezone: "America/Santiago",
  serviceStartTime: "08:00", serviceEndTime: "17:00", windows, ...overrides,
});
test("disabled center and invalid timezone fail closed", () => {
  assert.equal(functions.resolvePrioritySchedule(center({ enabled: false }), "center", new Date()).outcome, "config_unavailable");
  assert.equal(functions.resolvePrioritySchedule(center({ timezone: "Invalid/Timezone" }), "center", new Date()).outcome, "config_unavailable");
  assert.equal(functions.resolvePrioritySchedule(center(), "other-center", new Date()).outcome, "config_unavailable");
});

test("center-local business hours and operational day are authoritative", () => {
  assert.equal(functions.resolvePrioritySchedule(center(), "center", new Date("2026-09-17T10:59:00Z")).outcome, "closed");
  const open = functions.resolvePrioritySchedule(center(), "center", new Date("2026-09-17T11:00:00Z"));
  assert.equal(open.outcome, "open");
  assert.equal(open.dayId, "2026-09-17");
  assert.equal(functions.resolvePrioritySchedule(center(), "center", new Date("2026-09-17T20:00:00Z")).outcome, "closed");
});

test("post-commit projection failure preserves created identity and trace order", async () => {
  const committed = {
    createdCase: { caseId: "case-1", publicCode: "V1-01" },
    metadata: { nextGlobalArrivalSequence: 2, windowSequences: { w1: 1 } },
    events: [
      { eventId: "priority", action: "priority_created" },
      { eventId: "arrival", action: "arrival_created" },
    ],
  };
  const response = await functions.completePriorityArrivalAfterCommit(
    committed,
    async () => { throw new Error("projection unavailable"); },
  );
  assert.equal(response.ok, true);
  assert.equal(response.outcome, "created_but_projection_sync_failed");
  assert.equal(response.createdCase.publicCode, "V1-01");
  assert.equal(response.metadata.windowSequences.w1, 1);
  assert.deepEqual(response.events.map(event => event.action), ["priority_created", "arrival_created"]);
});
