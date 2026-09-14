'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
function startDemo(port = 4310) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'self'");
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
    if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (url.pathname === '/bank') {
      res.setHeader('Content-Type', 'text/html');
      return res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>CedarCore | Member Services</title><meta name="app-vendor" content="CedarCore"><meta name="app-version" content="1"><style>body{margin:0;background:#edf0f2;font:15px system-ui;color:#16312c}header{padding:22px 32px;background:#143a33;color:white}header span{float:right;color:#a6d0ba;font-size:13px}iframe{border:0;width:100%;height:790px}</style></head><body><header><b>CEDARCORE</b> &nbsp; / &nbsp; Member Services<span>DEMO ENVIRONMENT · SYNTHETIC DATA ONLY</span></header><iframe name="workspace" title="Member workspace" src="/workspace"></iframe></body></html>`);
    }
    if (url.pathname === '/workspace') {
      res.setHeader('Content-Type', 'text/html');
      return res.end(fs.readFileSync(path.join(__dirname, 'workspace.html')));
    }
    res.writeHead(404); res.end('Not found');
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}
module.exports = {startDemo};
