#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i]?.replace(/^--/, '');
    out[k] = args[i + 1];
  }
  return out;
}

function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
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

const a = parseArgs();
if (!a.postId) {
  console.error('Usage: node scripts/record_post_result.mjs --postId <id> [--angle <angle>] [--hook <hook>] [--cta <cta>] [--platform tiktok|x] [--date YYYY-MM-DD] [--views 0] [--likes 0] [--comments 0] [--shares 0] [--saves 0] [--profileClicks 0] [--linkClicks 0] [--installs 0] [--trialStarts 0] [--paidStarts 0]');
  process.exit(1);
}

const now = new Date();
const d = a.date || now.toISOString().slice(0, 10);
const dir = path.resolve(process.cwd(), 'output', 'analytics');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${d}.jsonl`);

const row = {
  ts: now.toISOString(),
  postId: a.postId,
  platform: a.platform || 'tiktok',
  angle: a.angle || 'unknown',
  hook: a.hook || '',
  cta: a.cta || '',
  source: a.source || 'manual_record',
  metrics: {
    views: num(a.views),
    likes: num(a.likes),
    comments: num(a.comments),
    shares: num(a.shares),
    saves: num(a.saves),
    profileClicks: num(a.profileClicks),
    linkClicks: num(a.linkClicks),
    installs: num(a.installs),
    trialStarts: num(a.trialStarts),
    paidStarts: num(a.paidStarts)
  }
};

upsertJsonl(file, row.postId, row);
console.log(`Upserted: ${file} (${row.postId})`);
