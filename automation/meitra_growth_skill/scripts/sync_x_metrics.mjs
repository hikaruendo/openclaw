#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

function env(name, fallback = '') { return process.env[name] || fallback; }
function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i += 2) out[args[i]?.replace(/^--/, '')] = args[i + 1];
  return out;
}
function num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }

function upsertJsonl(file, postId, newRow) {
  const rows = fs.existsSync(file)
    ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
    : [];
  const idx = rows.findIndex(r => String(r.postId) === String(postId));
  if (idx >= 0) {
    rows[idx] = {
      ...rows[idx],
      ...newRow,
      metrics: { ...(rows[idx].metrics || {}), ...(newRow.metrics || {}) },
      ts: newRow.ts
    };
  } else {
    rows.push(newRow);
  }
  fs.writeFileSync(file, rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
}

const a = parseArgs();
const ids = (a.ids || a.id || '').split(',').map(s => s.trim()).filter(Boolean);
if (!ids.length) {
  console.error('Usage: node scripts/sync_x_metrics.mjs --ids <id1,id2> [--angle <angle>] [--cta <cta>] [--date YYYY-MM-DD]');
  process.exit(1);
}

const bearer = env('TWITTER_BEARER_TOKEN');
if (!bearer) {
  console.error('Missing TWITTER_BEARER_TOKEN');
  process.exit(1);
}

const url = new URL('https://api.twitter.com/2/tweets');
url.searchParams.set('ids', ids.join(','));
url.searchParams.set('tweet.fields', 'created_at,public_metrics,text');

const res = await fetch(url, {
  headers: { Authorization: `Bearer ${bearer}` }
});
const txt = await res.text();
if (!res.ok) {
  console.error('X API error:', res.status, txt);
  process.exit(1);
}

let json;
try { json = JSON.parse(txt); } catch {
  console.error('Failed to parse X API response');
  process.exit(1);
}

const tweets = json?.data || [];
if (!tweets.length) {
  console.error('No tweets found for ids:', ids.join(','));
  process.exit(1);
}

const now = new Date();
const d = a.date || now.toISOString().slice(0, 10);
const dir = path.resolve(process.cwd(), 'output', 'analytics');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${d}.jsonl`);

for (const t of tweets) {
  const pm = t.public_metrics || {};
  const row = {
    ts: now.toISOString(),
    postId: String(t.id),
    platform: 'x',
    angle: a.angle || 'site_renewal_beta',
    hook: (t.text || '').slice(0, 80),
    cta: a.cta || 'beta_signup',
    source: 'x_metrics_sync',
    draft: false,
    metrics: {
      views: num(pm.impression_count),
      likes: num(pm.like_count),
      comments: num(pm.reply_count),
      shares: num(pm.retweet_count),
      saves: num(pm.bookmark_count),
      profileClicks: 0,
      linkClicks: 0,
      installs: 0,
      trialStarts: 0,
      paidStarts: 0
    }
  };
  upsertJsonl(file, row.postId, row);
  console.log('Synced X:', row.postId, row.metrics);
}

console.log(`Updated analytics file: ${file}`);
