'use strict';
const fs=require('node:fs');
const {Policy}=require('../src/policy');
const {Evidence}=require('../src/evidence');
const {BrowserSurface}=require('../src/surface');
const {Session}=require('../src/session');
const {Engine}=require('../src/engine');
const {startOperator}=require('../src/operator');
const {FlowError}=require('../src/schema');
/** Scripted operator client, real HTTP handoff and real browser. Never claimed to be a human demonstration. */
async function verifyHandoff(artifactPath,dir){
 const artifact=JSON.parse(fs.readFileSync(artifactPath,'utf8'));
 const policy=new Policy(require('../config/bank.json'));
 const evidence=new Evidence(dir,['40100']);
 const surface=await BrowserSurface.create(policy,evidence);
 const session=new Session(surface,evidence,{humanTimeoutMs:15000});
 const engine=new Engine(surface,policy,evidence,session,{handoff:true});
 const originalPage=surface.page;
 let operator,run;
 try{
  operator=await startOperator(session,4311);
  const url=new URL(operator.url);const token=url.hash.slice(1);
  async function api(endpoint,body){
   const response=await fetch(url.origin+endpoint,{method:'POST',headers:{'X-Operator-Token':token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});
   if(!response.ok)throw new FlowError('HANDOFF_HTTP_FAILED');return response.json();
  }
  evidence.event('verification_actor',{actor:'scripted_operator_client',liveBrowser:true,realHuman:false});
  run=engine.replay(artifact,{member_id:'40100'});
  const deadline=Date.now()+10000;
  while(session.owner==='automation'&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,30));
  if(session.owner!=='paused'||session.request?.reason!=='SESSION_EXPIRED')throw new FlowError('EXPECTED_INTERVENTION_MISSING');
  await api('/acquire',{});
  await api('/action',{action:'click',target:'restoreSession'});
  await api('/resume',{});
  const result=await run;
  if(result.status!=='success'||result.outputs.balance!=='125.00'||surface.page!==originalPage)throw new FlowError('HANDOFF_VERIFICATION_FAILED');
  evidence.json('handoff-verification.json',{actor:'scripted_operator_client',realHuman:false,liveBrowser:true,samePage:true,sessionId:session.id,verified:true});
  return result;
 }finally{
  if(session.resolve&&!session.busy)session.abort();
  if(run)await run.catch(()=>{});
  if(operator)await new Promise(resolve=>operator.server.close(resolve));
  await surface.close();
 }
}
module.exports={verifyHandoff};
