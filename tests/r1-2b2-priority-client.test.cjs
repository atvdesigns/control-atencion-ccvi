const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const store = fs.readFileSync(path.join(root, "src/store.ts"), "utf8");
const service = fs.readFileSync(path.join(root, "src/services/firebase.ts"), "utf8");
const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");

test("existing-case priority adapters use the one trusted callable", () => {
  const section = store.slice(store.indexOf("const mutateCasePriorityRealtime"), store.indexOf("export const reassignCase"));
  assert.match(section, /updateCasePriorityCallable/);
  assert.doesNotMatch(section, /runTransaction|`days\//);
  assert.match(section, /"set"/); assert.match(section, /"change"/); assert.match(section, /"remove"/);
});

test("legacy createArrivalRealtime direct private write path is retired", () => {
  assert.doesNotMatch(store, /export const createArrivalRealtime/);
  assert.doesNotMatch(app, /createArrivalRealtime/);
});

test("callable client contract preserves typed committed projection warnings", () => {
  assert.match(service, /"updated_projection_failed"/);
  assert.match(service, /"removed_projection_failed"/);
  assert.match(service, /if \(result\.data\.ok && \(!result\.data\.caseRecord \|\| !result\.data\.event\)\)/);
});

test("operator receives safe feedback for rejected or failed mutations", () => {
  const message = "No pudimos actualizar la atención preferencial. Intente nuevamente.";
  assert.equal(app.split(message).length - 1, 2);
  assert.doesNotMatch(app, /INVALID_PRIORITY_MUTATION_RESPONSE/);
});

test("Totem and preferential creation remain on their established callables", () => {
  assert.match(app, /createKioskArrivalCallable/);
  assert.match(store, /createPriorityArrivalCallable/);
});
