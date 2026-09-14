'use strict';
const {FlowError,validateArtifact,validateInputs,parseOutput}=require('./schema');
const {createHash}=require('node:crypto');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class Engine {
  constructor(surface,policy,evidence,session,{waitMs=3000,runTimeoutMs=180000,handoff=false}={}) {
    Object.assign(this,{surface,policy,evidence,session,waitMs,runTimeoutMs,handoff});this.outputs={};this.started=Date.now();this.step=0;this.recoveries=0;this.handoffs=0;
  }
  budget(){if(Date.now()-this.started>this.runTimeoutMs)throw new FlowError('RUN_TIMEOUT');if(this.session.owner!=='automation')throw new FlowError('CONTROL_CONFLICT');}
  async waitReady(target) {
    let deadline=Date.now()+this.waitMs,waited=false;
    while(true){
      this.budget();const signal=await this.surface.signal();
      if(signal){
        this.evidence.event('runtime_signal',{step:this.step,code:signal.code,kind:signal.kind});
        if(signal.kind==='business')throw new FlowError(signal.code,{business:true});
        if(signal.kind==='hard')throw new FlowError(signal.code);
        if(signal.kind==='recoverable') {
          if(++this.recoveries>3)throw new FlowError('RECOVERY_LIMIT');
          this.policy.action({action:'click',target:signal.actionTarget});
          await this.surface.perform({action:'click',target:signal.actionTarget});
          this.evidence.event('recovery',{step:this.step,code:signal.code});
          continue;
        }
        if(signal.kind==='human') {
          if(++this.handoffs>2)throw new FlowError('HANDOFF_LIMIT');
          await this.capture();
          if(!this.handoff)throw new FlowError(signal.code,{interventionRequired:true});
          if(!await this.session.escalate({capability:this.capabilityName,step:this.step,reason:signal.code,expectedTarget:target}))throw new FlowError('INTERVENTION_ABORTED');
          // Re-evaluate the same pending step against the same surface after the human returns control.
          deadline=Date.now()+this.waitMs;continue;
        }
      }
      if(await this.surface.available(target)){if(waited)this.evidence.event('wait_completed',{step:this.step});return;}
      if(Date.now()>deadline){
        if(this.handoff && ++this.handoffs<=2){
          await this.capture();
          const resumed=await this.session.escalate({capability:this.capabilityName,step:this.step,reason:'TARGET_TIMEOUT',expectedTarget:target});
          if(!resumed)throw new FlowError('INTERVENTION_ABORTED');
          deadline=Date.now()+this.waitMs;continue;
        }
        throw new FlowError('TARGET_TIMEOUT',{target,expected:'one_visible_match',observed:'no_visible_match'});
      }
      if(!waited){this.evidence.event('waiting_for_target',{step:this.step,target});waited=true;}
      await delay(75);
    }
  }
  async execute(s,artifact,params) {
    this.budget();this.policy.action(s);await this.waitReady(s.target);
    this.evidence.event('step_started',{step:this.step,action:s.action,target:s.target,reason:'execute_validated_action'});
    let value;
    try{value=await this.surface.perform(s,params[s.input||s.equalsInput]);}
    catch(e){if(e instanceof FlowError)throw e;throw new FlowError('ACTION_FAILED',{target:s.target,expected:s.action,observed:'driver_error'});}
    if(s.action==='read')this.outputs[s.output]=parseOutput(artifact.outputs[s.output],value);
    this.evidence.event('step_completed',{step:this.step,action:s.action,target:s.target});
  }
  async capture(){try{await this.surface.evidenceOnFailure(this.step);}catch{this.evidence.json(`state-${this.step}.json`,{step:this.step,observationUnavailable:true});this.evidence.event('evidence_capture_unavailable',{step:this.step});}}
  async failure(error) {
    const e=error instanceof FlowError?error:new FlowError('INTERNAL_ERROR');
    await this.capture();
    if(e.details.business)return {status:'business_outcome',code:e.code,step:this.step};
    const diagnostics={...e.details};delete diagnostics.business;
    return {status:'failure',code:e.code,step:this.step,...diagnostics};
  }
  async replay(artifact,params) {
    this.capabilityName=artifact?.name;this.started=Date.now();this.outputs={};this.step=0;
    this.evidence.event('run_started',{mode:'replay',modelCalls:0,sessionId:this.session.id});
    let result;
    try{
      validateArtifact(artifact);validateInputs(artifact.inputs,params);this.policy.artifact(artifact);
      this.evidence.event('artifact_loaded',{name:artifact.name,version:artifact.version,sha256:createHash('sha256').update(JSON.stringify(artifact)).digest('hex')});
      await this.surface.open();
      for(const s of [...artifact.steps,...artifact.checkpoints]){this.step++;await this.execute(s,artifact,params);}
      const finalSignal=await this.surface.signal();if(finalSignal)throw new FlowError(finalSignal.code,{business:finalSignal.kind==='business'});
      result={status:'success',outputs:this.outputs,checkpointVerified:true,modelCalls:0};
    }catch(e){result=await this.failure(e);}
    this.evidence.result(result);return result;
  }
}
module.exports={Engine};
