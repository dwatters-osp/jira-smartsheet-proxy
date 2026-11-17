import express from 'express';

// The Chrome extension reports every step it takes (page load, Jira fetch, row build, proxy call,
// every alert the user sees) to this endpoint, so a BEI "it errored" report can be diagnosed
// from Render's logs without asking anyone to open DevTools.
//
// The extension sends text/plain (a CORS "simple request": no preflight, works from the Jira page's
// content script even with mode:'no-cors'). JSON is accepted too.
//
// Never log secrets: the extension never sends the Smartsheet key, Jira token, or row contents, and
// any field whose NAME looks like a secret is redacted here anyway (defense in depth).

export const router = express.Router();

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const MAX_EVENTS_PER_POST = 50;
const MAX_STRING = 600;
const MAX_STACK = 1500;
const MAX_LINE = 4000;
const PER_IP_PER_MINUTE = 300;
const SECRET_KEY = /(api.?key|token|secret|passw|authori[sz]ation|bearer|cookie)/i;

// Tiny per-IP throttle so a stuck loop on one machine can't flood the logs.
const buckets = new Map();
function allow(ip, n) {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || now - b.start > 60_000) {
    buckets.set(ip, { start: now, count: n, warned: false });
    return { ok: true };
  }
  b.count += n;
  if (b.count <= PER_IP_PER_MINUTE) return { ok: true };
  const firstDrop = !b.warned;
  b.warned = true;
  return { ok: false, firstDrop };
}

function clean(value, key = '', depth = 0) {
  if (value == null) return value;
  // Booleans/numbers can't carry a secret, so flags like apiKeySet:true stay readable.
  if (key && SECRET_KEY.test(key) && typeof value !== 'boolean' && typeof value !== 'number') return '[redacted]';
  if (typeof value === 'string') {
    const cap = key === 'stack' ? MAX_STACK : MAX_STRING;
    return value.length > cap ? value.slice(0, cap) + '…' : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth >= 4) return '[nested]';
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => clean(v, '', depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value).slice(0, 40)) out[k] = clean(v, k, depth + 1);
    return out;
  }
  return String(value).slice(0, MAX_STRING);
}

function parseBody(body) {
  let payload = body;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch { return null; }
  }
  if (!payload || typeof payload !== 'object') return null;
  const events = Array.isArray(payload.events) ? payload.events : [payload];
  return { install: payload.install, events: events.slice(0, MAX_EVENTS_PER_POST), dropped: Math.max(0, events.length - MAX_EVENTS_PER_POST) };
}

function short(v, n = 12) {
  return String(v ?? '-').replace(/[^\w.-]/g, '').slice(0, n) || '-';
}

function cleanIp(ip) {
  return String(ip ?? '').replace(/^::ffff:/, '').replace(/[^0-9a-fA-F.:]/g, '').slice(0, 45) || '-';
}

export function formatLine(evt, install, ip) {
  const data = clean(evt.data ?? {});
  const head =
    `🧩 ext v${short(evt.v, 10)} inst=${short(install)} run=${short(evt.run)} ` +
    `${short(evt.ctx, 10)} #${Number.isFinite(evt.seq) ? evt.seq : '-'} ${short(evt.event, 48)}`;
  const line = `${head} ${JSON.stringify(data)} ip=${cleanIp(ip)}`;
  return line.length > MAX_LINE ? line.slice(0, MAX_LINE) + '…' : line;
}

router.options('/client-log', (req, res) => {
  res.set(CORS);
  res.sendStatus(204);
});

router.post('/client-log', express.text({ type: 'text/plain', limit: '64kb' }), (req, res) => {
  res.set(CORS);
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const parsed = parseBody(req.body);
  if (!parsed) {
    console.log(`🧩 ext client-log: unreadable body from ip=${cleanIp(ip)}`);
    return res.sendStatus(400);
  }

  const gate = allow(ip, parsed.events.length);
  if (!gate.ok) {
    if (gate.firstDrop) console.log(`🧩 ext client-log: throttling ip=${cleanIp(ip)} (>${PER_IP_PER_MINUTE} events/min)`);
    return res.sendStatus(429);
  }

  for (const evt of parsed.events) {
    if (!evt || typeof evt !== 'object') continue;
    const line = formatLine(evt, parsed.install, ip);
    if (evt.level === 'error') console.error(line);
    else console.log(line);
  }
  if (parsed.dropped) console.log(`🧩 ext client-log: dropped ${parsed.dropped} events over the per-post cap from ip=${cleanIp(ip)}`);
  return res.sendStatus(204);
});
