const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const store = fs.readFileSync(path.join(root, "src/store.ts"), "utf8");
const service = fs.readFileSync(path.join(root, "src/services/firebase.ts"), "utf8");
const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
const fn = fs.readFileSync(path.join(root, "functions/src/index.ts"), "utf8");
const body = (source, name) => {
  const start = source.indexOf(`export const ${name}`);
  const end = source.indexOf("\nexport const ", start + 1);
  assert.notEqual(start, -1, `missing ${name}`);
  return source.slice(start, end === -1 ? undefined : end);
};

test("Complete Payment delegates to the trusted callable with no private day write", () => {
  const complete = body(store, "completePaymentRealtime");
  assert.match(complete, /completeCashierPaymentCallable/);
  assert.doesNotMatch(complete, /runTransaction|`days\//);
  assert.match(service, /completeCashierPaymentCallable = \(centerId: string, queueItemId: string\)/);
  assert.match(fn, /export const completeCashierPayment = onCall/);
});

test("production frontend contains no direct operational day writer", () => {
  assert.doesNotMatch(store, /runTransaction\(/);
  assert.doesNotMatch(store, /`days\/\$\{base\.selectedCenterId\}/);
});

test("browser payload cannot supply cashier identity, commission, name, role, or timestamp", () => {
  const callable = body(service, "completeCashierPaymentCallable");
  assert.doesNotMatch(callable, /cashierId|commission|cashierName|role|timestamp|uid/);
});

test("Complete Payment has a synchronous pending guard and disables its control", () => {
  assert.match(app, /completePendingRef\.current/);
  assert.match(app, /disabled=\{completePending\}/);
  assert.match(app, /completePending \? "Completando…" : "Pago completado"/);
});

test("projection warning is explicit and does not replay completion", () => {
  assert.match(app, /result\.outcome === "completed_projection_failed"/);
  assert.match(app, /El pago quedó completado, pero no pudimos actualizar el display\. No vuelva a registrarlo\./);
  const handlerStart = app.indexOf("if (completePendingRef.current)");
  const handler = app.slice(handlerStart, app.indexOf("</Button>", handlerStart));
  assert.equal((handler.match(/completePaymentRealtime\(/g) || []).length, 1);
  assert.doesNotMatch(handler, /retry|setTimeout|setInterval/);
});

test("successful callable response uses the established merge contract", () => {
  const complete = body(store, "completePaymentRealtime");
  assert.match(complete, /mergeCashierCommandResponse/);
  assert.match(app, /setData\(\(\) => result\.data\)/);
});

test("existing completion UI copy and action remain present without redesign", () => {
  assert.match(app, /"Pago completado"/);
  assert.match(app, /variant="contained"[\s\S]*?color="success"[\s\S]*?completePaymentRealtime/);
});
