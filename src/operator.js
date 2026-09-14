'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {randomBytes,timingSafeEqual}=require('node:crypto');
const {FlowError}=require('./schema');
function startOperator(session,port=4311) {
  const token=randomBytes(24).toString('hex');
  const origin=`http://127.0.0.1:${port}`;
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'");
    try{
      if(req.headers.host!==`127.0.0.1:${port}`) throw new FlowError('OPERATOR_AUTH_REQUIRED');
      if(req.url==='/'&&req.method==='GET'){res.setHeader('Content-Type','text/html');return res.end(fs.readFileSync(path.join(__dirname,'operator.html')));}
      const supplied=Buffer.from(req.headers['x-operator-token']||'');const expected=Buffer.from(token);
      if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)|| (req.headers.origin && req.headers.origin!==origin)) throw new FlowError('OPERATOR_AUTH_REQUIRED');
      res.setHeader('Content-Type','application/json');
      if(req.url==='/state'&&req.method==='GET') return res.end(JSON.stringify({owner:session.owner,request:session.request,state:await session.surface.observe()}));
      if(req.method!=='POST') throw new FlowError('INVALID_REQUEST');
      let bytes=0,chunks=[];
      for await(const chunk of req){bytes+=chunk.length;if(bytes>4096)throw new FlowError('INVALID_REQUEST');chunks.push(chunk);}
      const body=JSON.parse(Buffer.concat(chunks).toString()||'{}');
      if(req.url==='/acquire')session.acquire();
      else if(req.url==='/action') {
        if(typeof body.target!=='string'||!['click','fill'].includes(body.action)|| (body.action==='fill'&&(typeof body.value!=='string'||body.value.length>128)))throw new FlowError('INVALID_REQUEST');
        await session.act({action:body.action,target:body.target},body.value);
      }
      else if(req.url==='/resume')await session.resume();
      else if(req.url==='/abort')session.abort();
      else throw new FlowError('INVALID_REQUEST');
      res.end(JSON.stringify({owner:session.owner}));
    }catch(e){res.writeHead(e.code==='OPERATOR_AUTH_REQUIRED'?401:409);res.end(JSON.stringify({error:e instanceof FlowError?e.code:'INVALID_REQUEST'}));}
  });
  return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>resolve({server,url:`${origin}/#${token}`}));});
}
module.exports={startOperator};
