const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const store = fs.readFileSync(path.join(root, "src/store.ts"), "utf8");
const service = fs.readFileSync(path.join(root, "src/services/firebase.ts"), "utf8");
const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");

test("finish adapter delegates to callable and contains no private day mutation", () => {
  const body = store.slice(store.indexOf("export const finishDocumentValidationRealtime"), store.indexOf("const cashierFifo"));
  assert.match(body, /finishWindowDocumentValidationCallable/);
  assert.doesNotMatch(body, /runTransaction|`days\//);
});

test("callable adapter accepts committed outcome-specific projection warnings", () => {
  for (const outcome of ["approved", "incomplete", "rejected"]) {
    assert.match(service, new RegExp(`"${outcome}_projection_failed"`));
  }
  assert.match(store, /if \(!response\.ok \|\| !response\.caseRecord \|\| !response\.events\)/);
});

test("approve incomplete and reject use the shared synchronous pending guard", () => {
  for (const outcome of ["approved", "incomplete", "rejected"]) {
    assert.match(app, new RegExp(`finishDocumentValidationRealtime\\([\\s\\S]{0,180}"${outcome}"`));
  }
  assert.ok(app.split("pendingRef: windowTransitionPendingRef").length - 1 >= 6);
  assert.match(app, /rejectedPhoneIsInvalid \|\| isWindowTransitionPending/);
});

test("controlled failures use clear existing operator feedback", () => {
  assert.match(app, /No pudimos aprobar la documentación\. Intente nuevamente\./);
  assert.match(app, /No pudimos registrar la documentación incompleta\. Intente nuevamente\./);
  assert.match(app, /No pudimos rechazar el trámite\. Intente nuevamente\./);
});

test("remaining direct day transactions are cashier-only", () => {
  const expected = [
    "completePaymentRealtime",
  ];
  assert.equal(store.split("const result = await runTransaction(").length - 1, expected.length);
  for (const name of expected) {
    const start = store.indexOf(`export const ${name}`);
    const end = store.indexOf("\nexport const ", start + 1);
    const body = store.slice(start, end === -1 ? undefined : end);
    assert.match(body, /runTransaction/);
    assert.match(body, /`days\//);
  }
});
