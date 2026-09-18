const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
const store = fs.readFileSync(path.join(root, "src/store.ts"), "utf8");
const service = fs.readFileSync(path.join(root, "src/services/firebase.ts"), "utf8");
const types = fs.readFileSync(path.join(root, "src/types.ts"), "utf8");
const journey = fs.readFileSync(path.join(root, "src/publicJourney.ts"), "utf8");

test("recoverable documentation state is modeled and has public journey copy", () => {
  assert.match(types, /\| "waiting_documentation"/);
  assert.match(types, /documentationWaitingSince\?: number \| null/);
  assert.match(journey, /case "waiting_documentation"/);
  assert.match(journey, /Documentación pendiente/);
});

test("client adapters use only trusted documentation wait callables", () => {
  const body = store.slice(store.indexOf("export const pauseWindowDocumentationRealtime"), store.indexOf("const cashierFifo"));
  assert.match(body, /pauseWindowForDocumentationCallable/);
  assert.match(body, /resumeWindowDocumentationCallable/);
  assert.doesNotMatch(body, /runTransaction|`days\//);
  assert.match(service, /"documentation_wait_projection_failed"/);
  assert.match(service, /"documentation_resume_projection_failed"/);
});

test("Incomplete opens an explicit recoverable versus terminal decision", () => {
  assert.match(app, /onClick=\{\(\) => setIncompleteDecisionCase\(activeCase\)\}/);
  assert.match(app, /Poner en espera/);
  assert.match(app, /Finalizar atención/);
  assert.match(app, /finishDocumentValidationRealtime\(data, caseId, "incomplete", role\)/);
  assert.match(app, /pauseWindowDocumentationRealtime\(data, caseId, role\)/);
});

test("waiting list shows elapsed time and manual Resume without timeout", () => {
  assert.match(app, /<Typography variant="h5">En espera<\/Typography>/);
  assert.match(app, /Tiempo en espera:/);
  assert.match(app, /formatElapsedWait/);
  assert.match(app, /contentDrivenHeight/);
  assert.match(app, /Retomar atención/);
  assert.match(app, /resumeWindowDocumentationRealtime/);
  assert.doesNotMatch(app, /setTimeout\([\s\S]{0,200}resumeWindowDocumentationRealtime/);
});

test("busy and pending guards prevent Resume dispatch", () => {
  assert.match(app, /disabled=\{Boolean\(activeCase\) \|\| isWindowTransitionPending\}/);
  assert.match(app, /Finalice o libere la atención actual antes de retomar/);
  assert.match(app, /pendingRef: windowTransitionPendingRef/);
});

test("explicit profile windowId precedes safe legacy role derivation", () => {
  const body = store.slice(store.indexOf("export const windowForOperatorProfile"), store.indexOf("export const createArrival"));
  assert.match(body, /profile\.windowId/);
  assert.match(body, /windowItem\.windowId === profile\.windowId/);
  assert.match(body, /windowForRole\(center, profile\.role\)/);
  assert.match(service, /value\.windowId !== undefined/);
});

test("remaining direct day writes are exactly the six Cashier mutations", () => {
  assert.equal(store.split("const result = await runTransaction(").length - 1, 6);
  for (const name of ["callNextForCashierRealtime", "startCashierAttentionRealtime", "completePaymentRealtime", "pausePaymentRealtime", "resumePausedPaymentRealtime", "markNoShowRealtime"]) {
    const start = store.indexOf(`export const ${name}`); const end = store.indexOf("\nexport const ", start + 1);
    const body = store.slice(start, end === -1 ? undefined : end); assert.match(body, /runTransaction/); assert.match(body, /`days\//);
  }
});
