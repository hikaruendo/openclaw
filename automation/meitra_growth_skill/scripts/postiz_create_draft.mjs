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

const args = parseArgs();
if (!args.input) {
  console.error('Usage: node scripts/postiz_create_draft.mjs --input <postiz-payload.json>');
  process.exit(1);
}

const payloadPath = path.resolve(process.cwd(), args.input);
const raw = fs.readFileSync(payloadPath, 'utf8');
const payload = JSON.parse(raw);

const apiKey = env('POSTIZ_API_KEY');
const base = env('POSTIZ_API_BASE', 'https://api.postiz.com');
const workspaceId = env('POSTIZ_WORKSPACE_ID');
const channelId = env('POSTIZ_CHANNEL_ID');

if (!apiKey || !workspaceId || !channelId) {
  console.error('Missing POSTIZ_API_KEY / POSTIZ_WORKSPACE_ID / POSTIZ_CHANNEL_ID in env');
  process.exit(1);
}

const body = {
  workspaceId,
  channelId,
  status: 'draft',
  text: payload.caption,
  title: payload.title,
  tags: payload.hashtags || [],
  // 実際のmedia uploadエンドポイントは環境差異があるため、まずはtext draft作成
};

const res = await fetch(`${base}/v1/posts`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  },
  body: JSON.stringify(body)
});

const txt = await res.text();
if (!res.ok) {
  console.error('Postiz API error:', res.status, txt);
  process.exit(1);
}

let parsed = null;
try { parsed = JSON.parse(txt); } catch {}
const postId = parsed?.id || parsed?.data?.id || parsed?.post?.id || null;

// 自動記録: 投稿IDを分析ログに初期登録（数値は後で上書き/追記）
try {
  const now = new Date();
  const d = now.toISOString().slice(0, 10);
  const analyticsDir = path.resolve(process.cwd(), 'output', 'analytics');
  fs.mkdirSync(analyticsDir, { recursive: true });
  const analyticsFile = path.join(analyticsDir, `${d}.jsonl`);

  const row = {
    ts: now.toISOString(),
    postId: postId || `draft_${now.getTime()}`,
    platform: payload.platform || 'tiktok',
    angle: payload.angle || 'unknown',
    hook: payload.hook || payload.title || '',
    cta: payload.cta || '',
    source: 'postiz_draft_create',
    draft: true,
    metrics: {
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      profileClicks: 0,
      linkClicks: 0,
      installs: 0,
      trialStarts: 0,
      paidStarts: 0
    }
  };

  fs.appendFileSync(analyticsFile, JSON.stringify(row) + '\n');
  console.log('Analytics row created:', analyticsFile, 'postId=', row.postId);
} catch (e) {
  console.warn('Analytics auto-record skipped:', e?.message || e);
}

console.log('Draft created:', txt);
