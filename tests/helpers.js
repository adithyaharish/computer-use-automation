'use strict';
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {Policy}=require('../src/policy');const {Evidence}=require('../src/evidence');const {Session}=require('../src/session');const {Engine}=require('../src/engine');
const profile=require('../config/bank.json');const example=require('../config/example-capability.json');
/** Deterministic in-memory Surface test double; explicitly NOT live browser evidence. */
class FakeSurface {
 constructor(policy){this.policy=policy;this.state='search';this.calls=[];this.restored=false;this.released=false;this.missing=false;}
 async open(){this.state='search';}
 async available(t){if(this.missing)return false;return ['memberInput','search'].includes(t)||this.state==='member'&&t==='openSavings'||this.state==='savings'&&['balance','currency','memberReference','savingsHeading'].includes(t);}
 async perform(s,value,owner='automation'){
  this.policy.action(s,owner);this.calls.push({action:s.action,target:s.target,owner});
  if(s.action==='fill')this.member=value;
  if(s.target==='search'){
   if(this.member==='99999')this.state='missing';else if(this.member==='40300')this.state='denied';
   else if(this.member==='40100'&&!this.restored)this.state='expired';else if(this.member==='40900')this.state='notice';
   else this.state='member';
  }
  if(s.target==='restoreSession'){this.restored=true;this.state='member';}
  if(s.target==='acknowledge')this.state='member';
  if(s.target==='openSavings')this.state='savings';
  if(s.action==='read')return s.target==='balance'?(this.badOutput?'NaN':'8150.20'):'USD';
  if(s.equalsInput&&this.wrongMember)throw new (require('../src/schema').FlowError)('IDENTITY_MISMATCH');
 }
 async signal(){return {missing:{kind:'business',code:'MEMBER_NOT_FOUND'},denied:{kind:'hard',code:'PERMISSION_DENIED'},expired:{kind:'human',code:'SESSION_EXPIRED'},notice:{kind:'recoverable',code:'KNOWN_NOTICE',actionTarget:'acknowledge'}}[this.state]||null;}
 async observe(){return {state:this.state,controls:[]};}
 async evidenceOnFailure(step){this.evidence?.json(`state-${step}.json`,{syntheticTestDouble:true,state:this.state});}
 async close(){}
}
function harness(options={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'computer-use-test-'));const policy=new Policy(profile);const evidence=new Evidence(dir,['67890','40100']);
 const surface=new FakeSurface(policy);surface.evidence=evidence;const session=new Session(surface,evidence,{humanTimeoutMs:200});
 const engine=new Engine(surface,policy,evidence,session,{waitMs:25,...options});
 return {dir,policy,evidence,surface,session,engine,artifact:structuredClone(example),cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
module.exports={harness,FakeSurface};
