'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
class Evidence {
  constructor(dir, secrets=[]) {
    this.dir=dir;this.id=randomUUID();this.secrets=secrets.filter(x=>typeof x==='string'&&x.length>0);
    fs.mkdirSync(dir,{recursive:true,mode:0o700});
  }
  protect(text) {
    let s=String(text);
    for(const secret of [...this.secrets].sort((a,b)=>b.length-a.length)) s=s.split(secret).join('[REDACTED]');
    return s.replace(/\b\d{5,}\b/g,'[ID]').replace(/\b\d+\.\d{2}\b/g,'[AMOUNT]')
      .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[EMAIL]')
      .replace(/\b(?:sk-|Bearer\s+)[A-Za-z0-9_-]+/g,'[SECRET]');
  }
  event(type,data={}) {
    const record={time:new Date().toISOString(),runId:this.id,event:type,...data};
    // Callers pass only structural fields: never raw input/output values, model text, or exception messages.
    fs.appendFileSync(path.join(this.dir,'events.jsonl'),JSON.stringify(record)+'\n',{mode:0o600});
  }
  json(name,data) {fs.writeFileSync(path.join(this.dir,name),JSON.stringify(data,null,2)+'\n',{mode:0o600});}
  result(result) {
    const copy=structuredClone(result);
    if(copy.outputs) copy.outputs=Object.fromEntries(Object.keys(copy.outputs).map(k=>[k,'[REDACTED]']));
    this.json('result.json',copy);this.event('run_finished',{status:result.status,code:result.code});
  }
}
module.exports={Evidence};
