const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw new Error("FIREBASE_DATABASE_EMULATOR_HOST is required");

const root = path.resolve(__dirname, "..");
const functionsRequire = createRequire(path.join(root, "functions/package.json"));
const { getDatabase } = functionsRequire("firebase-admin/database");
const { callNextWindowCase, markWindowCaseNoShow } = require(path.join(root, "functions/lib/index.js"));

const projectId = process.env.GCLOUD_PROJECT || "ccvi-f18-emulator";
const date = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
let sequence = 0;

test.after(() => getDatabase().goOffline());

const windowTwo = {
  windowId: "w2", windowNumber: 2, serviceType: "vehicle_owner", serviceLabel: "Propietario",
  validationLevel: "standard", publicCodePrefix: "V2", enabled: true, displayOrder: 2,
};

const makeCase = (centerId, id, arrivalAt) => ({
  caseId: id, publicToken: `token-${id}-${process.pid}`, centerId, sessionId: `${centerId}-${date()}`,
  publicCode: `V2-${String(arrivalAt).padStart(2, "0")}`, globalArrivalSequence: arrivalAt,
  publicSequence: arrivalAt, serviceType: "vehicle_owner", serviceLabel: "Propietario",
  validationLevel: "standard", assignedWindowId: "w2", assignedWindowNumber: 2,
  assignedOperatorId: null, isPriority: false, priorityType: null, priorityCreatedBy: null,
  priorityCreatedAt: null, currentState: "waiting_document_validation", arrivalAt,
  calledToWindowAt: null, documentValidationStartedAt: null, folderCode: null,
  paymentTicketId: null, updatedAt: arrivalAt,
});

const setup = async (database, count) => {
  const id = ++sequence;
  const centerId = `f18-center-${process.pid}-${id}`;
  const uid = `f18-window-${process.pid}-${id}`;
  const cases = Array.from({ length: count }, (_, index) => makeCase(centerId, `case-${index + 1}`, index + 1));
  await database.ref(`centers/${centerId}`).set({
    centerId, enabled: true, timezone: "America/Santiago", windows: { w2: windowTwo },
    documentaryRequirements: { vehicle_owner: {} }, paymentMethods: {},
  });
  await database.ref(`users/${uid}`).set({
    uid, role: "operator-window-2", enabled: true, centerIds: [centerId], centerAccess: { [centerId]: true },
  });
  await database.ref(`days/${centerId}/${date()}`).set({
    metadata: { consecutivePriorityCasesByWindow: { w2: 0 }, windowSequences: { w2: count } },
    cases: Object.fromEntries(cases.map((item) => [item.caseId, item])), events: {}, paymentQueue: {},
  });
  return { centerId, uid, cases };
};

const call = (centerId, uid) => callNextWindowCase.run({
  data: { centerId, windowId: "w2" }, auth: { uid, token: {} }, rawRequest: {},
});
const noShow = (centerId, uid, caseId) => markWindowCaseNoShow.run({
  data: { centerId, caseId }, auth: { uid, token: {} }, rawRequest: {},
});

const assertOnlyActive = async (database, centerId, expectedCaseId) => {
  const display = (await database.ref(`public/displays/${centerId}/${date()}`).get()).val() || {};
  const direct = Object.entries(display).filter(([, value]) => value?.publicCode).map(([key]) => key);
  assert.deepEqual(direct, expectedCaseId ? [expectedCaseId] : []);
};

test("no-show clears the active Window projection and preserves the historical display call", async () => {
  const database = getDatabase();
  const { centerId, uid, cases } = await setup(database, 1);
  try {
    assert.equal((await call(centerId, uid)).outcome, "called");
    assert.equal((await database.ref(`public/displays/${centerId}/${date()}/${cases[0].caseId}`).get()).exists(), true);
    assert.equal((await database.ref(`public/displayCalls/${centerId}/${date()}`).get()).numChildren(), 1);
    assert.equal((await noShow(centerId, uid, cases[0].caseId)).outcome, "no_show");
    assert.equal((await database.ref(`days/${centerId}/${date()}/cases/${cases[0].caseId}/currentState`).get()).val(), "no_show");
    await assertOnlyActive(database, centerId, null);
    assert.equal((await database.ref(`public/displayCalls/${centerId}/${date()}`).get()).numChildren(), 1);
  } finally {
    await database.ref(`centers/${centerId}`).remove(); await database.ref(`users/${uid}`).remove();
    await database.ref(`days/${centerId}`).remove(); await database.ref(`public/displays/${centerId}`).remove();
    await database.ref(`public/displayCalls/${centerId}`).remove();
    for (const item of cases) await database.ref(`public/turns/${item.publicToken}`).remove();
  }
});

for (const [label, count] of [["sequential A to no-show to B", 2], ["repeated no-show leaves C as the only active Window call", 3]]) {
  test(label, async () => {
    const database = getDatabase();
    const { centerId, uid, cases } = await setup(database, count);
    try {
      for (let index = 0; index < count; index += 1) {
        assert.equal((await call(centerId, uid)).outcome, "called");
        await assertOnlyActive(database, centerId, cases[index].caseId);
        if (index < count - 1) {
          assert.equal((await noShow(centerId, uid, cases[index].caseId)).outcome, "no_show");
          await assertOnlyActive(database, centerId, null);
        }
      }
      const history = await database.ref(`public/displayCalls/${centerId}/${date()}`).get();
      assert.equal(history.numChildren(), count);
    } finally {
      await database.ref(`centers/${centerId}`).remove(); await database.ref(`users/${uid}`).remove();
      await database.ref(`days/${centerId}`).remove(); await database.ref(`public/displays/${centerId}`).remove();
      await database.ref(`public/displayCalls/${centerId}`).remove();
      for (const item of cases) await database.ref(`public/turns/${item.publicToken}`).remove();
    }
  });
}

test("Monitor shows calling now only while the matching public projection remains active", () => {
  const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
  const start = app.indexOf("const DisplayView");
  const end = app.indexOf("const DisplayPanel", start);
  const view = app.slice(start, end);
  assert.match(view, /const isActiveCall = .*activeCalls\.some/s);
  assert.match(view, /currentCall && isActiveCall\(currentCall\)/);
  assert.match(view, /newestEvents\.find\(isActiveCall\)/);
  assert.match(view, /entries=\{currentActiveCall \? \[currentActiveCall\] : \[\]\}/);
  assert.match(view, /const recentCalls = newestEvents\.slice\(0, 5\)/);
});
