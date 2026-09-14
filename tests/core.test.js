'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {harness}=require('./helpers');const {validateArtifact,parseOutput,validateInputs}=require('../src/schema');
const {discover,validateDecision}=require('../src/discovery');const {OpenAIModel}=require('../src/model');const contract=require('../config/savings-contract.json');
function setup(t,options){const h=harness(options);t.after(h.cleanup);return h;}
test('replay returns typed outputs, verifies identity, and has no model dependency',async t=>{
 const h=setup(t);const result=await h.engine.replay(h.artifact,{member_id:'67890'});
 assert.deepEqual(result,{status:'success',outputs:{balance:'8150.20',currency:'USD'},checkpointVerified:true,modelCalls:0});
 assert.equal(h.surface.calls.filter(c=>c.action==='check').length,2);
});
test('not found is a business outcome and stops before opening an account',async t=>{
 const h=setup(t);const r=await h.engine.replay(h.artifact,{member_id:'99999'});
 assert.equal(r.status,'business_outcome');assert.equal(r.code,'MEMBER_NOT_FOUND');assert.equal(r.step,3);
 assert.equal(h.surface.calls.some(c=>c.target==='openSavings'),false);
});
test('permission denial is a hard failure with evidence',async t=>{
 const h=setup(t);const r=await h.engine.replay(h.artifact,{member_id:'40300'});
 assert.equal(r.code,'PERMISSION_DENIED');assert.ok(fs.existsSync(path.join(h.dir,'state-3.json')));
});
test('known notice is dismissed by a bounded deterministic recovery',async t=>{
 const h=setup(t);const r=await h.engine.replay(h.artifact,{member_id:'40900'});
 assert.equal(r.status,'success');assert.equal(h.surface.calls.filter(c=>c.target==='acknowledge').length,1);
});
test('missing control times out with expected and observed diagnostics',async t=>{
 const h=setup(t);h.surface.missing=true;const r=await h.engine.replay(h.artifact,{member_id:'67890'});
 assert.equal(r.code,'TARGET_TIMEOUT');assert.equal(r.expected,'one_visible_match');assert.equal(r.observed,'no_visible_match');
});
test('wrong member checkpoint suppresses otherwise valid outputs',async t=>{
 const h=setup(t);h.surface.wrongMember=true;const r=await h.engine.replay(h.artifact,{member_id:'67890'});
 assert.equal(r.code,'IDENTITY_MISMATCH');assert.equal(r.outputs,undefined);
});
test('malformed amount is rejected without leaking the raw value',async t=>{
 const h=setup(t);h.surface.badOutput=true;const r=await h.engine.replay(h.artifact,{member_id:'67890'});
 assert.equal(r.code,'OUTPUT_TYPE_MISMATCH');assert.ok(!JSON.stringify(r).includes('NaN'));
});
test('artifact cannot grant itself irreversible actions',async t=>{
 const h=setup(t);h.artifact.steps.unshift({action:'click',target:'closeAccount'});
 const r=await h.engine.replay(h.artifact,{member_id:'67890'});assert.equal(r.code,'RISKY_ACTION_BLOCKED');assert.equal(h.surface.calls.length,0);
});
test('selector substitution is rejected against external policy',async t=>{
 const h=setup(t);h.artifact.targets.search.value='Close account';
 const r=await h.engine.replay(h.artifact,{member_id:'67890'});assert.equal(r.code,'TARGET_BINDING_MISMATCH');assert.equal(h.surface.calls.length,0);
});
test('version mismatch fails closed before actions',async t=>{
 const h=setup(t);h.artifact.profile.appVersion='2';const r=await h.engine.replay(h.artifact,{member_id:'67890'});assert.equal(r.code,'PROFILE_MISMATCH');
});
test('URL policy rejects lookalikes, credentials, queries, routes and schemes',t=>{
 const h=setup(t);h.policy.url('http://127.0.0.1:4310/bank');
 for(const u of ['http://127.0.0.1:4310.evil.test/bank','http://127.0.0.1:4310/bank?secret=x','http://u:p@127.0.0.1:4310/bank','http://127.0.0.1:4310/delete','javascript:alert(1)','https://127.0.0.1:4310/bank','http://127.0.0.1:4310/bank#secret'])assert.throws(()=>h.policy.url(u));
});
test('strict schema rejects arbitrary code, unknown fields, duplicate outputs and literal data',t=>{
 const h=setup(t);validateArtifact(h.artifact);
 for(const mutate of [a=>a.schemaVersion=2,a=>a.steps[0].value='12345',a=>a.steps[0].action='evaluate',a=>a.steps[0].input='missing',a=>a.steps.push(a.steps[3]),a=>a.checkpoints=[]]){
  const a=structuredClone(h.artifact);mutate(a);assert.throws(()=>validateArtifact(a));
 }
 assert.throws(()=>validateInputs(h.artifact.inputs,{member_id:12345}));assert.throws(()=>validateInputs(h.artifact.inputs,{member_id:'12345',extra:'x'}));
});
test('amounts stay exact decimal strings',()=>{assert.equal(parseOutput({type:'decimal'},'8150.20'),'8150.20');for(const x of ['8,150.20','8.2','Infinity','$12.00'])assert.throws(()=>parseOutput({type:'decimal'},x));});
test('logs and persisted results omit invocation data and output values',async t=>{
 const h=setup(t);await h.engine.replay(h.artifact,{member_id:'67890'});
 const bytes=fs.readdirSync(h.dir).map(f=>fs.readFileSync(path.join(h.dir,f),'utf8')).join('');
 assert.ok(!bytes.includes('67890'));assert.ok(!bytes.includes('8150.20'));assert.ok(bytes.includes('[REDACTED]'));
});
test('session expiry without an operator returns an intervention request indicator',async t=>{
 const h=setup(t);const r=await h.engine.replay(h.artifact,{member_id:'40100'});assert.equal(r.code,'SESSION_EXPIRED');assert.equal(r.interventionRequired,true);
});
test('handoff resumes on the identical surface after a simulated operator action',async t=>{
 const h=setup(t,{handoff:true});const original=h.session.surface;
 const run=h.engine.replay(h.artifact,{member_id:'40100'});
 while(h.session.owner==='automation')await new Promise(r=>setTimeout(r,1));
 assert.equal(h.session.owner,'paused');h.session.acquire();
 await assert.rejects(h.session.resume(),/BLOCKER_REMAINS/);
 await h.session.act({action:'click',target:'restoreSession'});await h.session.resume();
 const result=await run;assert.equal(result.status,'success');assert.equal(h.session.surface,original);
 const events=fs.readFileSync(path.join(h.dir,'events.jsonl'),'utf8');assert.ok(events.includes('human_action'));
});
test('abandoned intervention times out rather than hanging',async t=>{
 const h=setup(t,{handoff:true});h.session.humanTimeoutMs=10;const r=await h.engine.replay(h.artifact,{member_id:'40100'});assert.equal(r.code,'INTERVENTION_ABORTED');assert.equal(h.session.owner,'aborted');
});
test('control cannot be acquired twice or resumed during an in-flight action',async t=>{
 const h=setup(t);const pending=h.session.escalate({reason:'TEST'});h.session.acquire();assert.throws(()=>h.session.acquire(),/CONTROL_CONFLICT/);
 h.session.busy=true;await assert.rejects(h.session.resume(),/CONTROL_CONFLICT/);h.session.busy=false;h.session.abort();assert.equal(await pending,false);
});
test('test-double discovery records parameters, not literal values (not real LLM evidence)',async t=>{
 const h=setup(t);const decisions=[...h.artifact.steps.map(step=>({step,reason:step.action==='read'?'extract_output':step.action==='fill'?'enter_input':'navigate'})),{done:true,reason:'verify_goal'}];
 const model={mode:'example',model:'unit-test-double',calls:0,async decide(){return decisions[this.calls++];}};
 const {result,artifact}=await discover(h.engine,model,contract,{member_id:'67890'},'Read the savings balance');
 assert.equal(result.status,'success');assert.equal(result.modelCalls,6);validateArtifact(artifact);assert.ok(!JSON.stringify(artifact).includes('67890'));
});
test('model cannot declare success without extracting the declared outputs',async t=>{
 const h=setup(t);const model={mode:'example',model:'unit-test-double',calls:1,async decide(){return {done:true,reason:'verify_goal'};}};
 const {result,artifact}=await discover(h.engine,model,contract,{member_id:'67890'},'Read balance');assert.equal(result.code,'INCOMPLETE_OUTPUTS');assert.equal(artifact,undefined);
});
test('invalid model actions are rejected before execution',t=>{
 const h=setup(t);for(const d of [{done:true,help:true,reason:'verify_goal'},{step:{action:'evaluate',target:'search'},reason:'navigate'},{done:true,reason:'dump secrets'}])assert.throws(()=>validateDecision(d,h.artifact));
});
test('API adapter passes structured observations and does not persist provider bodies',async()=>{
 let sent;const model=new OpenAIModel({key:'test-only-key',model:'test-model',fetchImpl:async(url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:'{"done":true,"reason":"verify_goal"}'}}]})};}});
 assert.equal((await model.decide({goal:'Test',observation:{controls:[]}})).done,true);assert.equal(sent.response_format.type,'json_object');assert.equal(model.calls,1);
 const bad=new OpenAIModel({key:'test-only-key',fetchImpl:async()=>({ok:false,status:401})});await assert.rejects(bad.decide({}),/MODEL_HTTP_ERROR/);
});
