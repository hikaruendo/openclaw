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
function slugify(s = '') {
  return s.toLowerCase().replace(/[^a-z0-9ぁ-んァ-ン一-龥]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

async function createPost({ base, apiKey, body }) {
  const res = await fetch(`${base}/v1/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`Postiz API ${res.status}: ${txt.slice(0, 300)}`);
  let j = null;
  try { j = JSON.parse(txt); } catch {}
  const id = j?.id || j?.data?.id || j?.post?.id || null;
  return { id, raw: txt, parsed: j };
}

function upsertAnalytics(file, row) {
  const rows = fs.existsSync(file)
    ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
    : [];
  const idx = rows.findIndex(r => String(r.postId) === String(row.postId));
  if (idx >= 0) {
    rows[idx] = { ...rows[idx], ...row, metrics: { ...(rows[idx].metrics || {}), ...(row.metrics || {}) } };
  } else {
    rows.push(row);
  }
  fs.writeFileSync(file, rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
}

const a = parseArgs();
const angle = a.angle || 'meitra開発ログ';
const proof = a.proof || '実装/検証ログあり';
const cta = a.cta || '気になる人はリプで「詳細」って送ってください。';
const mode = (a.mode || 'draft').toLowerCase(); // draft | schedule
const publishAt = a.publishAt || null; // ISO
const channels = (a.channels || 'x,tiktok').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

const apiKey = env('POSTIZ_API_KEY');
const base = env('POSTIZ_API_BASE', 'https://api.postiz.com');
const workspaceId = env('POSTIZ_WORKSPACE_ID');
const channelX = env('POSTIZ_CHANNEL_X_ID');
const channelTikTok = env('POSTIZ_CHANNEL_TIKTOK_ID');

if (!apiKey || !workspaceId) {
  console.error('Missing POSTIZ_API_KEY / POSTIZ_WORKSPACE_ID');
  process.exit(1);
}

const map = {
  x: channelX,
  tiktok: channelTikTok
};

const now = new Date();
const d = now.toISOString().slice(0, 10);
const hm = now.toISOString().slice(11, 16).replace(':', '');
const outDir = path.resolve(process.cwd(), 'output', d, `${hm}-${slugify(angle) || 'meitra-auto'}`);
fs.mkdirSync(outDir, { recursive: true });

const texts = {
  x: `【meitra開発ログ】${angle}\n\n今日の検証: ${proof}\n次の一手を進めます。\n${cta}\n\n#meitra #buildinpublic #webdev`,
  tiktok: `【検証】${angle}\n証拠: ${proof}\n${cta}\n#meitra #ゲーム開発 #開発ログ`
};

const analyticsDir = path.resolve(process.cwd(), 'output', 'analytics');
fs.mkdirSync(analyticsDir, { recursive: true });
const analyticsFile = path.join(analyticsDir, `${d}.jsonl`);

const results = [];
for (const ch of channels) {
  const channelId = map[ch];
  if (!channelId) {
    results.push({ channel: ch, ok: false, error: `Missing channel id env for ${ch}` });
    continue;
  }
  const body = {
    workspaceId,
    channelId,
    status: mode === 'schedule' ? 'scheduled' : 'draft',
    text: texts[ch] || texts.x,
    title: `meitra | ${angle}`,
    tags: ['#meitra', '#buildinpublic']
  };
  if (mode === 'schedule' && publishAt) body.publishAt = publishAt;

  try {
    const r = await createPost({ base, apiKey, body });
    const postId = r.id || `${ch}_${Date.now()}`;
    const row = {
      ts: new Date().toISOString(),
      postId,
      platform: ch,
      angle,
      hook: `meitra | ${angle}`,
      cta,
      source: 'postiz_autopost_meitra',
      draft: mode !== 'schedule',
      metrics: {
        views: 0, likes: 0, comments: 0, shares: 0, saves: 0,
        profileClicks: 0, linkClicks: 0, installs: 0, trialStarts: 0, paidStarts: 0
      }
    };
    upsertAnalytics(analyticsFile, row);
    results.push({ channel: ch, ok: true, postId, raw: r.raw });
  } catch (e) {
    results.push({ channel: ch, ok: false, error: e?.message || String(e) });
  }
}

const summary = { ts: new Date().toISOString(), mode, publishAt, angle, proof, cta, channels, results };
fs.writeFileSync(path.join(outDir, 'autopost-result.json'), JSON.stringify(summary, null, 2));

console.log(JSON.stringify(summary, null, 2));
