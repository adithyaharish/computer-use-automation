'use strict';
const {FlowError,validateInputs,validateStep,validateArtifact}=require('./schema');
const allowedReasons=['enter_input','navigate','extract_output','verify_goal','request_help'];
function validateDecision(d,artifact){
  if(!d||typeof d!=='object'||Array.isArray(d)||!allowedReasons.includes(d.reason)||Object.keys(d).some(k=>!['step','done','help','reason'].includes(k)))throw new FlowError('MODEL_INVALID_DECISION');
  if([!!d.step,d.done===true,d.help===true].filter(Boolean).length!==1)throw new FlowError('MODEL_INVALID_DECISION');
  if(d.step)validateStep(d.step,artifact);return d;
}
async function discover(engine,model,contract,params,goal,{maxSteps=20}={}) {
  const {policy,surface,evidence,session}=engine;
  const artifact={schemaVersion:1,name:contract.name,version:1,
    profile:{id:policy.profile.id,vendor:policy.profile.vendor,appVersion:policy.profile.appVersion},
    inputs:contract.inputs,outputs:contract.outputs,targets:structuredClone(policy.profile.targets),steps:[],checkpoints:contract.checkpoints,
    provenance:{mode:model.mode,model:model.model,recordedAt:new Date().toISOString()}};
  engine.capabilityName=artifact.name;
  evidence.event('run_started',{mode:'discovery',provider:model.mode,model:model.model,sessionId:session.id});
  let result;
  try {
    validateInputs(artifact.inputs,params);await surface.open();
    for(let i=0;i<maxSteps;i++) {
      engine.budget();engine.step=i+1;
      const observation=await surface.observe();
      evidence.json(`observation-${i+1}.json`,observation);
      const decision=validateDecision(await model.decide({goal:evidence.protect(goal),contract,observation,completed:artifact.steps}),artifact);
      evidence.event('model_decision',{step:i+1,reason:decision.reason,decision:decision.step||{done:decision.done,help:decision.help}});
      if(decision.help) {
        if(++engine.handoffs>2)throw new FlowError('HANDOFF_LIMIT');
        await engine.capture();
        if(!engine.handoff||!await session.escalate({capability:artifact.name,step:i+1,reason:'MODEL_STUCK'}))throw new FlowError('MODEL_STUCK');
        continue;
      }
      if(decision.done) {
        if(Object.keys(artifact.outputs).some(k=>!Object.hasOwn(engine.outputs,k)))throw new FlowError('INCOMPLETE_OUTPUTS');
        for(const check of artifact.checkpoints)await engine.execute(check,artifact,params);
        validateArtifact(artifact);policy.artifact(artifact);
        // Persist only the typed capability, never model responses or invocation data.
        evidence.json('capability.json',artifact);
        result={status:'success',outputs:engine.outputs,checkpointVerified:true,modelCalls:model.calls};
        evidence.result(result);return {result,artifact};
      }
      await engine.execute(decision.step,artifact,params);artifact.steps.push(decision.step);
    }
    throw new FlowError('MAX_STEPS');
  }catch(e){result=await engine.failure(e);evidence.result(result);return {result};}
}
module.exports={discover,validateDecision};
