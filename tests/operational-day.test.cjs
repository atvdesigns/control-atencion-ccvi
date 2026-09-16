const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const incidentTime = Date.parse("2026-09-12T02:20:00Z");
class IncidentDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : [incidentTime]));
  }
  static now() { return incidentTime; }
}

// Compile existing source in memory. Never initialize Firebase or browser storage.
function loadSource(file, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, {
    exports, Date: IncidentDate, Intl,
    require(name) {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}
const config = loadSource("src/centerJourneyConfig.ts");
const store = loadSource("src/store.ts", {
  "./centerJourneyConfig": config,
  "./services/firebase": { database: null },
});

const dateCases = [
  ["2026-09-11T23:59:59Z", "America/Santiago", "2026-09-11"],
  ["2026-09-12T00:00:00Z", "America/Santiago", "2026-09-11"],
  ["2026-09-12T02:59:59Z", "America/Santiago", "2026-09-11"],
  ["2026-09-12T03:00:00Z", "America/Santiago", "2026-09-12"],
  ["2026-07-12T03:59:59Z", "America/Santiago", "2026-07-11"],
  ["2026-07-12T04:00:00Z", "America/Santiago", "2026-07-12"],
  ["2027-01-01T02:59:59Z", "America/Santiago", "2026-12-31"],
  ["2027-01-01T03:00:00Z", "America/Santiago", "2027-01-01"],
  ["2026-09-12T02:20:00Z", "UTC", "2026-09-12"],
];
for (const [instant, timezone, expected] of dateCases) {
  test(`${timezone} operational date at ${instant}`, () => {
    assert.equal(store.todayId(timezone, new Date(instant)), expected);
  });
}

test("fresh browser selects the incident's Santiago day, not the UTC day", () => {
  const data = store.createInitialData();
  assert.equal(store.getSessionId(data), "ccvi-san-bernardo-2026-09-11");
  assert.equal(store.getCurrentSession(data).date, "2026-09-11");
});

test("session selection uses each center's configured timezone", () => {
  const data = store.createInitialData();
  data.centers[data.selectedCenterId].timezone = "UTC";
  const next = store.ensureSession(data);
  assert.equal(store.getCurrentSession(next).date, "2026-09-12");
  assert.ok(next.sessions["ccvi-san-bernardo-2026-09-11"]);
});

test("opening the corrected day preserves the misdated session and existing cases", () => {
  const data = store.createInitialData();
  const correctId = store.getSessionId(data);
  const misdatedId = "ccvi-san-bernardo-2026-09-12";
  const savedSession = { ...data.sessions[correctId], sessionId: misdatedId, date: "2026-09-12" };
  data.sessions = { [misdatedId]: savedSession };
  data.cases = { preferred: { centerId: data.selectedCenterId, sessionId: misdatedId, publicCode: "V1-01", isPriority: true } };
  const savedCases = data.cases;
  const next = store.ensureSession(data);
  assert.equal(store.getCurrentSession(next).date, "2026-09-11");
  assert.equal(next.sessions[misdatedId], savedSession);
  assert.equal(next.cases, savedCases);
  assert.equal(next.paymentQueue, data.paymentQueue);
  assert.equal(next.events, data.events);
});

test("local day derivation agrees with the callable's actual date helper", () => {
  const source = ts.createSourceFile("index.ts", fs.readFileSync(path.join(root, "functions/src/index.ts"), "utf8"), ts.ScriptTarget.Latest, true);
  const declaration = source.statements.find((node) => ts.isVariableStatement(node) && node.declarationList.declarations.some((decl) => decl.name.getText(source) === "dateTimeInZone"));
  assert.ok(declaration);
  const exports = {};
  const code = ts.transpileModule(`${declaration.getText(source)}\nexports.dateTimeInZone = dateTimeInZone;`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports, Intl, HttpsError: Error });
  for (const [instant, timezone] of dateCases) {
    assert.equal(store.todayId(timezone, new Date(instant)), exports.dateTimeInZone(new Date(instant), timezone).dayId);
  }
});
