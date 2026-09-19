const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
const store = fs.readFileSync(path.join(root, "src/store.ts"), "utf8");
const functions = fs.readFileSync(path.join(root, "functions/src/index.ts"), "utf8");

const approvalHandler = app.slice(
  app.indexOf('request: () => finishDocumentValidationRealtime(\n                              data'),
  app.indexOf('onError: () => onFeedback("No pudimos aprobar la documentación.'),
);
const handoffTitleIndex = app.indexOf('aria-labelledby="approval-handoff-title"');
const handoffDialogStart = app.lastIndexOf("<Dialog", handoffTitleIndex);
const handoffDialog = app.slice(handoffDialogStart, app.indexOf("\n      <Dialog\n", handoffTitleIndex + 1));

test("Approved consumes the authoritative committed case and opens the handoff dialog", () => {
  assert.match(functions, /outcome: "approved" as const, caseRecord: nextCase/);
  assert.match(store, /outcome: response\.outcome, caseRecord: response\.caseRecord/);
  assert.match(approvalHandler, /result\.outcome === "approved"/);
  assert.match(approvalHandler, /result\.outcome === "approved_projection_failed"/);
  assert.match(approvalHandler, /setApprovalHandoffCase\(result\.caseRecord\)/);
});

test("dialog presents the exact returned folderCode with the approved copy", () => {
  const committedCaseFixture = { folderCode: "NTE-F017" };
  assert.equal(committedCaseFixture.folderCode, "NTE-F017");
  assert.match(handoffDialog, /Documentación aprobada/);
  assert.match(handoffDialog, /El trámite documental finalizó correctamente\./);
  assert.match(handoffDialog, /Carpeta asignada/);
  assert.match(handoffDialog, /approvalHandoffCase\?\.folderCode/);
  assert.match(handoffDialog, /Anote este número en la carpeta física\. El usuario continuará su atención en caja\./);
});

test("explicit acknowledgement closes the dialog without another mutation", () => {
  assert.match(handoffDialog, /Finalizar atención/);
  assert.match(handoffDialog, /onClick=\{\(\) => setApprovalHandoffCase\(null\)\}/);
  assert.doesNotMatch(handoffDialog, /finishDocumentValidationRealtime|runTransaction|days\//);
});

test("incomplete rejected waiting and failures cannot open the approval handoff", () => {
  const nonApproved = app.slice(app.indexOf("const [rejectionDialogCase"), app.indexOf("const CashierView"));
  assert.equal(nonApproved.split("setApprovalHandoffCase(result.caseRecord)").length - 1, 1);
  assert.doesNotMatch(app.slice(app.indexOf('request: () => finishDocumentValidationRealtime(data, caseId, "incomplete"'), app.indexOf("</Dialog>", app.indexOf('request: () => finishDocumentValidationRealtime(data, caseId, "incomplete"'))), /setApprovalHandoffCase/);
  assert.doesNotMatch(app.slice(app.indexOf('"rejected",\n                  role'), app.indexOf("</Dialog>", app.indexOf('"rejected",\n                  role'))), /setApprovalHandoffCase/);
  assert.doesNotMatch(app.slice(app.indexOf("pauseWindowDocumentationRealtime"), app.indexOf("</Dialog>", app.indexOf("pauseWindowDocumentationRealtime"))), /setApprovalHandoffCase/);
  assert.doesNotMatch(approvalHandler, /onError:[\s\S]*setApprovalHandoffCase/);
});

test("dialog requires explicit completion and uses generic authoritative data", () => {
  assert.match(handoffDialog, /disableEscapeKeyDown/);
  assert.doesNotMatch(handoffDialog, /onClose=/);
  assert.doesNotMatch(handoffDialog, /SB-F|SB-|W1|W2|San Bernardo/);
  assert.match(handoffDialog, /whiteSpace: "nowrap"/);
  assert.match(handoffDialog, /fontSize: "clamp\(/);
  assert.match(handoffDialog, /aria-labelledby="approval-handoff-title"/);
  assert.match(handoffDialog, /aria-describedby="approval-handoff-description"/);
});

test("recently processed retains folderCode and no Window day write is introduced", () => {
  assert.match(app, /<Typography variant="h5">Procesados recientemente<\/Typography>/);
  assert.match(app, /label=\{`Carpeta \$\{caseItem\.folderCode\}`\}/);
  assert.equal(store.split("const result = await runTransaction(").length - 1, 6);
});
