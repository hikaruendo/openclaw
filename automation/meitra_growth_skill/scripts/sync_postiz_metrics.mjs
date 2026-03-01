#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

function env(name, fallback = '') { return process.env[name] || fallback; }
function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i += 2) {
    out[args[i]?.replace(/^--/, '')] = args[i + 1];
  }
  return out;
}

function num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }

function pick(obj, keys, d = 0) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && `${v}` !== '') return num(v, d);
  }
  return d;
}

function upsertJsonl(file, postId, newRow) {
  const rows = fs.existsSync(file)
    ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => {
        try { return JSON.parse(l); } catch { return null; }
      }).filter(Boolean)
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

async function apiGet(url, apiKey) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 200)}`);
  try { return JSON.parse(t); } catch { return { raw: t }; }
}

const a = parseArgs();
if (!a.postId) {
  console.error('Usage: node scripts/sync_postiz_metrics.mjs --postId <id> [--date YYYY-MM-DD] [--angle <angle>] [--hook <hook>] [--cta <cta>] [--platform tiktok|x]');
  process.exit(1);
}

const apiKey = env('POSTIZ_API_KEY');
const base = env('POSTIZ_API_BASE', 'https://api.postiz.com');
const workspaceId = env('POSTIZ_WORKSPACE_ID');
if (!apiKey || !workspaceId) {
  console.error('Missing POSTIZ_API_KEY / POSTIZ_WORKSPACE_ID in env');
  process.exit(1);
}

let post = null;
const tryUrls = [
  `${base}/v1/posts/${encodeURIComponent(a.postId)}?workspaceId=${encodeURIComponent(workspaceId)}`,
  `${base}/v1/posts/${encodeURIComponent(a.postId)}`,
  `${base}/v1/posts?workspaceId=${encodeURIComponent(workspaceId)}&limit=100`
];

for (const u of tryUrls) {
  try {
    const j = await apiGet(u, apiKey);
    if (j?.id || j?.data?.id || j?.post?.id) {
      post = j?.data || j?.post || j;
      break;
    }
    const list = j?.data || j?.posts || j?.items || [];
    if (Array.isArray(list)) {
      const found = list.find(x => String(x?.id) === String(a.postId));
      if (found) { post = found; break; }
    }
  } catch {}
}

if (!post) {
  console.error('Could not fetch post metrics from Postiz for postId:', a.postId);
  process.exit(1);
}

const m = post.metrics || post.publicMetrics || post.analytics || post.insights || post.stats || {};

const metrics = {
  views: pick(m, ['views', 'viewCount', 'impressions']),
  likes: pick(m, ['likes', 'likeCount', 'favorites']),
  comments: pick(m, ['comments', 'commentCount', 'replies']),
  shares: pick(m, ['shares', 'shareCount', 'reposts', 'retweets']),
  saves: pick(m, ['saves', 'saveCount', 'bookmarks']),
  profileClicks: pick(m, ['profileClicks', 'profile_clicks', 'profileVisits', 'profile_visits']),
  linkClicks: pick(m, ['linkClicks', 'link_clicks', 'urlClicks', 'url_clicks']),
  installs: 0,
  trialStarts: 0,
  paidStarts: 0
};

const now = new Date();
const d = a.date || now.toISOString().slice(0, 10);
const dir = path.resolve(process.cwd(), 'output', 'analytics');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${d}.jsonl`);

const row = {
  ts: now.toISOString(),
  postId: String(post.id || a.postId),
  platform: a.platform || post.platform || post.channel || 'tiktok',
  angle: a.angle || post.angle || 'unknown',
  hook: a.hook || post.hook || post.title || '',
  cta: a.cta || post.cta || '',
  source: 'postiz_metrics_sync',
  draft: false,
  metrics
};

upsertJsonl(file, row.postId, row);
console.log(`Synced: ${file} (${row.postId})`);
console.log('metrics=', JSON.stringify(metrics));
