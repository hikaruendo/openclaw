#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, '');
    const val = args[i + 1];
    if (key) out[key] = val;
  }
  return out;
}

function slugify(s = '') {
  return s.toLowerCase().replace(/[^a-z0-9ぁ-んァ-ン一-龥]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

const a = parseArgs();
const angle = a.angle || 'Meitraで勝率を上げる1手';
const proof = a.proof || '実プレイから学んだ1局面';
const cta = a.cta || '#meitra を付けてスクショ投稿して。毎日紹介します';

const now = new Date();
const d = now.toISOString().slice(0, 10);
const hm = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
const dir = path.resolve(process.cwd(), 'output', d, `${hm}-${slugify(angle) || 'post'}`);
fs.mkdirSync(dir, { recursive: true });

const hook = `【検証】${angle}`;
const caption = `今日の検証テーマ: ${angle}\n\n証拠: ${proof}\n\n勝てる手順を1つずつ分解して投稿します。\n${cta}`;

const slides = [
  { idx: 1, type: 'hook', text: hook, prompt: 'Vertical 1024x1536. Bold Japanese headline slide for strategy card game, high contrast, clean UI-like design.' },
  { idx: 2, type: 'problem', text: 'よくあるミス', prompt: 'Vertical 1024x1536. Minimal infographic showing common beginner mistake in trick-taking card game.' },
  { idx: 3, type: 'proof', text: '実プレイ証拠', prompt: 'PLACEHOLDER: replace with real Meitra screenshot.' },
  { idx: 4, type: 'step1', text: '手順1: 状況把握', prompt: 'Vertical 1024x1536 educational slide with simple icons and short Japanese text.' },
  { idx: 5, type: 'step2', text: '手順2: 判断', prompt: 'Vertical 1024x1536 educational slide, same style consistency.' },
  { idx: 6, type: 'cta', text: '続きは明日。スクショ投稿で紹介', prompt: 'Vertical 1024x1536 CTA slide, social proof style.' }
];

const payload = {
  title: hook,
  caption,
  platform: 'tiktok',
  mode: 'draft',
  angle,
  hook,
  cta,
  notes: 'Replace slide 3 with real gameplay screenshot before posting.',
  hashtags: ['#meitra', '#カードゲーム', '#戦略ゲーム', '#ゲーム攻略'],
  assets: slides.map(s => ({ idx: s.idx, type: s.type, text: s.text }))
};

fs.writeFileSync(path.join(dir, 'hook.txt'), hook);
fs.writeFileSync(path.join(dir, 'caption.txt'), caption);
fs.writeFileSync(path.join(dir, 'slides.json'), JSON.stringify(slides, null, 2));
fs.writeFileSync(path.join(dir, 'postiz-payload.json'), JSON.stringify(payload, null, 2));

console.log(`Generated: ${dir}`);
