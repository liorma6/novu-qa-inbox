import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startInbox } from '../src/server.js';
import { sign } from '../src/inbox.js';

const secrets={development:'test-development-secret-only',staging:'test-staging-secret-only'};
const email=(overrides={})=>({id:'delivery-1',to:['qa@example.test'],from:'app@example.test',subject:'Hello QA',html:'<p>Hello QA</p>',text:'Hello QA',...overrides});
let app;
beforeEach(async()=>{app=await startInbox({port:0,secrets,capacity:10});});
afterEach(async()=>{await app.close();});
async function capture(payload=email(),environment='development',options={}){
  const raw=typeof payload==='string'?payload:JSON.stringify(payload);
  return fetch(`${app.baseUrl}/capture/${environment}`,{method:'POST',headers:{'content-type':'application/json','x-novu-signature':sign(raw,secrets[environment]||secrets.development),...options.headers},body:raw});
}
test('captures a signed email and evaluates content checks',async()=>{
  const response=await capture();assert.equal(response.status,201);
  const data=await response.json();const stored=app.store.get(data.id);
  assert.equal(stored.subject,'Hello QA');assert.equal(stored.status,'passed');assert.deepEqual(stored.to,['qa@example.test']);
});
test('rejects content tampered after signing',async()=>{
  const raw=JSON.stringify(email());const response=await capture(email({subject:'Tampered'}),'development',{headers:{'x-novu-signature':sign(raw,secrets.development)}});
  assert.equal(response.status,401);assert.equal(app.store.list().length,0);
});
test('rejects a missing or malformed signature',async()=>{
  for(const signature of ['', '00','z'.repeat(64)]) assert.equal((await capture(email(),'development',{headers:{'x-novu-signature':signature}})).status,401);
});
test('development key cannot write to staging',async()=>{
  const raw=JSON.stringify(email());assert.equal((await capture(raw,'staging',{headers:{'x-novu-signature':sign(raw,secrets.development)}})).status,401);
});
test('unknown environment returns 404',async()=>assert.equal((await capture(email(),'production')).status,404));
test('malformed JSON returns 400 after signature validation',async()=>assert.equal((await capture('{broken')).status,400));
test('invalid recipients and body types return 422',async()=>{
  for(const patch of [{to:[]},{to:['invalid']},{html:{}},{subject:null},{headers:[]},{id:''}]) assert.equal((await capture(email(patch))).status,422);
});
test('exact retries are acknowledged once',async()=>{
  const first=await (await capture()).json();const second=await (await capture()).json();
  assert.equal(first.id,second.id);assert.equal(second.duplicate,true);assert.equal(app.store.list().length,1);assert.equal(app.store.report().summary.duplicateAttemptsAllEnvironments,1);
});
test('concurrent duplicate deliveries produce one message',async()=>{
  const replies=await Promise.all(Array.from({length:8},()=>capture()));
  assert.equal(replies.filter(r=>r.status===201).length,1);assert.equal(app.store.list().length,1);
});
test('reused delivery id with different content conflicts without overwriting',async()=>{
  await capture();assert.equal((await capture(email({text:'new content'}))).status,409);assert.equal(app.store.list()[0].text,'Hello QA');
});
test('delivery ids are isolated by environment',async()=>{
  await capture();assert.equal((await capture(email(),'staging')).status,201);assert.equal(app.store.list({environment:'staging'}).length,1);
});
test('id-less events are independent captures rather than silently deduplicated',async()=>{
  const message=email();delete message.id;await capture(message);await capture(message);assert.equal(app.store.list().length,2);
});
test('identifies deliberate template, text and marketing contract failures',async()=>{
  await capture(email({subject:'Hello {{name}}',text:'',headers:{'X-QA-Category':'marketing'}}));
  const failures=app.store.list()[0].checks.filter(c=>!c.passed).map(c=>c.id);
  assert.deepEqual(failures,['resolved-variables','text-fallback','unsubscribe']);
});
test('a marketing message with text and an unsubscribe link passes the selected heuristic',async()=>{
  await capture(email({html:'<p>Updates</p><a href="https://example.test/unsubscribe?token=test">Unsubscribe</a>',headers:{'x-qa-category':'marketing'}}));
  assert.equal(app.store.list()[0].status,'passed');assert.equal(app.store.list()[0].checks.length,4);
});
test('filters and exports checks without including raw HTML or text',async()=>{
  await capture();await capture(email({id:'stage',subject:'Staging receipt'}),'staging');
  const response=await fetch(`${app.baseUrl}/api/report?environment=staging&q=receipt`);const report=await response.json();
  assert.equal(report.summary.captured,1);assert.equal(report.messages[0].environment,'staging');assert.equal(Object.hasOwn(report.messages[0],'html'),false);assert.equal(Object.hasOwn(report.messages[0],'text'),false);
});
test('enforces the message size limit',async()=>assert.equal((await capture(email({html:'x'.repeat(270000)}))).status,413));
test('capacity rejection preserves previously accepted messages',async()=>{
  for(let i=0;i<10;i++)assert.equal((await capture(email({id:String(i)}))).status,201);
  assert.equal((await capture(email({id:'overflow'}))).status,507);assert.equal(app.store.list().length,10);
});
test('preview response blocks scripts, external resources and forms',async()=>{
  const {id}=await (await capture()).json();const res=await fetch(`${app.baseUrl}/preview/${id}`);
  assert.match(res.headers.get('content-security-policy'),/sandbox; default-src 'none'/);assert.match(res.headers.get('content-security-policy'),/form-action 'none'/);
});
test('rejects cross-origin demo requests and unexpected Host headers',async()=>{
  const denied=await fetch(`${app.baseUrl}/api/demo`,{method:'POST',headers:{origin:'https://outside.example','content-type':'application/json'},body:'{}'});assert.equal(denied.status,403);
  const hostStatus=await new Promise((resolve,reject)=>{const req=http.get(`${app.baseUrl}/api/health`,{headers:{Host:'outside.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});assert.equal(hostStatus,403);
});
test('demo exercises signed HTTP with three captures and two intentional failures',async()=>{
  const res=await fetch(`${app.baseUrl}/api/demo`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(res.status,200);
  assert.deepEqual(app.store.report().summary,{captured:3,passed:1,failed:2,duplicateAttemptsAllEnvironments:0});
});
