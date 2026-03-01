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

function listJsonlFiles(dir, from, to) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
    .sort();
  return files
    .filter(f => (!from || f >= `${from}.jsonl`) && (!to || f <= `${to}.jsonl`))
    .map(f => path.join(dir, f));
}

function readRows(files) {
  const rows = [];
  for (const f of files) {
    const lines = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try { rows.push(JSON.parse(line)); } catch {}
    }
  }
  return rows;
}

function safeDiv(a, b) { return b ? a / b : 0; }

function summarize(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const k = (r[key] || 'unknown').trim() || 'unknown';
    if (!m.has(k)) m.set(k, { count: 0, views: 0, likes: 0, comments: 0, shares: 0, saves: 0, profileClicks: 0, linkClicks: 0, installs: 0, trialStarts: 0, paidStarts: 0 });
    const t = m.get(k);
    t.count += 1;
    const x = r.metrics || {};
    for (const kk of ['views','likes','comments','shares','saves','profileClicks','linkClicks','installs','trialStarts','paidStarts']) {
      t[kk] += Number(x[kk] || 0);
    }
  }
  const out = [];
  for (const [name, v] of m) {
    const engagement = v.likes + v.comments + v.shares + v.saves;
    out.push({
      name,
      posts: v.count,
      views: v.views,
      engagement,
      er: safeDiv(engagement, v.views),
      saveRate: safeDiv(v.saves, v.views),
      ctr: safeDiv(v.linkClicks, v.views),
      installRate: safeDiv(v.installs, v.views),
      trialRate: safeDiv(v.trialStarts, v.views),
      paidRate: safeDiv(v.paidStarts, v.views)
    });
  }
  return out.sort((a, b) => b.er - a.er);
}

const a = parseArgs();
const from = a.from; // YYYY-MM-DD
const to = a.to;     // YYYY-MM-DD
const dir = path.resolve(process.cwd(), 'output', 'analytics');
const files = listJsonlFiles(dir, from, to);
const rows = readRows(files);

if (!rows.length) {
  console.log('No analytics rows found.');
  process.exit(0);
}

// postId単位で最新行だけ使う（下書き→公開後同期の重複を除外）
const latestByPost = new Map();
for (const r of rows) {
  const id = String(r.postId || '');
  if (!id) continue;
  const prev = latestByPost.get(id);
  if (!prev || String(prev.ts || '') < String(r.ts || '')) latestByPost.set(id, r);
}
const dedupedRows = Array.from(latestByPost.values());

const byAngle = summarize(dedupedRows, 'angle');
const byHook = summarize(dedupedRows, 'hook');
const byCta = summarize(dedupedRows, 'cta');

const now = new Date();
const outDir = path.resolve(process.cwd(), 'output', 'analytics-reports');
fs.mkdirSync(outDir, { recursive: true });
const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-');

const report = { generatedAt: now.toISOString(), from: from || null, to: to || null, totals: { rows: rows.length, dedupedPosts: dedupedRows.length }, byAngle, byHook, byCta };
const jsonPath = path.join(outDir, `report-${stamp}.json`);
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

function top3(list) { return list.slice(0, 3).map(x => `${x.name} (ER ${(x.er*100).toFixed(2)}%, posts ${x.posts})`).join('\n'); }
const md = `# Meitra Growth Report\n\n- Range: ${from || 'all'} ~ ${to || 'all'}\n- Rows: ${rows.length}\n- Deduped posts: ${dedupedRows.length}\n\n## Top Angles\n${top3(byAngle)}\n\n## Top Hooks\n${top3(byHook)}\n\n## Top CTA\n${top3(byCta)}\n\n## Next Actions\n1. Top angleを3バリエーションで再生成\n2. ER下位angleは一旦停止\n3. CTR高いCTAを次バッチに固定\n`;
const mdPath = path.join(outDir, `report-${stamp}.md`);
fs.writeFileSync(mdPath, md);

console.log(`Report JSON: ${jsonPath}`);
console.log(`Report MD:   ${mdPath}`);
