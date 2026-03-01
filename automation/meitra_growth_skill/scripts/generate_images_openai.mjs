#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i += 2) out[args[i]?.replace(/^--/, '')] = args[i + 1];
  return out;
}

const args = parseArgs();
if (!args.slides) {
  console.error('Usage: node scripts/generate_images_openai.mjs --slides <slides.json>');
  process.exit(1);
}
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}

const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
const slidesPath = path.resolve(process.cwd(), args.slides);
const slides = JSON.parse(fs.readFileSync(slidesPath, 'utf8'));
const outDir = path.dirname(slidesPath);

for (const s of slides) {
  if ((s.prompt || '').startsWith('PLACEHOLDER')) continue;
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      prompt: `${s.prompt}\nOverlay text: ${s.text}`,
      size: '1024x1536'
    })
  });
  const json = await res.json();
  if (!res.ok) {
    console.error('OpenAI image error', s.idx, json);
    process.exit(1);
  }
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) {
    console.error('No image data for slide', s.idx, json);
    process.exit(1);
  }
  fs.writeFileSync(path.join(outDir, `slide-${String(s.idx).padStart(2, '0')}.png`), Buffer.from(b64, 'base64'));
  console.log('Generated slide', s.idx);
}

console.log('Done. Replace slide-03 with real gameplay screenshot before post.');
