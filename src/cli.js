#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {parseArgs}=require('node:util');
const {Policy}=require('./policy');
const {Evidence}=require('./evidence');
const {BrowserSurface}=require('./surface');
const {Session}=require('./session');
const {Engine}=require('./engine');
const {discover}=require('./discovery');
const {OpenAIModel,StdioModel}=require('./model');
const {startOperator}=require('./operator');
const {startDemo}=require('../demo/server');
const {FlowError}=require('./schema');
const root=path.resolve(__dirname,'..');
const load=p=>JSON.parse(fs.readFileSync(p,'utf8'));
async function main() {
 const {positionals,values:v}=parseArgs({allowPositionals:true,options:{
   goal:{type:'string'},target:{type:'string'},params:{type:'string'},artifact:{type:'string'},out:{type:'string'},
   profile:{type:'string'},contract:{type:'string'},provider:{type:'string',default:'openai'},
   headed:{type:'boolean',default:false},handoff:{type:'boolean',default:false},'operator-port':{type:'string',default:'4311'}
 }});
 const command=positionals[0];
 if(command==='demo') {await startDemo();console.log('Synthetic demo: http://127.0.0.1:4310/bank');return;}
 if(!['discover','replay'].includes(command))throw new FlowError('USAGE_DISCOVER_REPLAY_OR_DEMO');
 const params=JSON.parse(v.params||'{}');
 const profile=load(v.profile||path.join(root,'config/bank.json'));const policy=new Policy(profile);
 if(v.target){policy.url(v.target);if(v.target!==profile.origin+profile.entry)throw new FlowError('ENTRY_POINT_MISMATCH');}
 const dir=path.resolve(v.out||path.join(root,'runs',`${command}-${Date.now()}`));
 if(fs.existsSync(path.join(dir,'events.jsonl')))throw new FlowError('EVIDENCE_DIRECTORY_ALREADY_USED');
 const evidence=new Evidence(dir,Object.values(params));
 let surface,operator,model;
 try {
   if(command==='discover') {
     if(!v.goal)throw new FlowError('GOAL_REQUIRED');
     if(!['openai','bridge'].includes(v.provider))throw new FlowError('UNKNOWN_PROVIDER');
     model=v.provider==='bridge'?new StdioModel():new OpenAIModel();
   }
   surface=await BrowserSurface.create(policy,evidence,v.headed);
   const session=new Session(surface,evidence);const engine=new Engine(surface,policy,evidence,session,{handoff:v.handoff});
   if(v.handoff){operator=await startOperator(session,Number(v['operator-port']));console.error('Operator URL (private, expires with process): '+operator.url);}
   let result;
   if(command==='replay') {
     if(!v.artifact)throw new FlowError('ARTIFACT_REQUIRED');
     result=await engine.replay(load(v.artifact),params);
   }else{
     result=(await discover(engine,model,load(v.contract||path.join(root,'config/savings-contract.json')),params,v.goal)).result;
   }
   // Outputs are intentionally returned to the invoking caller, but redacted in persisted evidence.
   console.log(JSON.stringify(result,null,2));console.error('Evidence: '+dir);
   if(result.status==='failure')process.exitCode=1;
 }catch(e){const result={status:'failure',code:e instanceof FlowError?e.code:'STARTUP_FAILED'};evidence.result(result);console.error(JSON.stringify(result));process.exitCode=1;}
 finally{model?.close?.();operator?.server.close();await surface?.close();}
}
if(require.main===module)main().catch(e=>{console.error(JSON.stringify({status:'failure',code:e instanceof FlowError?e.code:'INVALID_CONFIGURATION'}));process.exitCode=1;});
module.exports={main};
