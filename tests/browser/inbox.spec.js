import {test,expect} from '@playwright/test';
import {createHmac,randomUUID} from 'node:crypto';

test.beforeEach(async({page,request})=>{await request.post('/api/demo',{data:{}});await page.goto('/');});
test('sample workflows create messages and surface intentional failures',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.getByRole('button',{name:'Run sample workflows'}).click();
  await expect(page.getByRole('status')).toContainText('3 messages captured');
  await expect(page.getByRole('button',{name:'Your weekly product digest, failed'}).first()).toBeVisible();
  await page.getByRole('button',{name:'Your receipt, {{firstName}}, failed'}).first().click();
  await page.getByRole('tab',{name:'QA checks'}).click();
  await expect(page.getByRole('tabpanel')).toContainText('Template variables resolved');
  await expect(page.getByRole('tabpanel')).toContainText('FAIL');expect(errors).toEqual([]);
});
test('search and environment filters agree with the visible results',async({page})=>{
  await page.getByLabel('Environment',{exact:true}).selectOption('staging');
  await page.getByRole('searchbox',{name:'Search messages'}).fill('weekly-digest');
  await expect(page.locator('.message-card').first()).toBeVisible();
  await expect.poll(async()=>{const cards=await page.locator('.message-card').allTextContents();return cards.length>0&&cards.every(x=>x.includes('STAGING')&&x.includes('weekly-digest'));}).toBe(true);
  await page.getByRole('searchbox').fill('does-not-exist');await expect(page.getByText('Nothing captured yet.')).toBeVisible();
});
test('HTML preview and text fallback both show captured content',async({page})=>{
  await page.getByRole('button',{name:'Welcome aboard, Maya, passed'}).first().click();
  await expect(page.frameLocator('iframe').getByRole('heading',{name:'Your next chapter starts here.'})).toBeVisible();
  await page.getByRole('tab',{name:'Plain text'}).click();await expect(page.getByRole('tabpanel')).toContainText('Hi Maya, your workspace is ready.');
});
test('filtered JSON report downloads with matching scope and checks',async({page})=>{
  await page.getByLabel('Environment',{exact:true}).selectOption('staging');
  await expect(page.locator('#export')).toHaveAttribute('href',/environment=staging/);
  const download=page.waitForEvent('download');await page.getByRole('link',{name:'Export QA report'}).click();const item=await download;
  const stream=await item.createReadStream();let body='';for await(const chunk of stream)body+=chunk.toString();
  const report=JSON.parse(body);expect(report.messages.length).toBeGreaterThan(0);expect(report.messages.every(m=>m.environment==='staging')).toBe(true);expect(report.messages[0]).not.toHaveProperty('html');
});
test('layout fits the viewport without horizontal scrolling',async({page})=>{
  await expect(page.locator('.message-card').first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('captured HTML is isolated from the inbox and cannot execute scripts',async({page,request})=>{
  const id=randomUUID();const body=JSON.stringify({id,to:['qa@example.test'],subject:`Hostile markup ${id}`,html:'<script>window.__payloadRan=true;alert("unsafe")</script><p>Inert preview content</p>',text:'Inert preview content'});
  const signature=createHmac('sha256','browser-development-test-key').update(body).digest('hex');
  const response=await request.post('/capture/development',{data:body,headers:{'content-type':'application/json','x-novu-signature':signature}});expect(response.status()).toBe(201);
  let dialogs=0;page.on('dialog',async dialog=>{dialogs++;await dialog.dismiss();});
  await page.getByRole('button',{name:'Refresh inbox'}).click();await page.getByRole('button',{name:`Hostile markup ${id}, passed`}).click();
  const preview=page.frameLocator('iframe');await expect(preview.getByText('Inert preview content')).toBeVisible();await expect(page.locator('iframe')).toHaveAttribute('sandbox','');
  const frame=page.frames().find(f=>f.url().includes('/preview/'));expect(await frame.evaluate(()=>window.__payloadRan)).toBeUndefined();expect(dialogs).toBe(0);
});
