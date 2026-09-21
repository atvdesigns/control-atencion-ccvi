const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'src/centerJourneyConfig.ts'), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {exports:exportsObject});
const plain = value => JSON.parse(JSON.stringify(value));
const expected = {
  vehicle_owner: ['Oficio de Devolución (Orden de liberación) del Juzgado de Policía Local.', 'Cédula de Identidad vigente.', 'Certificado de Anotaciones Vigentes o padrón emitido no más de 30 días.', 'Permiso de circulación, SOAP y Revisión Técnica.'],
  representation: ['Poder notarial vigente y/o Certificado de Vigencia de Poderes con máximo 60 días de antigüedad.', 'Cédula de Identidad vigente.', 'Oficio de devolución (Orden de liberación).', 'Certificado de Anotaciones Vigentes (CAV) del vehículo, con una antigüedad máxima de 30 días desde su fecha de emisión.', 'Copia de la Escritura de Constitución de la sociedad.', 'Permiso de circulación, SOAP y Revisión Técnica.'],
};
for(const service of Object.keys(expected)) test(`${service}: exact content, order, enabled and unique IDs`,()=>{
 const items=plain(exportsObject.createDefaultDocumentaryRequirements())[service];
 assert.deepEqual(items.map(x=>x.label),expected[service]);
 assert.ok(items.every(x=>x.enabled===true));assert.equal(new Set(items.map(x=>x.requirementId)).size,items.length);
});
test('missing and empty configuration use current defaults',()=>{
 const defaults=plain(exportsObject.createDefaultDocumentaryRequirements());
 assert.deepEqual(plain(exportsObject.normalizeDocumentaryRequirements()),defaults);
 assert.deepEqual(plain(exportsObject.normalizeDocumentaryRequirements({vehicle_owner:[],representation:[]})),defaults);
});
test('persisted requirements override templates and retain disabled semantics',()=>{
 const supplied={requirementId:'configured',label:' Requisito configurado ',enabled:false};
 assert.deepEqual(plain(exportsObject.normalizeDocumentaryRequirements({vehicle_owner:[supplied]})).vehicle_owner,[{...supplied,label:'Requisito configurado'}]);
});
test('default clones do not mutate templates',()=>{
 const a=exportsObject.createDefaultDocumentaryRequirements();a.vehicle_owner[0].label='Changed';
 assert.equal(exportsObject.createDefaultDocumentaryRequirements().vehicle_owner[0].label,expected.vehicle_owner[0]);
});
test('public renderer retains projection-driven content and approved heading',()=>{
 const component=fs.readFileSync(path.join(root,'src/components/PublicJourneyInformation.tsx'),'utf8');
 const app=fs.readFileSync(path.join(root,'src/App.tsx'),'utf8');
 assert.ok(component.includes('Documentos obligatorios que se solicitan:'));
 assert.ok(component.includes('primary={requirement.label}'));
 assert.doesNotMatch(component,/serviceType|DEFAULT_REQUIREMENTS/);
 assert.ok(app.includes('turnStatus?.requirements.map'));
});
