const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const store = fs.readFileSync(path.join(root, "src/store.ts"), "utf8");
const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");

test("persisted application state excludes private operational collections", () => {
  const start = store.indexOf("export const saveData");
  const end = store.indexOf("export const event", start);
  const body = store.slice(start, end);
  assert.match(body, /sessions: \{\}/);
  assert.match(body, /cases: \{\}/);
  assert.match(body, /paymentQueue: \{\}/);
  assert.match(body, /events: \[\]/);
});

test("legacy persisted private collections are discarded during load", () => {
  const start = store.indexOf("export const loadData");
  const end = store.indexOf("export const saveData", start);
  assert.match(store.slice(start, end), /sessions: \{\}, cases: \{\}, paymentQueue: \{\}, events: \[\]/);
});

test("cashier identity and commission details are not persisted", () => {
  const start = store.indexOf("export const saveData");
  const end = store.indexOf("export const event", start);
  assert.match(store.slice(start, end), /cashierName: _cashierName/);
  assert.match(store.slice(start, end), /cashierCommissionRate: undefined/);
});

test("logout removes persisted private cache before Firebase sign-out", () => {
  const start = app.indexOf("const handleLogout");
  const end = app.indexOf("useEffect", start);
  const body = app.slice(start, end);
  assert.ok(body.indexOf("clearPrivateOperationalCache()") < body.indexOf("signOutCurrentUser()"));
});

test("logout clears remote and in-memory private state synchronously", () => {
  const start = app.indexOf("const handleLogout");
  const end = app.indexOf("useEffect", start);
  const body = app.slice(start, end);
  assert.match(body, /setRemoteOperationalDay\(null\)/);
  assert.match(body, /clearPrivateOperationalState/);
  assert.match(body, /setAuthSession\(\{ status: "loading"/);
});

test("every auth identity transition invalidates previous operational state", () => {
  const start = app.indexOf("useEffect(() => observeAuthSession");
  const body = app.slice(start, start + 420);
  assert.match(body, /invalidateOperationalAuthority/);
  assert.match(body, /setRemoteOperationalDay\(null\)/);
  assert.match(body, /clearPrivateOperationalState/);
});

test("private subscription requires an authenticated scoped profile", () => {
  assert.match(app, /if \(!authenticatedProfile\) return/);
  assert.match(app, /windowForOperatorProfile\(getCurrentCenter\(data\), authenticatedProfile\)/);
  assert.match(app, /role: "window" as const, windowId: resolvedOperatorWindow\.windowId/);
  assert.match(app, /role: "cashier" as const, cashierId: authenticatedProfile\.cashierId/);
});

test("public role preference remains separate from private cache", () => {
  assert.match(app, /localStorage\.setItem\("ccvi-role", nextRole\)/);
  assert.doesNotMatch(store.slice(store.indexOf("export const clearPrivateOperationalCache"), store.indexOf("export const event")), /ccvi-role/);
});
