const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const root = path.resolve(__dirname, "..");
const functionsRequire = createRequire(path.join(root, "functions/package.json"));
const { resolveAuthorizedWindow } = functionsRequire("./lib/index.js");
const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");

const centerId = "center-a";
const windows = [
  { windowId: "configured-w1", windowNumber: 1, enabled: true },
  { windowId: "configured-w2", windowNumber: 2, enabled: true },
  { windowId: "dynamic-w3", windowNumber: 3, enabled: true },
];
const profile = (uid, role, extra = {}) => ({
  uid,
  role,
  enabled: true,
  centerIds: [centerId],
  centerAccess: { [centerId]: true },
  ...extra,
});

test("legacy Window 1 resolves by the configured windowNumber", () => {
  assert.equal(resolveAuthorizedWindow(profile("w1", "operator-window-1"), "w1", centerId, windows)?.windowId, "configured-w1");
});

test("legacy Window 2 resolves by the configured windowNumber", () => {
  assert.equal(resolveAuthorizedWindow(profile("w2", "operator-window-2"), "w2", centerId, windows)?.windowId, "configured-w2");
});

test("explicit windowId takes precedence and remains supported", () => {
  assert.equal(resolveAuthorizedWindow(profile("w3", "operator-window-1", { windowId: "dynamic-w3" }), "w3", centerId, windows)?.windowId, "dynamic-w3");
});

test("unknown explicit binding fails closed instead of falling back to W1", () => {
  assert.equal(resolveAuthorizedWindow(profile("bad", "operator-window-1", { windowId: "missing" }), "bad", centerId, windows), null);
});

test("unbound role disabled user and cross-center access are denied", () => {
  assert.equal(resolveAuthorizedWindow(profile("u", "operator-window-3"), "u", centerId, windows), null);
  assert.equal(resolveAuthorizedWindow(profile("u", "operator-window-1", { enabled: false }), "u", centerId, windows), null);
  assert.equal(resolveAuthorizedWindow(profile("u", "operator-window-1"), "u", "other-center", windows), null);
});

test("frontend reuses the established profile resolver for the subscription path", () => {
  const start = app.indexOf("const resolvedOperatorWindow");
  const end = app.indexOf("const unsubscribe = subscribeToOperationalDay", start);
  const subscriptionScope = app.slice(start, end);
  assert.match(subscriptionScope, /windowForOperatorProfile\(getCurrentCenter\(data\), authenticatedProfile\)/);
  assert.match(subscriptionScope, /windowId: resolvedOperatorWindow\.windowId/);
  assert.doesNotMatch(subscriptionScope, /windowId: authenticatedProfile\.windowId/);
});
