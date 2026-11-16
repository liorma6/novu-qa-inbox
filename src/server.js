import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createStore, InboxError } from './inbox.js';
import { sendDemo } from './demo.js';

const MAX_BYTES = 256 * 1024;
const assets = { '/': ['index.html','text/html'], '/app.js': ['app.js','text/javascript'], '/style.css': ['style.css','text/css'] };
async function body(req) {
  return new Promise((resolve,reject)=>{
    const chunks=[];let size=0,tooLarge=false;
    req.on('data',chunk=>{size+=chunk.length;if(size>MAX_BYTES){if(!tooLarge){tooLarge=true;chunks.length=0;reject(new InboxError(413,'Message exceeds 256 KiB'));}}else if(!tooLarge)chunks.push(chunk);});
    req.on('end',()=>{if(!tooLarge)resolve(Buffer.concat(chunks));});
    req.on('error',reject);
  });
}
function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); }

export async function startInbox({ port = 8787, secrets = { development: process.env.QA_DEV_SECRET || randomBytes(32).toString('hex'), staging: process.env.QA_STAGE_SECRET || randomBytes(32).toString('hex') }, capacity = 500 } = {}) {
  if (Object.keys(secrets).sort().join(',') !== 'development,staging' || Object.values(secrets).some(s=>typeof s !== 'string' || s.length < 16)) throw new Error('Two environment keys of at least 16 characters are required');
  if (secrets.development === secrets.staging) throw new Error('Environment keys must differ');
  const store = createStore({ secrets, capacity });
  let baseUrl;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'none'");
    try {
      if (req.headers.host !== new URL(baseUrl).host) throw new InboxError(403,'Use the loopback address printed at startup');
      const url = new URL(req.url, baseUrl);
      const filter = { environment: url.searchParams.get('environment') || '', q: url.searchParams.get('q') || '' };
      if (req.method === 'GET' && assets[url.pathname]) {
        const [name,type] = assets[url.pathname];
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); res.end(await readFile(new URL(`../public/${name}`, import.meta.url))); return;
      }
      if (req.method === 'GET' && url.pathname === '/api/health') return json(res,200,{ status:'ok',mode:'capture-only',version:'0.1.0' });
      if (req.method === 'GET' && url.pathname === '/api/messages') return json(res,200,{messages:store.list(filter),summary:store.report(filter).summary});
      if (req.method === 'GET' && url.pathname === '/api/report') {
        res.setHeader('Content-Disposition','attachment; filename="qa-report.json"'); return json(res,200,store.report(filter));
      }
      if (req.method === 'GET' && url.pathname.startsWith('/preview/')) {
        const message = store.get(url.pathname.slice('/preview/'.length));
        if (!message) throw new InboxError(404,'Message not found');
        res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
        res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8' }); res.end(message.html || '<p>No HTML content.</p>'); return;
      }
      if (req.method === 'POST' && url.pathname.startsWith('/capture/')) {
        if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw new InboxError(415,'Expected application/json');
        const result = store.capture(url.pathname.slice('/capture/'.length),await body(req),req.headers['x-novu-signature']);
        return json(res,result.duplicate ? 200 : 201,result);
      }
      if (req.method === 'POST' && url.pathname === '/api/demo') {
        if ((req.headers.origin && req.headers.origin !== baseUrl) || req.headers['content-type'] !== 'application/json') throw new InboxError(403,'Same-origin JSON requests only');
        await body(req);
        return json(res,200,await sendDemo(baseUrl,secrets));
      }
      throw new InboxError(404,'Not found');
    } catch (error) {
      if (!res.headersSent) json(res,error.status || 500,{error:error instanceof InboxError ? error.message : 'Internal error'});
      else res.end();
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  return { baseUrl, store, close:()=>new Promise(resolve=>server.close(resolve)) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = await startInbox({ port: Number(process.env.PORT || 8787) });
  console.log(`QA Inbox: ${app.baseUrl}\nCapture-only local pilot. In-memory data clears on restart.`);
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal,async()=>{await app.close();process.exit(0);});
}
