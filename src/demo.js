import { randomUUID } from 'node:crypto';
import { sign } from './inbox.js';

export function demoMessages(runId) {
  return [
    { environment: 'development', id: `${runId}-welcome`, to: ['maya@example.test'], from: 'product@example.test', subject: 'Welcome aboard, Maya', text: 'Hi Maya, your workspace is ready. Open https://example.test/workspace', html: '<div style="font-family:Arial;padding:32px;color:#132624"><p style="color:#198c6b;font-size:13px">ACME / WORKSPACE</p><h1>Your next chapter starts here.</h1><p>Hi Maya, your workspace is ready.</p><a style="display:inline-block;background:#166e57;color:white;padding:14px 22px;border-radius:8px;text-decoration:none" href="https://example.test/workspace">Open your workspace</a><p style="font-size:12px;color:#666;margin-top:28px">A synthetic test message. No email was delivered.</p></div>', headers: { 'x-qa-workflow': 'customer-onboarding', 'x-qa-run': runId } },
    { environment: 'development', id: `${runId}-receipt`, to: ['noam@example.test'], from: 'billing@example.test', subject: 'Your receipt, {{firstName}}', text: 'Payment received for order 1042.', html: '<div style="font-family:Arial;padding:32px"><h1>Thanks, {{firstName}}</h1><p>Your payment of $29.00 was received.</p></div>', headers: { 'x-qa-workflow': 'payment-receipt', 'x-qa-run': runId } },
    { environment: 'staging', id: `${runId}-digest`, to: ['lee@example.test'], from: 'news@example.test', subject: 'Your weekly product digest', html: '<div style="font-family:Arial;padding:32px"><h1>A good week to build.</h1><p>Three updates for your team, all in one place.</p><a href="https://example.test/updates">Read the updates</a></div>', headers: { 'x-qa-workflow': 'weekly-digest', 'x-qa-run': runId, 'x-qa-category': 'marketing' } },
  ];
}

export async function sendDemo(baseUrl, secrets) {
  const runId = `demo-${randomUUID().slice(0,8)}`;
  const fixtures = demoMessages(runId);
  const results = [];
  for (const { environment, ...payload } of fixtures) {
    const raw = JSON.stringify(payload);
    const response = await fetch(`${baseUrl}/capture/${environment}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-novu-signature': sign(raw, secrets[environment]) }, body: raw, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Capture returned ${response.status}`);
    results.push(await response.json());
  }
  return { runId, captured: results.length, transport: 'Signed local HTTP fixtures' };
}
