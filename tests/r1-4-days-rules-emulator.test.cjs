const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { createRequire } = require("node:module");

if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) {
  throw new Error("FIREBASE_DATABASE_EMULATOR_HOST is required");
}

const root = path.resolve(__dirname, "..");
const req = createRequire(path.join(root, "package.json"));
const functionsReq = createRequire(path.join(root, "functions/package.json"));
const { initializeApp, deleteApp } = req("firebase/app");
const { initializeApp: initializeAdminApp, deleteApp: deleteAdminApp } = functionsReq("firebase-admin/app");
const {
  connectDatabaseEmulator,
  get,
  getDatabase,
  ref,
  remove,
  runTransaction,
  set,
  update,
} = req("firebase/database");
const { getDatabase: getAdminDatabase } = functionsReq("firebase-admin/database");

const projectId = "ccvi-r1-4-rules-emulator";
const [emulatorHost, emulatorPortText] = process.env.FIREBASE_DATABASE_EMULATOR_HOST.split(":");
const emulatorPort = Number(emulatorPortText);
const centerId = "rules-center";
const dayId = "2026-09-19";
const apps = [];

const profile = (uid, role) => ({
  uid,
  role,
  enabled: true,
  centerIds: [centerId],
  centerAccess: { [centerId]: true },
  ...(role.startsWith("operator-window-") ? { windowId: role.endsWith("1") ? "window-1" : "window-2" } : {}),
  ...(role === "cashier" ? { cashierId: "cashier-1" } : {}),
});

const client = (label, uid = null) => {
  const app = initializeApp(
    { projectId, databaseURL: `https://${projectId}-default-rtdb.firebaseio.com` },
    `${label}-${process.pid}-${apps.length}`,
  );
  apps.push(app);
  const database = getDatabase(app);
  const options = uid
    ? { mockUserToken: { sub: uid, user_id: uid, aud: projectId, iss: `https://securetoken.google.com/${projectId}` } }
    : undefined;
  connectDatabaseEmulator(database, emulatorHost, emulatorPort, options);
  return database;
};

const denied = async (operation) => {
  await assert.rejects(
    operation,
    (error) =>
      error?.code === "PERMISSION_DENIED" ||
      error?.code === "permission-denied" ||
      /permission_denied/i.test(error?.message ?? ""),
  );
};

let adminDb;
let adminApp;
let anonymousDb;
let adminClient;
let windowClient;
let cashierClient;

test.before(async () => {
  adminApp = initializeAdminApp({
    projectId,
    databaseURL: `https://${projectId}-default-rtdb.firebaseio.com`,
  });
  adminDb = getAdminDatabase();
  await adminDb.ref().set({
    users: {
      admin: profile("admin", "admin"),
      window: profile("window", "operator-window-1"),
      cashier: profile("cashier", "cashier"),
    },
    centers: {
      [centerId]: { centerId, enabled: true, rulesTestMarker: "initial" },
    },
    days: {
      [centerId]: {
        [dayId]: {
          metadata: { consecutivePriorityCasesForCashier: 0 },
          cases: { caseA: { publicCode: "V1-01", currentState: "waiting_window" } },
          paymentQueue: { queueA: { publicCode: "V1-01", state: "waiting_cashier" } },
        },
      },
    },
  });
  anonymousDb = client("anonymous");
  adminClient = client("admin", "admin");
  windowClient = client("window", "window");
  cashierClient = client("cashier", "cashier");
});

test.after(async () => {
  await Promise.all(apps.map((app) => deleteApp(app)));
  await adminDb.ref().remove();
  await adminDb.goOffline();
  await deleteAdminApp(adminApp);
});

test("unauthenticated write at /days is denied", async () => {
  await denied(set(ref(anonymousDb, "days"), { exploit: true }));
});

test("authenticated Admin day write is denied", async () => {
  await denied(set(ref(adminClient, `days/${centerId}/${dayId}`), { exploit: true }));
});

test("authenticated Window day write is denied", async () => {
  await denied(set(ref(windowClient, `days/${centerId}/${dayId}`), { exploit: true }));
});

test("authenticated Cashier day write is denied", async () => {
  await denied(set(ref(cashierClient, `days/${centerId}/${dayId}`), { exploit: true }));
});

test("Admin descendant case update is denied", async () => {
  await denied(update(ref(adminClient, `days/${centerId}/${dayId}/cases/caseA`), { currentState: "completed" }));
});

test("Window descendant case update and removal are denied", async () => {
  await denied(update(ref(windowClient, `days/${centerId}/${dayId}/cases/caseA`), { publicCode: "ALTERED" }));
  await denied(remove(ref(windowClient, `days/${centerId}/${dayId}/cases/caseA`)));
});

test("Cashier descendant payment queue update is denied", async () => {
  await denied(update(ref(cashierClient, `days/${centerId}/${dayId}/paymentQueue/queueA`), { state: "completed" }));
});

test("Cashier parent day deletion is denied", async () => {
  await denied(remove(ref(cashierClient, `days/${centerId}/${dayId}`)));
});

test("parent multi-location update touching /days is denied atomically", async () => {
  await denied(update(ref(adminClient), {
    [`days/${centerId}/${dayId}/cases/caseA/currentState`]: "completed",
    [`centers/${centerId}/rulesTestMarker`]: "must-not-commit",
  }));
  assert.equal((await adminDb.ref(`centers/${centerId}/rulesTestMarker`).get()).val(), "initial");
});

test("transaction-style client mutation under /days is denied", async () => {
  await denied(runTransaction(ref(windowClient, `days/${centerId}/${dayId}/metadata/consecutivePriorityCasesForCashier`), (value) => (value ?? 0) + 1));
});

test("original parent rewrite exploit is denied after authorized reads", async () => {
  for (const database of [windowClient, cashierClient]) {
    const dayRef = ref(database, `days/${centerId}/${dayId}`);
    const snapshot = await get(dayRef);
    assert.equal(snapshot.exists(), true);
    const rewritten = snapshot.val();
    rewritten.cases.siblingExploit = { publicCode: "V1-99", currentState: "completed" };
    await denied(set(dayRef, rewritten));
  }
});

test("required Window Cashier and Admin day reads remain allowed", async () => {
  for (const database of [windowClient, cashierClient, adminClient]) {
    const snapshot = await get(ref(database, `days/${centerId}/${dayId}`));
    assert.equal(snapshot.child("cases/caseA/publicCode").val(), "V1-01");
  }
});

test("representative unrelated permitted center write retains its existing Admin contract", async () => {
  await set(ref(adminClient, `centers/${centerId}/rulesTestMarker`), "admin-write-allowed");
  assert.equal((await adminDb.ref(`centers/${centerId}/rulesTestMarker`).get()).val(), "admin-write-allowed");
  await denied(set(ref(windowClient, `centers/${centerId}/rulesTestMarker`), "window-write-denied"));
});
