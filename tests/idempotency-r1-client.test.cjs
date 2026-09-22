const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const app = read("src/App.tsx");
const service = read("src/services/firebase.ts");
const store = read("src/store.ts");
const backend = read("functions/src/index.ts");
const intents = read("src/commandIntent.ts");

test("all four high-risk callable payloads carry commandId", () => {
  assert.match(service, /createKioskArrivalCallable[\s\S]*?callable\(\{ centerId, serviceType, commandId \}\)/);
  assert.match(service, /callNextWindowCaseCallable[\s\S]*?callable\(\{ centerId, windowId, commandId \}\)/);
  assert.match(service, /createPriorityArrivalCallable[\s\S]*?callable\(\{ centerId, priorityType, commandId \}\)/);
  assert.match(service, /callNextCashierCaseCallable = \(centerId: string, commandId: string\)/);
});

test("unresolved commands persist in sessionStorage and use cryptographic UUIDs", () => {
  assert.match(intents, /sessionStorage/); assert.match(intents, /crypto\?\.randomUUID/);
  assert.doesNotMatch(intents, /localStorage/);
});

test("client clears acknowledged commands and retains ambiguous failures", () => {
  assert.match(app, /clearCommandIntent\(commandScope, commandId\)/);
  assert.match(app, /result\.outcome !== "unexpected-error" && result\.outcome !== "idempotency-conflict"/);
  assert.match(app, /catch \{[\s\S]*?No pudimos generar su número/);
});

test("receipt path remains private and is excluded from public projections", () => {
  assert.match(backend, /commandReceipts\/\$\{commandId\}/);
  assert.doesNotMatch(backend, /public\/[^`\n]*commandReceipts/);
  assert.doesNotMatch(backend, /operationalMetadata[\s\S]{0,300}commandReceipts/);
});

test("state-guarded payment completion was not given commandId", () => {
  assert.match(service, /completeCashierPaymentCallable = \(centerId: string, queueItemId: string\)/);
  assert.doesNotMatch(store.slice(store.indexOf("export const completePaymentRealtime")), /commandId/);
});

test("fingerprint excludes volatile IDs and receipts do not store sensitive payloads", () => {
  assert.match(backend, /const commandFingerprint/);
  for (const forbidden of ["rawContact", "priorityReason", "paymentDetails", "fullRequestPayload"]) {
    assert.doesNotMatch(backend, new RegExp(`CommandReceipt[\\s\\S]{0,800}${forbidden}`));
  }
});
