const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const functionsSource = fs.readFileSync(path.join(root, "functions/src/index.ts"), "utf8");
const firebaseSource = fs.readFileSync(path.join(root, "src/services/firebase.ts"), "utf8");
const displaySource = fs.readFileSync(path.join(root, "src/publicDisplayProjection.ts"), "utf8");

const compiledDisplay = ts.transpileModule(displaySource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const displayModule = {};
new Function("exports", compiledDisplay)(displayModule);

const {
  hasUniqueWindowPublicCodePrefixes,
  publicDisplayProjectionUpdates,
} = require(path.join(root, "functions/lib/index.js"));

const entry = (overrides = {}) => ({
  publicCode: "V2-08",
  isPriority: false,
  status: "Diríjase a Ventanilla 2",
  destination: "Ventanilla 2",
  updatedAt: 8,
  ...overrides,
});

test("enabled Window publicCode prefixes are valid and unique", () => {
  const windowItem = (windowId, publicCodePrefix, enabled = true) => ({ windowId, publicCodePrefix, enabled });
  assert.equal(hasUniqueWindowPublicCodePrefixes([
    windowItem("window-1", "V1"), windowItem("window-2", "V2"),
  ]), true);
  assert.equal(hasUniqueWindowPublicCodePrefixes([
    windowItem("window-1", "V1"), windowItem("window-2", "V1"),
  ]), false);
  assert.equal(hasUniqueWindowPublicCodePrefixes([windowItem("window-1", "unsafe/key")]), false);
  assert.equal(hasUniqueWindowPublicCodePrefixes([
    windowItem("window-1", "V1"), windowItem("disabled-window", "V1", false),
  ]), true, "disabled windows do not issue public codes");
});

test("projection update writes only the publicCode key and atomically removes both legacy keys", () => {
  const projection = entry();
  const updates = publicDisplayProjectionUpdates("center", "2026-09-21", "internal-case-id", "V2-08", projection);
  assert.deepEqual(updates, {
    "public/displays/center/2026-09-21/V2-08": projection,
    "public/displays/center/2026-09-21/internal-case-id": null,
    "public/displays/center/2026-09-21/cases/internal-case-id": null,
  });
  assert.equal(JSON.stringify(projection).includes("internal-case-id"), false);
  assert.equal(JSON.stringify(projection).includes("publicToken"), false);
});

test("projection removal clears canonical and legacy forms without dual writing", () => {
  const updates = publicDisplayProjectionUpdates("center", "2026-09-21", "internal-case-id", "V2-08", null);
  assert.deepEqual(updates, {
    "public/displays/center/2026-09-21/V2-08": null,
    "public/displays/center/2026-09-21/internal-case-id": null,
    "public/displays/center/2026-09-21/cases/internal-case-id": null,
  });
});

test("Monitor reader supports legacy-only and canonical-only projections", () => {
  assert.deepEqual(displayModule.publicDisplayEntriesFromSnapshot({ "legacy-case-id": entry() }), [entry()]);
  assert.deepEqual(displayModule.publicDisplayEntriesFromSnapshot({ "V2-08": entry() }), [entry()]);
});

test("Monitor deduplicates by publicCode and always prefers its canonical key", () => {
  const legacy = entry({ status: "legacy", updatedAt: 99 });
  const canonical = entry({ status: "canonical", updatedAt: 8 });
  assert.deepEqual(displayModule.publicDisplayEntriesFromSnapshot({
    "V2-08": canonical,
    "legacy-case-id": legacy,
    cases: { "legacy-case-id": legacy },
  }), [canonical]);
  assert.deepEqual(displayModule.publicDisplayEntriesFromSnapshot({
    "legacy-case-id": legacy,
    "V2-08": canonical,
  }), [canonical], "canonical preference must not depend on snapshot key order");
});

test("every trusted Window and Cashier display flow routes through the canonical update primitive", () => {
  const usageCount = (functionsSource.match(/publicDisplayProjectionUpdates\(/g) || []).length;
  assert.equal(usageCount, 9, "one declaration plus all eight projection families");

  for (const marker of [
    "export const createPriorityArrival", "export const updateCasePriority",
    "const createWindowTransitionCallable", "export const finishWindowDocumentValidation",
    "const createDocumentationWaitCallable", "export const reassignWindowCase",
    "export const callNextWindowCase", "const cashierProjection", "const cashierFollowupProjection",
  ]) assert.ok(functionsSource.includes(marker), `missing trusted flow: ${marker}`);

  assert.equal((functionsSource.match(/`public\/displays\//g) || []).length, 1,
    "all backend display paths must be isolated in the canonical helper");
  assert.match(firebaseSource, /publicDisplayEntryUpdate\(centerId, dayId, caseId, publicCode, entry\)/);
  assert.match(firebaseSource, /publicDisplayEntryUpdate\(centerId, dayId, caseId, publicCode, null\)/);
});

test("publicToken remains isolated to public turns and displayCalls stays identifier-safe", () => {
  const displayCallBlocks = [...functionsSource.matchAll(/updates\[`public\/displayCalls[\s\S]*?\n\s*};/g)]
    .map((match) => match[0]).join("\n");
  assert.ok(displayCallBlocks.length > 0);
  assert.doesNotMatch(displayCallBlocks, /caseId|publicToken/);
  assert.match(functionsSource, /`public\/turns\/\$\{[^}]*publicToken[^}]*\}`/);
  assert.doesNotMatch(displaySource, /caseId|publicToken/);
});

test("QR path and frozen prioritization/FIFO primitives remain present", () => {
  assert.match(functionsSource, /public\/turns/);
  assert.match(functionsSource, /consecutivePriorityCases/);
  assert.match(functionsSource, /approvedAt/);
});
