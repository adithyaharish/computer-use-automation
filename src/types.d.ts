export type Target = {frame: 'workspace'; strategy: 'label' | 'css'; value: string} |
  {frame: 'workspace'; strategy: 'role'; role: 'button' | 'heading' | 'status' | 'alert'; value: string};
export type Step = {action: 'click'; target: string} |
  {action: 'fill'; target: string; input: string} |
  {action: 'read'; target: string; output: string} |
  {action: 'check'; target: string; equalsInput?: string};
export interface Capability {
  schemaVersion: 1; name: string; version: number;
  profile: {id: string; vendor: string; appVersion: string};
  inputs: Record<string,{type:'string';sensitive:boolean}>;
  outputs: Record<string,{type:'string'|'decimal'|'currency';sensitive:boolean}>;
  targets: Record<string,Target>; steps: Step[]; checkpoints: Extract<Step,{action:'check'}>[];
  provenance: {mode:'openai'|'bridge'|'example';model:string;recordedAt:string};
}
export type Result =
 | {status:'success';outputs:Record<string,string>;checkpointVerified:true;modelCalls:number}
 | {status:'business_outcome';code:string;step:number}
 | {status:'failure';code:string;step?:number;expected?:string;observed?:string;interventionRequired?:boolean};
export interface Surface {
 open():Promise<void>;
 available(target:string):Promise<boolean>;
 perform(step:Step,value?:string,owner?:'automation'|'human'):Promise<string|void>;
 signal():Promise<null|{kind:'business'|'recoverable'|'hard'|'human';code:string;actionTarget?:string}>;
 observe():Promise<unknown>;
 evidenceOnFailure(step:number):Promise<void>;
 close():Promise<void>;
}
