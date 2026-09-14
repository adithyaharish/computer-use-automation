'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const http=require('node:http');
const {harness}=require('./helpers');const {startOperator}=require('../src/operator');const {startDemo}=require('../demo/server');
// Use http directly so tests never inherit a workstation's outbound HTTP proxy.
function request(url,{method='GET',headers={},body}={}){return new Promise((resolve,reject)=>{const req=http.request(url,{method,headers},res=>{let text='';res.on('data',b=>text+=b);res.on('end',()=>resolve({status:res.statusCode,text}));});req.on('error',reject);if(body)req.write(JSON.stringify(body));req.end();});}
test('demo serves a real iframe UI with synthetic data and no business API',async t=>{
 const server=await startDemo(0);t.after(()=>server.close());const base=`http://127.0.0.1:${server.address().port}`;
 const bank=await request(base+'/bank');assert.equal(bank.status,200);assert.match(bank.text,/<iframe name="workspace"/);
 const workspace=await request(base+'/workspace');assert.match(workspace.text,/Session expired/);assert.match(workspace.text,/data-private/);
 assert.equal((await request(base+'/api/members')).status,404);assert.equal((await request(base+'/workspace',{method:'POST'})).status,405);
});
test('operator HTTP endpoint authenticates and transfers real controller ownership',async t=>{
 const h=harness();t.after(h.cleanup);
 const probe=http.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const operator=await startOperator(h.session,port);t.after(()=>operator.server.close());const [base,token]=operator.url.split('/#');
 const headers={'X-Operator-Token':token,'Content-Type':'application/json'};
 assert.equal((await request(base+'/state')).status,401);
 assert.equal((await request(base+'/state',{headers:{...headers,Origin:'https://evil.example'}})).status,401);
 assert.equal((await request(base+'/state',{headers})).status,200);
 const pending=h.session.escalate({reason:'SESSION_EXPIRED'});h.surface.state='expired';
 assert.equal((await request(base+'/acquire',{method:'POST',headers,body:{}})).status,200);assert.equal(h.session.owner,'human');
 assert.equal((await request(base+'/action',{method:'POST',headers,body:{action:'click',target:'closeAccount'}})).status,409);
 assert.equal((await request(base+'/action',{method:'POST',headers,body:{action:'click',target:'restoreSession'}})).status,200);
 assert.equal((await request(base+'/resume',{method:'POST',headers,body:{}})).status,200);assert.equal(await pending,true);assert.equal(h.session.owner,'automation');
});
