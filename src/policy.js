'use strict';
const {isDeepStrictEqual}=require('node:util');
const {FlowError}=require('./schema');
class Policy {
  constructor(profile) { this.profile=structuredClone(profile); }
  url(raw) {
    let u; try {u=new URL(raw);} catch {throw new FlowError('URL_BLOCKED');}
    if(u.origin!==this.profile.origin || !this.profile.routes.includes(u.pathname) || u.username || u.password || u.search || u.hash)
      throw new FlowError('URL_BLOCKED');
  }
  artifact(a) {
    if(!isDeepStrictEqual(a.profile,{id:this.profile.id,vendor:this.profile.vendor,appVersion:this.profile.appVersion})) throw new FlowError('PROFILE_MISMATCH');
    for(const [key,value] of Object.entries(a.targets)) {
      if(!isDeepStrictEqual(value,this.profile.targets[key])) throw new FlowError('TARGET_BINDING_MISMATCH',{target:key});
    }
    for(const s of [...a.steps,...a.checkpoints]) this.action(s);
  }
  action(s, owner='automation') {
    if(this.profile.riskyTargets.includes(s.target)) throw new FlowError('RISKY_ACTION_BLOCKED',{target:s.target});
    const grants=owner==='human'?{...this.profile.grants,...this.profile.operatorGrants}:this.profile.grants;
    if(!this.profile.allowedActions.includes(s.action)||!grants[s.target]?.includes(s.action))
      throw new FlowError('ACTION_BLOCKED',{target:s.target});
  }
}
module.exports={Policy};
