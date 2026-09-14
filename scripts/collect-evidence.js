'use strict';
const {spawn,spawnSync}=require('node:child_process');
const fs=require('node:fs');const path=require('node:path');const http=require('node:http');
const {verifyHandoff}=require('./verify-handoff');
const root=path.resolve(__dirname,'..');
const cli=path.join(root,'src/cli.js');
const dir=path.join(root,'evidence',`live-${new Date().toISOString().replace(/[:.]/g,'-')}`);
const goal='Look up the member supplied as member_id, open their savings account and return the available balance and currency.';
function command(args,expectedStatus,expected={}){
 const r=spawnSync(process.execPath,[cli,...args],{cwd:root,env:process.env,encoding:'utf8',timeout:200000});
 if(r.stderr)process.stderr.write(r.stderr);
 // Invocation values and output amounts are synthetic; no raw stdout is persisted.
 if(r.error)throw Error('Child process did not finish.');
 let result;try{result=JSON.parse(r.stdout);}catch{throw Error('No structured result was returned.');}
 if(result.status!==expectedStatus){
   console.error(JSON.stringify({status:result.status,code:result.code,step:result.step,httpStatus:result.httpStatus,providerCode:result.providerCode}));
   throw Error('Run did not produce the expected outcome; see the sanitized diagnostic above.');
 }
 if(expected.code && result.code!==expected.code)throw Error('Wrong exceptional outcome.');
 if(expected.balance && (result.outputs?.balance!==expected.balance || result.outputs?.currency!=='USD'))throw Error('Wrong extracted output.');
 if(expectedStatus==='success' && result.checkpointVerified!==true)throw Error('Checkpoint was not verified.');
 return result;
}
function ready(){return new Promise(resolve=>{http.get('http://127.0.0.1:4310/bank',r=>{r.resume();resolve(r.statusCode===200)}).on('error',()=>resolve(false));});}
async function main(){
 if(!process.env.OPENAI_API_KEY)throw Error('Export OPENAI_API_KEY first. Never put the key in source control.');
 if(await ready())throw Error('Port 4310 already serves an application. Stop your demo instance, then retry.');
 fs.mkdirSync(dir,{recursive:true});
 const demo=spawn(process.execPath,[cli,'demo'],{cwd:root,stdio:'ignore'});
 try{
  for(let i=0;i<30&&!await ready();i++)await new Promise(r=>setTimeout(r,100));
  if(!await ready())throw Error('Demo did not start.');
  command(['discover','--goal',goal,'--target','http://127.0.0.1:4310/bank','--params','{"member_id":"12345"}','--out',path.join(dir,'discovery')],'success',{balance:'2480.75'});
  const artifact=path.join(dir,'discovery/capability.json');
  for(const [name,id,status,expected] of [['replay','67890','success',{balance:'8150.20'}],['not-found','99999','business_outcome',{code:'MEMBER_NOT_FOUND'}],['notice','40900','success',{balance:'900.00'}],['slow-load','40800','success',{balance:'330.50'}],['permission-denied','40300','failure',{code:'PERMISSION_DENIED'}]]){
    command(['replay','--artifact',artifact,'--params',JSON.stringify({member_id:id}),'--out',path.join(dir,name)],status,expected);
  }
  await verifyHandoff(artifact,path.join(dir,'handoff'));
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({genuineApiDiscovery:true,discoveryArtifact:'discovery/capability.json',replayUsesModel:false,humanHandoff:'Real browser and HTTP control transfer verified with a clearly labeled scripted operator client; not a real-human recording.',completedAt:new Date().toISOString()},null,2)+'\n');
  console.log('Live evidence collected: '+dir);
 }finally{demo.kill();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
