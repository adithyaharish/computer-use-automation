'use strict';
/** Runtime-validated discriminated contracts. See types.d.ts and schemas/. */
class FlowError extends Error {
  constructor(code, details = {}) { super(code); this.code = code; this.details = details; }
}
const own = (x,k) => Object.hasOwn(x,k);
function expect(ok, code = 'INVALID_ARTIFACT') { if (!ok) throw new FlowError(code); }
function keys(value, allowed, required = allowed) {
  expect(value && typeof value === 'object' && !Array.isArray(value));
  expect(Object.keys(value).every(k=>allowed.includes(k)) && required.every(k=>own(value,k)));
}
const identifier = x => typeof x === 'string' && /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(x);
function validateStep(s, artifact) {
  expect(['click','fill','read','check'].includes(s?.action));
  const extra = {click:[],fill:['input'],read:['output'],check:['equalsInput']}[s.action];
  keys(s,['action','target',...extra],['action','target',...(s.action==='fill'?['input']:s.action==='read'?['output']:[])]);
  expect(identifier(s.target) && own(artifact.targets,s.target));
  if(s.action==='fill') expect(identifier(s.input) && own(artifact.inputs,s.input));
  if(s.action==='read') expect(identifier(s.output) && own(artifact.outputs,s.output));
  if(own(s,'equalsInput')) expect(identifier(s.equalsInput) && own(artifact.inputs,s.equalsInput));
  return s;
}
function validateArtifact(a) {
  keys(a,['schemaVersion','name','version','profile','inputs','outputs','targets','steps','checkpoints','provenance']);
  expect(a.schemaVersion===1 && identifier(a.name) && Number.isInteger(a.version) && a.version>0);
  keys(a.profile,['id','vendor','appVersion']);
  expect(Object.values(a.profile).every(x=>typeof x==='string'&&x.length>0&&x.length<100));
  expect(a.inputs && a.outputs && a.targets && Object.keys(a.inputs).length>0 && Object.keys(a.outputs).length>0);
  for(const [name, spec] of Object.entries(a.inputs)) {
    expect(identifier(name)); keys(spec,['type','sensitive']); expect(spec.type==='string' && typeof spec.sensitive==='boolean');
  }
  for(const [name,spec] of Object.entries(a.outputs)) {
    expect(identifier(name)); keys(spec,['type','sensitive']);
    expect(['string','decimal','currency'].includes(spec.type) && typeof spec.sensitive==='boolean');
  }
  for(const [name,t] of Object.entries(a.targets)) {
    expect(identifier(name)); keys(t,['frame','strategy','role','value'],['frame','strategy','value']);
    expect(t.frame==='workspace' && ['label','role','css'].includes(t.strategy));
    expect(typeof t.value==='string' && t.value.length>0 && t.value.length<200);
    if(t.strategy==='role') expect(['button','heading','status','alert'].includes(t.role));
    else expect(!own(t,'role'));
  }
  expect(Array.isArray(a.steps) && a.steps.length>0 && a.steps.length<=30);
  a.steps.forEach(s=>validateStep(s,a));
  expect(Array.isArray(a.checkpoints) && a.checkpoints.length>0 && a.checkpoints.length<=10);
  a.checkpoints.forEach(s=>{validateStep(s,a);expect(s.action==='check');});
  const readNames=a.steps.filter(s=>s.action==='read').map(s=>s.output);
  expect(new Set(readNames).size===readNames.length && Object.keys(a.outputs).every(k=>readNames.includes(k)));
  keys(a.provenance,['mode','model','recordedAt']);
  expect(['openai','bridge','example'].includes(a.provenance.mode));
  expect(typeof a.provenance.model==='string' && a.provenance.model.length<100 && !Number.isNaN(Date.parse(a.provenance.recordedAt)));
  return a;
}
function validateInputs(spec, params) {
  if(!params || typeof params!=='object' || Array.isArray(params) || Object.keys(params).some(k=>!own(spec,k)) ||
    Object.keys(spec).some(k=>!own(params,k)||typeof params[k]!=='string'||params[k].length>128)) throw new FlowError('INVALID_INPUT');
}
function parseOutput(spec, text) {
  const value=text.trim();
  if(spec.type==='decimal' && !/^-?\d{1,15}\.\d{2}$/.test(value)) throw new FlowError('OUTPUT_TYPE_MISMATCH');
  if(spec.type==='currency' && !/^[A-Z]{3}$/.test(value)) throw new FlowError('OUTPUT_TYPE_MISMATCH');
  if(value.length>512 || !value) throw new FlowError('OUTPUT_TYPE_MISMATCH');
  return value; // Decimal strings avoid binary floating-point rounding of currency.
}
module.exports={FlowError,expect,validateArtifact,validateStep,validateInputs,parseOutput};
