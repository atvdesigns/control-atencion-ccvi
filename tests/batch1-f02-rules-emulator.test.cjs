const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { createRequire } = require("node:module");

if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw new Error("FIREBASE_DATABASE_EMULATOR_HOST is required");
const root = path.resolve(__dirname, "..");
const req = createRequire(path.join(root, "package.json"));
const functionsReq = createRequire(path.join(root, "functions/package.json"));
const projectId = "ccvi-batch1-privacy-emulator";
process.env.GCLOUD_PROJECT = projectId;
process.env.FIREBASE_CONFIG = JSON.stringify({
  projectId,
  databaseURL: `https://${projectId}-default-rtdb.firebaseio.com`,
});
const { initializeApp, deleteApp } = req("firebase/app");
const { connectDatabaseEmulator, getDatabase, get, ref } = req("firebase/database");
const { initializeApp: initializeAdminApp, deleteApp: deleteAdminApp, getApps: getAdminApps } = functionsReq("firebase-admin/app");
const { getDatabase: getAdminDatabase } = functionsReq("firebase-admin/database");
const { hydrateOperationalDayView } = functionsReq("./lib/index.js");

const [host, portText] = process.env.FIREBASE_DATABASE_EMULATOR_HOST.split(":");
const port = Number(portText);
const apps = [];
const profile = (uid, role, centerId, extra = {}) => ({
  uid, role, enabled: true, centerIds: [centerId], centerAccess: { [centerId]: true }, ...extra,
});
const client = (label, uid) => {
  const app = initializeApp({ projectId, databaseURL: `https://${projectId}-default-rtdb.firebaseio.com` }, `${label}-${process.pid}`);
  apps.push(app);
  const database = getDatabase(app);
  connectDatabaseEmulator(database, host, port, uid ? {
    mockUserToken: { sub: uid, user_id: uid, aud: projectId, iss: `https://securetoken.google.com/${projectId}` },
  } : undefined);
  return database;
};
const denied = (promise) => assert.rejects(
  promise,
  (error) => /permission[_ -]?denied/i.test(`${error?.code} ${error?.message}`),
);

let adminApp; let adminDb; let anonymous; let admin; let window1; let window2; let explicitWindow; let unboundWindow;
let cashier1; let cashier2; let otherCenterWindow;
test.before(async () => {
  adminApp = initializeAdminApp(
    { projectId, databaseURL: `https://${projectId}-default-rtdb.firebaseio.com` },
    "batch1-admin-fixture",
  );
  adminDb = getAdminDatabase(adminApp);
  await adminDb.ref().set({
    users: {
      admin: profile("admin", "admin", "center-a"),
      window1: profile("window1", "operator-window-1", "center-a"),
      window2: profile("window2", "operator-window-2", "center-a"),
      explicit: profile("explicit", "operator-window-1", "center-a", { windowId: "window-3" }),
      unbound: profile("unbound", "operator-window-3", "center-a"),
      cashier1: profile("cashier1", "cashier", "center-a", { cashierId: "cashier-1" }),
      cashier2: profile("cashier2", "cashier", "center-a", { cashierId: "cashier-2" }),
      other: profile("other", "operator-window-1", "center-b"),
    },
    centers: { "center-a": {
      centerId: "center-a", enabled: true,
      windows: {
        "window-1": { windowId: "window-1", windowNumber: 1, enabled: true },
        "window-2": { windowId: "window-2", windowNumber: 2, enabled: true },
        "window-3": { windowId: "window-3", windowNumber: 3, enabled: true },
      },
      cashiers: {
        "cashier-1": { cashierId: "cashier-1", enabled: true },
        "cashier-2": { cashierId: "cashier-2", enabled: true },
      },
    } },
    days: { "center-a": { "2026-09-19": {
      metadata: { sessionId: "center-a-2026-09-19", centerId: "center-a", date: "2026-09-19", status: "open" },
      cases: {
        one: { caseId: "one", centerId: "center-a", sessionId: "center-a-2026-09-19", publicCode: "V1-01", assignedWindowId: "window-1", assignedWindowNumber: 1, isPriority: true, priorityType: "older_adult", rejectedCustomerName: "Private", currentState: "waiting_cashier", arrivalAt: 1, updatedAt: 2 },
        two: { caseId: "two", centerId: "center-a", sessionId: "center-a-2026-09-19", publicCode: "V2-01", assignedWindowId: "window-2", assignedWindowNumber: 2, isPriority: false, currentState: "waiting_document_validation", arrivalAt: 2, updatedAt: 2 },
      },
      paymentQueue: { q1: { queueItemId: "q1", caseId: "one", centerId: "center-a", sessionId: "center-a-2026-09-19", publicCode: "V1-01", folderCode: "F1", queueNumber: 1, approvedAt: 1, state: "waiting_cashier", cashierId: null, updatedAt: 2 } },
    } } },
  });
  const hydration = await hydrateOperationalDayView.run({
    data: { centerId: "center-a", dayId: "2026-09-19" }, auth: { uid: "window1", token: {} }, rawRequest: {},
  });
  assert.equal(hydration.outcome, "ready");
  anonymous = client("anonymous"); admin = client("admin", "admin"); window1 = client("window1", "window1");
  window2 = client("window2", "window2"); explicitWindow = client("explicit", "explicit");
  unboundWindow = client("unbound", "unbound"); cashier1 = client("cashier1", "cashier1");
  cashier2 = client("cashier2", "cashier2"); otherCenterWindow = client("other", "other");
});
test.after(async () => {
  await Promise.all(apps.map(deleteApp));
  await adminDb.ref().remove();
  await adminDb.goOffline();
  await Promise.all(getAdminApps().map(deleteAdminApp));
});

test("Admin intended authoritative day read is allowed", async () => {
  assert.equal((await get(ref(admin, "days/center-a/2026-09-19"))).exists(), true);
});
test("trusted hydration is idempotent and preserves sanitized delivery", async () => {
  const response = await hydrateOperationalDayView.run({
    data: { centerId: "center-a", dayId: "2026-09-19" }, auth: { uid: "cashier1", token: {} }, rawRequest: {},
  });
  assert.equal(response.outcome, "ready");
  const value = (await adminDb.ref("operationalViews/center-a/2026-09-19/cashiers/cashier-1").get()).val();
  assert.equal(value.cases.one.publicCode, "V1-01");
  assert.equal(value.cases.one.priorityType, undefined);
  assert.equal(value.cases.one.rejectedCustomerName, undefined);
});
test("hydration accepts legacy W2 and explicit Window bindings but rejects an unbound role", async () => {
  const legacy = await hydrateOperationalDayView.run({
    data: { centerId: "center-a", dayId: "2026-09-19" }, auth: { uid: "window2", token: {} }, rawRequest: {},
  });
  const explicit = await hydrateOperationalDayView.run({
    data: { centerId: "center-a", dayId: "2026-09-19" }, auth: { uid: "explicit", token: {} }, rawRequest: {},
  });
  const unbound = await hydrateOperationalDayView.run({
    data: { centerId: "center-a", dayId: "2026-09-19" }, auth: { uid: "unbound", token: {} }, rawRequest: {},
  });
  assert.equal(legacy.outcome, "ready");
  assert.equal(explicit.outcome, "ready");
  assert.equal(unbound.outcome, "unauthorized");
});
test("Window broad authoritative day read is denied", () => denied(get(ref(window1, "days/center-a/2026-09-19"))));
test("Cashier broad authoritative day read is denied", () => denied(get(ref(cashier1, "days/center-a/2026-09-19"))));
test("Window own sanitized view is allowed", async () => {
  assert.equal((await get(ref(window1, "operationalViews/center-a/2026-09-19/windows/window-1/cases/one/publicCode"))).val(), "V1-01");
});
test("legacy Window 2 resolves its own operational view", async () => {
  assert.equal((await get(ref(window2, "operationalViews/center-a/2026-09-19/windows/window-2/metadata/windowNumber"))).val(), 2);
});
test("explicit windowId profile reads only its explicit view", async () => {
  assert.equal((await get(ref(explicitWindow, "operationalViews/center-a/2026-09-19/windows/window-3/metadata/windowNumber"))).val(), 3);
  await denied(get(ref(explicitWindow, "operationalViews/center-a/2026-09-19/windows/window-1")));
});
test("unbound Window profile is denied", () => denied(get(ref(unboundWindow, "operationalViews/center-a/2026-09-19/windows/window-1"))));
test("Cashier own sanitized view is allowed", async () => {
  assert.equal((await get(ref(cashier1, "operationalViews/center-a/2026-09-19/cashiers/cashier-1/paymentQueue/q1/publicCode"))).val(), "V1-01");
});
test("Unauthenticated operational view is denied", () => denied(get(ref(anonymous, "operationalViews/center-a/2026-09-19/windows/window-1"))));
test("Cross-center operational view is denied", () => denied(get(ref(otherCenterWindow, "operationalViews/center-a/2026-09-19/windows/window-1"))));
test("Cross-window operational view is denied", () => denied(get(ref(window1, "operationalViews/center-a/2026-09-19/windows/window-2"))));
test("Unauthorized cashier scope is denied", () => denied(get(ref(cashier1, "operationalViews/center-a/2026-09-19/cashiers/cashier-2"))));
test("Sibling role scopes cannot be read from their parent", async () => {
  await denied(get(ref(window2, "operationalViews/center-a/2026-09-19/windows")));
  await denied(get(ref(cashier2, "operationalViews/center-a/2026-09-19/cashiers")));
});
