'use strict';
// Real Chromium tests, run separately: npm run test:browser.
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const {startDemo}=require('../demo/server');const {Policy}=require('../src/policy');const {Evidence}=require('../src/evidence');const {BrowserSurface}=require('../src/surface');const {Session}=require('../src/session');const {Engine}=require('../src/engine');
const profile=require('../config/bank.json');const artifact=require('../config/example-capability.json');
async function setup(t,options={}){
 const server=await startDemo(0);t.after(()=>server.close());
 const p=structuredClone(profile);p.origin=`http://127.0.0.1:${server.address().port}`;
 const policy=new Policy(p);const dir=fs.mkdtempSync(path.join(os.tmpdir(),'browser-flow-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const evidence=new Evidence(dir);const surface=await BrowserSurface.create(policy,evidence);t.after(()=>surface.close());
 const session=new Session(surface,evidence,{humanTimeoutMs:5000});const engine=new Engine(surface,policy,evidence,session,options);
 return {surface,session,engine,dir};
}
for(const [member,status,code,balance] of [
 ['12345','success',null,'2480.75'],['67890','success',null,'8150.20'],['99999','business_outcome','MEMBER_NOT_FOUND'],
 ['bad','business_outcome','VALIDATION_ERROR'],['40300','failure','PERMISSION_DENIED'],['50000','failure','APP_UNAVAILABLE'],
 ['40800','success',null,'330.50'],['40900','success',null,'900.00'],['40100','failure','SESSION_EXPIRED']
])test(`live browser: ${member} -> ${code||status}`,async t=>{
 const h=await setup(t);const result=await h.engine.replay(artifact,{member_id:member});
 assert.equal(result.status,status,JSON.stringify(result));if(code)assert.equal(result.code,code);if(balance)assert.equal(result.outputs.balance,balance);
 if(code)assert.ok(fs.readdirSync(h.dir).some(f=>f.startsWith('state-')));
});
test('live browser: pause, simulated operator restore, resume same browser page',async t=>{
 const h=await setup(t,{handoff:true});const page=h.surface.page;const run=h.engine.replay(artifact,{member_id:'40100'});
 const deadline=Date.now()+10000;while(h.session.owner==='automation'&&Date.now()<deadline)await new Promise(r=>setTimeout(r,20));
 assert.equal(h.session.owner,'paused');h.session.acquire();await h.session.act({action:'click',target:'restoreSession'});await h.session.resume();
 assert.equal((await run).status,'success');assert.equal(h.surface.page,page);
});
test('live browser: duplicate controls stop before ambiguous click',async t=>{
 const h=await setup(t);await h.surface.open();await h.surface.page.frame({name:'workspace'}).evaluate(()=>{const b=document.createElement('button');b.textContent='Search';document.body.append(b);});
 await assert.rejects(h.surface.available('search'),/AMBIGUOUS_TARGET/);
});
test('live browser: request policy blocks off-allowlist data transmission',async t=>{
 const h=await setup(t);await h.surface.open();await h.surface.page.evaluate(()=>fetch('/forbidden').catch(()=>{}));
 await assert.rejects(h.surface.guard(),/NETWORK_POLICY_BLOCK/);
});
