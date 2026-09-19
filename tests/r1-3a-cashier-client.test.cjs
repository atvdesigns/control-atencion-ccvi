const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const store = fs.readFileSync(path.join(root, "src/store.ts"), "utf8");
const service = fs.readFileSync(path.join(root, "src/services/firebase.ts"), "utf8");
const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
const body = (source, name) => {
  const start = source.indexOf(`export const ${name}`);
  const end = source.indexOf("\nexport const ", start + 1);
  return source.slice(start, end === -1 ? undefined : end);
};

test("Call Next and Start delegate to trusted callables without private day writes", () => {
  assert.match(body(store, "callNextForCashierRealtime"), /callNextCashierCaseCallable/);
  assert.match(body(store, "startCashierAttentionRealtime"), /startCashierAttentionCallable/);
  for (const name of ["callNextForCashierRealtime", "startCashierAttentionRealtime"]) {
    assert.doesNotMatch(body(store, name), /runTransaction|`days\//);
  }
});

test("callable payloads contain no cashier authority supplied by the browser", () => {
  assert.match(service, /callNextCashierCaseCallable = \(centerId: string\)/);
  assert.match(service, /startCashierAttentionCallable = \(centerId: string, queueItemId: string\)/);
  assert.doesNotMatch(body(service, "callNextCashierCaseCallable"), /cashierId|uid|role/);
});

test("only deferred Complete Payment retains a direct private transaction", () => {
  assert.equal(store.split("const result = await runTransaction(").length - 1, 1);
  for (const name of ["completePaymentRealtime"]) {
    assert.match(body(store, name), /runTransaction/);
    assert.match(body(store, name), /`days\//);
  }
});

test("Call Next and Start have separate synchronous pending guards and clear feedback", () => {
  assert.match(app, /callPendingRef\.current/);
  assert.match(app, /startPendingRef\.current/);
  assert.match(app, /called_projection_failed/);
  assert.match(app, /started_projection_failed/);
  assert.match(app, /No pudimos confirmar si el turno fue asignado/);
  assert.match(app, /No pudimos confirmar el inicio de la atención/);
});

test("no automatic retry or command id was introduced", () => {
  const callStart = `${body(store, "callNextForCashierRealtime")}\n${body(store, "startCashierAttentionRealtime")}`;
  assert.doesNotMatch(callStart, /setTimeout|retry|commandId|idempotency/i);
});
