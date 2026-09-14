'use strict';
const {randomUUID}=require('node:crypto');
const {FlowError}=require('./schema');
/** One controller, one live surface, one owner. Resume never replaces the surface. */
class Session {
  constructor(surface,evidence,{humanTimeoutMs=120000}={}) {
    this.id=randomUUID();this.surface=surface;this.evidence=evidence;this.owner='automation';
    this.humanTimeoutMs=humanTimeoutMs;this.request=null;this.busy=false;this.resolve=null;
  }
  transition(owner){this.owner=owner;this.evidence.event('control_changed',{sessionId:this.id,owner});}
  async escalate(context) {
    if(this.owner!=='automation') throw new FlowError('CONTROL_CONFLICT');
    this.request={id:randomUUID(),sessionId:this.id,...context};this.transition('paused');
    this.evidence.event('intervention_requested',this.request);
    return new Promise(resolve=>{
      this.resolve=resolve;
      this.timer=setTimeout(()=>{this.transition('aborted');this.finish(false);},this.humanTimeoutMs);
    });
  }
  acquire(){if(this.owner!=='paused'||!this.resolve) throw new FlowError('CONTROL_CONFLICT');this.transition('human');}
  async act(action,value) {
    if(this.owner!=='human'||this.busy) throw new FlowError('CONTROL_CONFLICT');
    if(!['click','fill'].includes(action.action)) throw new FlowError('ACTION_BLOCKED');
    this.busy=true;
    try{
      await this.surface.perform(action,value,'human');
      this.evidence.event('human_action',{sessionId:this.id,action:action.action,target:action.target,value:action.action==='fill'?'[REDACTED]':undefined});
    }finally{this.busy=false;}
  }
  async resume() {
    if(this.owner!=='human'||this.busy) throw new FlowError('CONTROL_CONFLICT');
    this.busy=true;
    try {
      const signal=await this.surface.signal();
      if(this.owner!=='human'||!this.resolve) throw new FlowError('CONTROL_CONFLICT');
      if(signal && ['hard','human'].includes(signal.kind)) throw new FlowError('BLOCKER_REMAINS');
      this.transition('paused');this.transition('automation');this.finish(true);
    } finally {this.busy=false;}
  }
  abort(){if(this.busy)throw new FlowError('CONTROL_CONFLICT');this.transition('aborted');this.finish(false);}
  finish(value){clearTimeout(this.timer);const resolve=this.resolve;this.resolve=null;resolve?.(value);}
}
module.exports={Session};
