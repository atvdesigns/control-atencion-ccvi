const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const store = fs.readFileSync(path.join(root, "src/store.ts"), "utf8");
const service = fs.readFileSync(path.join(root, "src/services/firebase.ts"), "utf8");
const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");

test("start and no-show adapters contain no direct private day mutation", () => {
  const start = store.slice(store.indexOf("export const startValidationRealtime"), store.indexOf("export const markWindowNoShow"));
  const noShow = store.slice(store.indexOf("export const markWindowNoShowRealtime"), store.indexOf("export const markCaseAsPriority"));
  assert.match(start, /startWindowValidationCallable/); assert.doesNotMatch(start, /runTransaction|`days\//);
  assert.match(noShow, /markWindowCaseNoShowCallable/); assert.doesNotMatch(noShow, /runTransaction|`days\//);
});

test("client accepts committed projection-warning outcomes", () => {
  assert.match(service, /"started_projection_failed"/);
  assert.match(service, /"no_show_projection_failed"/);
  assert.match(service, /if \(result\.data\.ok && \(!result\.data\.caseRecord \|\| !result\.data\.event\)\)/);
});

test("both buttons share a synchronous pending guard", () => {
  assert.match(app, /windowTransitionPendingRef/);
  assert.equal(app.split("disabled={isWindowTransitionPending}").length - 1, 2);
  assert.equal(app.split("pendingRef: windowTransitionPendingRef").length - 1, 2);
});

test("controlled failures use existing safe operator feedback", () => {
  assert.match(app, /No pudimos iniciar la validación\. Intente nuevamente\./);
  assert.match(app, /No pudimos registrar que la persona no se presentó\. Intente nuevamente\./);
  assert.doesNotMatch(app, /INVALID_WINDOW_TRANSITION_RESPONSE/);
});
