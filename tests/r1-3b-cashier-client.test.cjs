const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs'); const path = require('node:path');
const root = path.resolve(__dirname, '..');
const store = fs.readFileSync(path.join(root,'src/store.ts'),'utf8');
const service = fs.readFileSync(path.join(root,'src/services/firebase.ts'),'utf8');
const app = fs.readFileSync(path.join(root,'src/App.tsx'),'utf8');
const fn = fs.readFileSync(path.join(root,'functions/src/index.ts'),'utf8');
const body=(s,n)=>{const a=s.indexOf(`export const ${n}`); const b=s.indexOf('\nexport const ',a+1); return s.slice(a,b<0?undefined:b)};
test('follow-up mutations delegate to trusted callables without day writes',()=>{
  for(const [name,call] of [['pausePaymentRealtime','pauseCashierPaymentCallable'],['resumePausedPaymentRealtime','resumeCashierPaymentCallable'],['markNoShowRealtime','markCashierCaseNoShowCallable']]){assert.match(body(store,name),new RegExp(call));assert.doesNotMatch(body(store,name),/runTransaction|`days\//)}
  assert.equal(store.split('const result = await runTransaction(').length-1,1); assert.match(body(store,'completePaymentRealtime'),/runTransaction/);
});
test('browser payload never supplies cashier authority',()=>{
  assert.match(service,/pauseCashierPaymentCallable = \(centerId: string, queueItemId: string, note: string \| null\)/);
  assert.match(service,/resumeCashierPaymentCallable = \(centerId: string, queueItemId: string\)/);
  assert.match(service,/markCashierCaseNoShowCallable = \(centerId: string, queueItemId: string\)/);
  for(const n of ['pauseCashierPaymentCallable','resumeCashierPaymentCallable','markCashierCaseNoShowCallable']) assert.doesNotMatch(body(service,n),/cashierId|uid|role/);
});
test('all commands have synchronous duplicate guards and ambiguity feedback',()=>{
 for(const n of ['pausePendingRef','resumePendingRef','noShowPendingRef']) assert.match(app,new RegExp(`${n}\\.current`));
 assert.match(app,/No pudimos confirmar si el pago quedó pendiente/); assert.match(app,/No pudimos confirmar si la atención fue retomada/); assert.match(app,/No pudimos confirmar si la inasistencia quedó registrada/);
});
test('no retry command id or business-hours guard added',()=>{const delta=fn.slice(fn.indexOf('const cashierFollowupInput'));assert.doesNotMatch(delta,/setTimeout|commandId|serviceStartTime|serviceEndTime|isOpen/i)});
test('trusted callable exports and typed projection warnings exist',()=>{for(const n of ['pauseCashierPayment','resumeCashierPayment','markCashierCaseNoShow'])assert.match(fn,new RegExp(`export const ${n} = onCall`));for(const n of ['paused_projection_failed','resumed_projection_failed','no_show_projection_failed'])assert.match(service,new RegExp(n))});
test('private note is absent from public projection',()=>{const a=fn.indexOf('const cashierFollowupProjection'); const b=fn.indexOf('const executeCashierFollowupCallable',a); assert.doesNotMatch(fn.slice(a,b),/optionalInternalNote|optionalNote|note/) });
test('Cashier active and pending cards use the approved fluid operator card family',()=>{
  assert.match(app,/prominent showPriorityLabel operatorStyle fluidWidth/);
  assert.match(app,/showPriorityLabel\s+operatorStyle\s+contentDrivenHeight/);
  assert.match(app,/width: fluidWidth \|\| \(operatorStyle && !prominent\) \? "100%"/);
});
test('pending cards remove redundant prose and safely wrap historical notes',()=>{
  assert.doesNotMatch(app,/El pago no fue completado\. Retome este turno cuando la persona pueda continuar en caja\./);
  assert.match(app,/overflowWrap: "anywhere", wordBreak: "break-word"/);
  assert.match(app,/\{pausedCase\.optionalInternalNote\}/);
});
test('Pause note UI enforces and reports the 100 character boundary',()=>{
  assert.match(app,/inputProps=\{\{ maxLength: 100 \}\}/);
  assert.match(app,/\{note\.length\}\/100/);
});
test('trusted Pause input rejects normalized notes over 100 characters',()=>{
  assert.match(fn,/const note = operation === "pause"[\s\S]*?input\.note\.trim\(\)/);
  assert.match(fn,/if \(note && note\.length > 100\) return null/);
});
