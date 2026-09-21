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
  vehicle_owner: ['Oficio de Devolución (Orden de liberación) del Juzgado de Policía Local.', 'Cédula de Identidad vigente.', 'Certificado de Anotaciones Vigentes (CAV) o padrón del vehículo, con una antigüedad no mayor de 30 días desde su fecha de emisión.'],
  representation: ['Poder notarial vigente y/o Certificado de Vigencia de Poderes con máximo 60 días de antigüedad.', 'Cédula de Identidad vigente.', 'Oficio de devolución (Orden de liberación).', 'Certificado de Anotaciones Vigentes (CAV) o padrón del vehículo, con una antigüedad no mayor de 30 días desde su fecha de emisión.', 'Copia de la Escritura de Constitución de la sociedad.'],
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

test('final client counts, retained IDs and excluded documentation',()=>{
 const requirements=plain(exportsObject.createDefaultDocumentaryRequirements());
 assert.equal(requirements.vehicle_owner.length,3);
 assert.equal(requirements.representation.length,5);
 assert.deepEqual(requirements.vehicle_owner.map(x=>x.requirementId),['owner-return-order','owner-current-identity','owner-current-annotations']);
 assert.deepEqual(requirements.representation.map(x=>x.requirementId),['representation-valid-powers','representation-legal-representative-identity','representation-return-order','representation-current-annotations','representation-company-statutes']);
 assert.equal(requirements.vehicle_owner[2].label,requirements.representation[3].label);
 for(const items of Object.values(requirements)){
   assert.doesNotMatch(items.map(x=>x.label).join(' '),/Permiso de circulación|SOAP|Revisión Técnica/i);
   assert.ok(items.every(x=>!x.requirementId.endsWith('-vehicle-documents')));
 }
});
