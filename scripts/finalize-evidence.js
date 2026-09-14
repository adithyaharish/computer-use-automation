'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {validateArtifact}=require('../src/schema');
/** Runs only after CI's test job and the genuine evidence collector succeed. */
function finalize(root=path.resolve(__dirname,'..'),env=process.env){
 const load=p=>JSON.parse(fs.readFileSync(p,'utf8'));
 const dirs=fs.readdirSync(path.join(root,'evidence')).filter(x=>x.startsWith('live-')).sort();
 if(!dirs.length)throw Error('No live evidence directory');
 const relative='evidence/'+dirs.at(-1),dir=path.join(root,relative);
 const manifest=load(path.join(dir,'manifest.json'));
 if(manifest.genuineApiDiscovery!==true)throw Error('Genuine API discovery not verified');
 const artifact=validateArtifact(load(path.join(dir,'discovery/capability.json')));
 if(artifact.provenance.mode!=='openai')throw Error('Expected API-backed discovery provenance');
 const digest=createHash('sha256').update(JSON.stringify(artifact)).digest('hex');
 const events=p=>fs.readFileSync(p,'utf8').trim().split('\n').map(JSON.parse);
 const discovery=load(path.join(dir,'discovery/result.json'));
 if(discovery.status!=='success'||!discovery.checkpointVerified||!(discovery.modelCalls>0))throw Error('Discovery result incomplete');
 for(const [name,status,code] of [['replay','success'],['not-found','business_outcome','MEMBER_NOT_FOUND'],['notice','success'],['slow-load','success'],['permission-denied','failure','PERMISSION_DENIED'],['handoff','success']]){
  const result=load(path.join(dir,name,'result.json'));
  if(result.status!==status||(code&&result.code!==code))throw Error('Unexpected replay outcome: '+name);
  if(status==='success'&&(!result.checkpointVerified||result.modelCalls!==0))throw Error('Replay contract not verified: '+name);
  const log=events(path.join(dir,name,'events.jsonl'));
  if(!log.some(e=>e.event==='artifact_loaded'&&e.sha256===digest))throw Error('Replay artifact lineage mismatch: '+name);
  if(log.some(e=>e.event==='model_decision'))throw Error('Model decision found in replay');
 }
 const handoff=load(path.join(dir,'handoff/handoff-verification.json'));
 if(!handoff.verified||!handoff.samePage||!handoff.liveBrowser||handoff.realHuman!==false)throw Error('Handoff verification missing');
 const unit=Number(env.UNIT_TEST_COUNT),browser=Number(env.BROWSER_TEST_COUNT);
 if(!Number.isInteger(unit)||unit<=0||!Number.isInteger(browser)||browser<=0||!/^\d+$/.test(env.GITHUB_RUN_ID||'')||! /^[a-f0-9]{40}$/.test(env.GITHUB_SHA||''))throw Error('CI verification metadata missing');
 const run=`https://github.com/adithyaharish/computer-use-automation/actions/runs/${env.GITHUB_RUN_ID}`;
 const summary={sourceCommit:env.GITHUB_SHA,workflowRun:run,unitAndHttpTests:unit,realBrowserTests:browser,discoveryModelCalls:discovery.modelCalls,artifactSha256:digest,evidenceDirectory:relative,verifiedAt:new Date().toISOString(),handoffActor:'scripted_operator_client',realHumanRecording:false};
 fs.writeFileSync(path.join(root,'evidence/verification.json'),JSON.stringify(summary,null,2)+'\n');
 fs.writeFileSync(path.join(root,'evidence/ci-verification.json'),JSON.stringify({...summary,submissionReady:true},null,2)+'\n');
 const status=`**Verified:** ${unit} unit/HTTP tests and ${browser} real-browser tests passed. Genuine API-backed discovery, changed-input deterministic replay, exceptional outcomes, and same-session handoff are verified. Handoff uses a clearly labeled scripted operator client. [Verification run](${run}); [evidence](${relative}/).`;
 const readmePath=path.join(root,'README.md');
 let readme=fs.readFileSync(readmePath,'utf8').replace(/\*\*Current verification status:\*\*[^\n]*/,status);
 readme=readme.replace('No repository has been published and no submission email has been sent by this build.','The source and verified evidence are published in this public repository. No submission email has been sent.');
 readme=readme.replace(/## Finish the outstanding API run[\s\S]*?(?=## Requirements and setup)/,'');
 fs.writeFileSync(readmePath,readme);
 fs.writeFileSync(path.join(root,'evidence/STATUS.md'),`# Verified evidence\n\n${status}\n\nSource commit: \`${env.GITHUB_SHA}\`. See [verification.json](verification.json) for counts and artifact lineage. All replay logs reference the same learned artifact digest.\n\nThe original hand-authored example remains labeled as an example and is not the discovery evidence. Extracted values are redacted in saved results. The operator client in the automated handoff verification is scripted, while the browser, HTTP control transfer, and session are real.\n`);
 const reportPath=path.join(root,'REPORT.md');let report=fs.readFileSync(reportPath,'utf8');
 report=report.replace('GitHub Actions passed 27 unit/HTTP and 12 real-browser tests. Genuine discovery attempted OpenAI but received HTTP 429 / `insufficient_quota`; that account-side gate remains outstanding, documented in `evidence/STATUS.md`.','GitHub Actions verified the real browser and genuine model-driven discovery/replay path; `evidence/verification.json` records counts, source commit, workflow and artifact lineage.');
 report=report.replace('All 12 Chromium tests passed against the actual UI. Genuine discovery plus changed-input replay remains blocked by OpenAI API quota and must be collected before submission.','Separate Chromium tests passed against the actual UI. The repository also includes genuine model discovery and changed-input deterministic replay evidence.');
 report=report.replace('Browser verification and public repository publication are complete. Genuine discovery evidence remains blocked by OpenAI API quota; this is an outstanding required gate, not an optional scope cut. A fresh GitHub Actions run can complete and publish the evidence after quota is available. The applicant has not sent a submission email.','Browser verification and genuine discovery evidence were completed on GitHub Actions and are committed with their source lineage. The repository is public. Sending the submission email remains the applicant’s action.');
 report=report.replace('Next: complete live verification first; then persist reviewed artifact/profile digests,','Next: add approval of artifact/profile digests,');
 fs.writeFileSync(reportPath,report);
 return summary;
}
if(require.main===module)console.log(JSON.stringify(finalize(),null,2));
module.exports={finalize};
