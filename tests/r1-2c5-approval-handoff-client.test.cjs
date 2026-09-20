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
const incompleteTitleIndex = app.indexOf('aria-labelledby="incomplete-documentation-title"');
const incompleteDialogStart = app.lastIndexOf("<Dialog", incompleteTitleIndex);
const incompleteDialog = app.slice(incompleteDialogStart, app.indexOf("\n      <Dialog\n", incompleteTitleIndex + 1));
const rejectionTitleIndex = app.indexOf('aria-labelledby="rejection-contact-title"');
const rejectionDialogStart = app.lastIndexOf("<Dialog", rejectionTitleIndex);
const rejectionDialog = app.slice(rejectionDialogStart, app.indexOf("\n      </Page>", rejectionTitleIndex + 1));

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
  assert.match(handoffDialog, /fontSize: \{ xs: "3\.25rem", sm: "5rem" \}/);
  assert.match(handoffDialog, /aria-labelledby="approval-handoff-title"/);
  assert.match(handoffDialog, /aria-describedby="approval-handoff-description"/);
  assert.match(handoffDialog, /modalPaperSx/);
  assert.match(handoffDialog, /modalBackdropSx/);
  assert.match(handoffDialog, /modalPrimaryActionSx/);
  assert.match(handoffDialog, /color="secondary"/);
});

test("operational dialogs share Figma-aligned geometry and action semantics", () => {
  assert.match(app, /const modalPaperSx = \{[\s\S]*borderRadius: "24px"[\s\S]*boxShadow: modalShadow/);
  assert.match(app, /const modalPrimaryActionSx = \{[\s\S]*minHeight: 56[\s\S]*borderRadius: "12px"[\s\S]*fontSize: 18/);
  assert.match(incompleteDialog, /Documentación incompleta[\s\S]*modalTertiaryActionSx[\s\S]*Poner en espera[\s\S]*Finalizar atención/);
  assert.doesNotMatch(incompleteDialog, /color="warning"/);
  assert.match(rejectionDialog, /Registrar contacto[\s\S]*modalTertiaryActionSx[\s\S]*color="error"[\s\S]*Guardar y rechazar/);
  assert.match(app, /Confirmar y obtener número/);
  assert.doesNotMatch(app, /<br\s*\/?\s*>/);
});

test("incomplete and rejection dialogs use the Window modal hierarchy without changing actions", () => {
  assert.match(app, /const WindowDialogHeader = \(\{[\s\S]*borderRadius: "0 0 12px 12px"[\s\S]*bgcolor: "primary\.main"/);
  assert.match(app, /aria-labelledby="incomplete-documentation-title"[\s\S]*maxWidth="md"[\s\S]*modalWindowPaperSx[\s\S]*severity="warning"/);
  assert.match(app, /Documentación incompleta[\s\S]*Cancelar[\s\S]*Poner en espera[\s\S]*Finalizar atención/);
  assert.match(app, /flexWrap: \{ xs: "wrap", sm: "nowrap" \}/);
  assert.match(app, /aria-labelledby="rejection-contact-title"[\s\S]*modalWindowPaperSx[\s\S]*Registre al contacto rechazado/);
  assert.match(app, /Registrar contacto[\s\S]*Ambos campos son opcionales[\s\S]*htmlFor="rejected-customer-name"[\s\S]*htmlFor="rejected-customer-phone"[\s\S]*Guardar y rechazar/);
});

test("recently processed retains folderCode and no Window day write is introduced", () => {
  assert.match(app, /<Typography variant="h5">Procesados recientemente<\/Typography>/);
  assert.match(app, /label=\{`Carpeta \$\{caseItem\.folderCode\}`\}/);
  assert.equal(store.split("const result = await runTransaction(").length - 1, 0);
});
