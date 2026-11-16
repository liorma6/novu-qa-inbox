import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startInbox } from '../src/server.js';
const require=createRequire(import.meta.url);
// Deep import executes the actual pinned provider, without loading unrelated providers.
const {EmailWebhookProvider}=require('@novu/providers/dist/cjs/lib/email/email-webhook/email-webhook.provider.js');
const secrets={development:'provider-development-test-key',staging:'provider-staging-test-key'};
let app,provider;
before(async()=>{app=await startInbox({port:0,secrets});provider=new EmailWebhookProvider({webhookUrl:`${app.baseUrl}/capture/development`,hmacSecretKey:secrets.development,retryCount:1,retryDelay:1});});
after(async()=>app.close());
const message={id:'official-provider-fixture',to:['developer@example.test'],from:'app@example.test',subject:'Official provider integration',html:'<p>Rendered HTML from Novu provider</p>',text:'Rendered HTML from Novu provider',headers:{'x-qa-workflow':'provider-smoke'}};
test('actual @novu/providers 2.6.6 sends through signed HTTP into the inbox',async()=>{
  const result=await provider.sendMessage(message);
  assert.equal(result.id,message.id);const stored=app.store.list()[0];assert.equal(stored.subject,message.subject);assert.equal(stored.html,message.html);assert.equal(stored.workflow,'provider-smoke');
});
test('actual provider redelivery is deduplicated by environment and id',async()=>{
  await provider.sendMessage(message);assert.equal(app.store.list().length,1);assert.equal(app.store.report().summary.duplicateAttemptsAllEnvironments,1);
});
test('actual provider reports failure for the wrong signing key',async()=>{
  const invalid=new EmailWebhookProvider({webhookUrl:`${app.baseUrl}/capture/staging`,hmacSecretKey:'incorrect-test-signing-key',retryCount:1,retryDelay:1});
  await assert.rejects(()=>invalid.sendMessage(message),/webhook send failed/);assert.equal(app.store.list({environment:'staging'}).length,0);
});
