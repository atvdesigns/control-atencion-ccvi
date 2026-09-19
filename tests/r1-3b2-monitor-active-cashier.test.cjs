const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
const functions = fs.readFileSync(path.join(root, "functions/src/index.ts"), "utf8");
const service = fs.readFileSync(path.join(root, "src/services/firebase.ts"), "utf8");

const between = (source, startText, endText) => {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start + startText.length);
  assert.notEqual(start, -1, `missing ${startText}`);
  assert.notEqual(end, -1, `missing ${endText}`);
  return source.slice(start, end);
};

const displayView = between(app, "const DisplayView", "const DisplayPanel");
const followupProjection = between(
  functions,
  "const cashierFollowupProjection",
  "const executeCashierFollowupCallable",
);
const cashierProjection = between(
  functions,
  "const cashierProjection",
  "const executeCashierCallable",
);
const displayEntryProjection = between(
  service,
  "export const toPublicDisplayEntry",
  "export const publicTurnStatusUpdate",
);

test("Monitor derives current stations from the active public display projection, not status copy", () => {
  assert.match(displayView, /const activeCalls = activeEntries\s*\.map/);
  assert.doesNotMatch(displayView, /filter\(\(entry\) => \/\^Diríjase a/);
  assert.match(displayView, /destinationType: \/\^Ventanilla\\b\/i\.test\(entry\.destination\) \? "window" : "cashier"/);
});

test("called and in-attention states are both eligible public display entries", () => {
  for (const state of ["called_to_cashier", "in_cashier_attention"]) {
    assert.match(displayEntryProjection, new RegExp(`"${state}"`));
  }
  for (const state of ["paused", "completed", "no_show"]) {
    assert.doesNotMatch(displayEntryProjection, new RegExp(`"${state}"`));
  }
});

test("Call creates one display call while Start only updates the current display", () => {
  assert.match(cashierProjection, /if \(includeCall\) updates\[`public\/displayCalls/);
  assert.match(functions, /cashierProjection\(database, center, cashier, dayId, committed, operation === "call"\)/);
});

test("Pause and no-show clear the current display and Resume restores it", () => {
  assert.match(followupProjection, /operation === "resume" \? \{/);
  assert.match(followupProjection, /\} : null/);
  assert.match(followupProjection, /operation === "resume" \? "Atención en caja"/);
});

test("Resume uses the authoritative resumed cashier and creates no call event", () => {
  assert.match(followupProjection, /const destination = operation === "no_show"[\s\S]*?: cashier\.name/);
  assert.doesNotMatch(followupProjection, /displayCalls|includeCall/);
});

test("Monitor remains realtime and adds no polling or forced refresh", () => {
  assert.match(displayView, /subscribeToPublicDisplay\(/);
  assert.doesNotMatch(displayView, /setInterval|location\.reload|window\.reload/);
});
