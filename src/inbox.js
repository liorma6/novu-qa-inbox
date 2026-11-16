import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export class InboxError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function sign(raw, secret) {
  return createHmac('sha256', secret).update(raw).digest('hex');
}

export function verify(raw, signature, secret) {
  if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(raw, secret), 'hex'));
}

export function checksFor(message) {
  const combined = `${message.subject}\n${message.html}\n${message.text}`;
  const checks = [
    { id: 'resolved-variables', label: 'Template variables resolved', passed: !/\{\{[^{}]+\}\}|\$\{[^{}]+\}/.test(combined) },
    { id: 'text-fallback', label: 'Plain-text fallback present', passed: message.text.trim().length > 0 },
    { id: 'subject', label: 'Subject is not blank', passed: message.subject.trim().length > 0 },
  ];
  if (message.category === 'marketing') {
    checks.push({ id: 'unsubscribe', label: 'Marketing unsubscribe link present', passed: /href\s*=\s*["']https?:\/\/[^"']*unsubscribe[^"']*["']/i.test(message.html) });
  }
  return checks;
}

export function createStore({ secrets, capacity = 500 }) {
  const messages = new Map();
  const deliveryKeys = new Map();
  let duplicateCount = 0;
  const requiredString = (v, name, max) => {
    if (typeof v !== 'string' || v.length > max) throw new InboxError(422, `${name} must be a string of at most ${max} characters`);
    return v;
  };
  return {
    capture(environment, raw, signature) {
      if (!Object.hasOwn(secrets, environment)) throw new InboxError(404, 'Unknown environment');
      if (!verify(raw, signature, secrets[environment])) throw new InboxError(401, 'Invalid signature');
      let payload;
      try { payload = JSON.parse(raw.toString('utf8')); } catch { throw new InboxError(400, 'Invalid JSON'); }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new InboxError(422, 'Expected an email object');
      const to = typeof payload.to === 'string' ? [payload.to] : payload.to;
      if (!Array.isArray(to) || to.length === 0 || to.length > 100 || to.some(x => typeof x !== 'string' || x.length > 320 || !/^[^\s@]+@[^\s@]+$/.test(x))) throw new InboxError(422, 'Expected 1–100 recipient addresses');
      if (payload.id !== undefined && (typeof payload.id !== 'string' || !payload.id || payload.id.length > 200)) throw new InboxError(422, 'id must be a nonempty string of at most 200 characters');
      const subject = requiredString(payload.subject, 'subject', 1000);
      const html = requiredString(payload.html ?? '', 'html', 200_000);
      const text = requiredString(payload.text ?? '', 'text', 200_000);
      const from = requiredString(payload.from ?? '', 'from', 400);
      const headers = payload.headers ?? {};
      if (typeof headers !== 'object' || Array.isArray(headers) || headers === null) throw new InboxError(422, 'headers must be an object');
      const normalizedHeaders = Object.fromEntries(Object.entries(headers).map(([k,v]) => [k.toLowerCase(),v]));
      const workflow = requiredString(normalizedHeaders['x-qa-workflow'] ?? 'unassigned', 'x-qa-workflow', 100);
      const runId = requiredString(normalizedHeaders['x-qa-run'] ?? 'manual', 'x-qa-run', 100);
      const category = requiredString(normalizedHeaders['x-qa-category'] ?? 'transactional', 'x-qa-category', 40);
      const digest = createHash('sha256').update(raw).digest('hex');
      const key = payload.id ? JSON.stringify([environment, payload.id]) : null;
      if (key && deliveryKeys.has(key)) {
        const previous = deliveryKeys.get(key);
        if (previous.digest !== digest) throw new InboxError(409, 'Delivery id reused with different content');
        duplicateCount += 1;
        return { id: previous.id, duplicate: true };
      }
      if (messages.size >= capacity) throw new InboxError(507, 'Inbox capacity reached; restart to clear captured data');
      const message = { id: randomUUID(), deliveryId: payload.id ?? null, environment, capturedAt: new Date().toISOString(), to, from, subject, html, text, workflow, runId, category };
      message.checks = checksFor(message);
      message.status = message.checks.every(c => c.passed) ? 'passed' : 'failed';
      messages.set(message.id, message);
      if (key) deliveryKeys.set(key, { id: message.id, digest });
      return { id: message.id, duplicate: false };
    },
    get(id) { return messages.get(id); },
    list({ environment = '', q = '' } = {}) {
      const search = q.toLowerCase();
      return [...messages.values()].reverse().filter(m => (!environment || m.environment === environment) && [m.subject, ...m.to, m.workflow, m.runId].join(' ').toLowerCase().includes(search));
    },
    report(filter = {}) {
      const selected = this.list(filter);
      return {
        generatedAt: new Date().toISOString(),
        scope: 'Local capture and configured content heuristics; not delivery, rendering-client or legal compliance certification.',
        filter,
        summary: { captured: selected.length, passed: selected.filter(m => m.status === 'passed').length, failed: selected.filter(m => m.status === 'failed').length, duplicateAttemptsAllEnvironments: duplicateCount },
        messages: selected.map(({ html, text, ...m }) => m),
      };
    },
  };
}
