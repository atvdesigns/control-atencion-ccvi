const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
const store = fs.readFileSync(path.join(root, "src/store.ts"), "utf8");
const cashierStart = app.indexOf("const CashierView =");
const cashierEnd = app.indexOf("const PaymentIssueDialog =", cashierStart);
const cashier = app.slice(cashierStart, cashierEnd);
const completionStart = cashier.indexOf("if (completePendingRef.current)");
const completionEnd = cashier.indexOf("</Button>", completionStart);
const completionHandler = cashier.slice(completionStart, completionEnd);
const modalLabel = cashier.indexOf('aria-labelledby="cashier-payment-completion-title"');
const modalStart = cashier.lastIndexOf("<Dialog", modalLabel);
const modalEnd = cashier.indexOf("<PaymentIssueDialog", modalStart);
const modal = cashier.slice(modalStart, modalEnd);

test("committed completion outcomes open the success modal only after the trusted response", () => {
  const call = completionHandler.indexOf("await completePaymentRealtime");
  const open = completionHandler.indexOf("setPaymentCompletion");
  assert.ok(call >= 0 && open > call);
  assert.match(completionHandler, /result\.outcome === "completed"/);
  assert.match(completionHandler, /result\.outcome === "completed_projection_failed"/);
  assert.doesNotMatch(completionHandler.slice(0, call), /setPaymentCompletion/);
});

test("pending and precommit failure paths never open the success modal", () => {
  assert.match(completionHandler, /setCompletePending\(true\)[\s\S]*?await completePaymentRealtime/);
  const catchBlock = completionHandler.slice(completionHandler.indexOf("} catch {"));
  assert.doesNotMatch(catchBlock, /setPaymentCompletion/);
  assert.match(completionHandler, /else if \(result\.outcome !== "completed"\)/);
});

test("success modal uses the approved completion copy and dialog semantics", () => {
  assert.match(modal, /Pago completado/);
  assert.match(modal, /La atención finalizó correctamente\./);
  assert.match(modal, /Carpeta asociada/);
  assert.match(modal, /Puede entregar la documentación al cliente y continuar con la siguiente atención\./);
  assert.match(modal, /Finalizar atención/);
  assert.match(modal, /disableEscapeKeyDown/);
  assert.match(modal, /aria-describedby="cashier-payment-completion-description"/);
});

test("folder presentation comes from committed result data with a safe unavailable state", () => {
  assert.match(completionHandler, /folderCode: result\.data\.cases\[active\.caseId\]\?\.folderCode \?\? null/);
  assert.match(modal, /paymentCompletion\?\.folderCode/);
  assert.match(modal, /No disponible/);
  assert.doesNotMatch(modal, /caseId|paymentQueueId|cashierId|commission|internal timestamp/i);
});

test("Finalizar atención only closes presentation state and cannot replay completion", () => {
  assert.match(modal, /onClick=\{\(\) => setPaymentCompletion\(null\)\}/);
  assert.equal((modal.match(/completePaymentRealtime\(/g) || []).length, 0);
  assert.doesNotMatch(modal, /setData|Firebase|runTransaction|Callable/);
});

test("projection warning preserves completed semantics without replay", () => {
  assert.match(completionHandler, /completed_projection_failed[\s\S]*?setPaymentCompletion/);
  assert.match(completionHandler, /El pago quedó completado, pero no pudimos actualizar el display\. No vuelva a registrarlo\./);
  assert.equal((completionHandler.match(/completePaymentRealtime\(/g) || []).length, 1);
  assert.doesNotMatch(completionHandler, /retry|setTimeout|setInterval/);
});

test("the modal retains only minimal presentation data and does not retain an active case", () => {
  assert.match(cashier, /useState<\{ folderCode: string \| null \} \| null>\(null\)/);
  assert.doesNotMatch(modal, /activeCase|queueItemId|publicCode/);
  assert.doesNotMatch(completionHandler, /setActive|retain|restore/);
});

test("pending payments and normal Call Next remain derived from returned application state", () => {
  assert.match(cashier, /const pausedPayments = Object\.values\(data\.paymentQueue\)/);
  assert.match(cashier, /const canCallNextCashier = !active && waitingCount > 0/);
  assert.match(cashier, /pausedPayments\.map/);
  assert.match(cashier, /disabled=\{!canCallNextCashier \|\| callPending\}/);
  assert.doesNotMatch(modal, /callNextForCashierRealtime|resumePausedPaymentRealtime/);
});

test("the success dialog reuses responsive Window modal tokens without a fixed height", () => {
  assert.match(modal, /modalBackdropSx/);
  assert.match(modal, /modalPaperSx/);
  assert.match(modal, /modalContentSx/);
  assert.match(modal, /modalActionsSx/);
  assert.match(modal, /modalPrimaryActionSx/);
  assert.match(modal, /maxWidth="sm"/);
  assert.match(modal, /minWidth: \{ xs: "100%", sm: 220 \}/);
  assert.doesNotMatch(modal, /height:\s*["'`]?[0-9]/);
});

test("C.2 introduces no client operational-day writer", () => {
  assert.doesNotMatch(store, /runTransaction\(/);
  assert.doesNotMatch(store, /`days\/\$\{base\.selectedCenterId\}/);
  assert.doesNotMatch(modal, /\/days|days\//);
});
