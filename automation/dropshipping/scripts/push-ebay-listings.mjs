#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { loadEnv } from './load-env.mjs';

await loadEnv();

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const csvPathArg = args.find((a) => a.startsWith('--csv='));
const csvPath = csvPathArg
  ? csvPathArg.slice('--csv='.length)
  : 'automation/dropshipping/data/ebay-ready-listings-home-kitchen.csv';

const env = process.env;
const EBAY_ENV = env.EBAY_ENV || 'production';
const BASE = EBAY_ENV === 'production' ? 'https://api.ebay.com' : 'https://api.sandbox.ebay.com';
const CLIENT_ID = env.EBAY_CLIENT_ID;
const CLIENT_SECRET = env.EBAY_CLIENT_SECRET;
const tokenPath = new URL('../.secrets/ebay-token.json', import.meta.url);

const parseCsvLine = (line) => {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; continue; }
      inQ = !inQ;
      continue;
    }
    if (ch === ',' && !inQ) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
};

const parseCsv = (raw) => {
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const row = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = cols[i] ?? '';
    return row;
  });
};

const b64 = (s) => Buffer.from(s).toString('base64');
const toNum = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const loadToken = async () => JSON.parse(await readFile(tokenPath, 'utf8'));

const refreshAccessToken = async () => {
  const saved = await loadToken();
  const refreshToken = saved.refresh_token || env.EBAY_REFRESH_TOKEN;
  if (!refreshToken) throw new Error('Missing refresh token');

  const scope = (env.EBAY_SCOPES || 'https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.fulfillment https://api.ebay.com/oauth/api_scope/sell.account').trim();
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, scope });

  const res = await fetch(`${BASE}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${b64(`${CLIENT_ID}:${CLIENT_SECRET}`)}`
    },
    body
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`refresh failed: ${JSON.stringify(data)}`);

  const merged = { ...saved, ...data, refresh_token: refreshToken, env: EBAY_ENV, savedAt: new Date().toISOString() };
  await writeFile(tokenPath, JSON.stringify(merged, null, 2));
  return merged.access_token;
};

const getAccessToken = async () => {
  const saved = await loadToken();
  return saved?.access_token || refreshAccessToken();
};

const api = async (path, { method = 'GET', body } = {}) => {
  let token = await getAccessToken();
  let res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Accept-Language': env.EBAY_ACCEPT_LANGUAGE || 'en-US',
      ...(body ? {
        'Content-Type': 'application/json',
        'Content-Language': env.EBAY_CONTENT_LANGUAGE || 'en-US'
      } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (res.status === 401) {
    token = await refreshAccessToken();
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Accept-Language': env.EBAY_ACCEPT_LANGUAGE || 'en-US',
        ...(body ? {
          'Content-Type': 'application/json',
          'Content-Language': env.EBAY_CONTENT_LANGUAGE || 'en-US'
        } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
  }

  const txt = await res.text();
  let data;
  try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
  if (!res.ok) throw new Error(`${method} ${path} failed (${res.status}): ${JSON.stringify(data)}`);
  return data;
};

const buildInventoryPayload = (row) => {
  let specifics = {};
  try { specifics = JSON.parse(row.item_specifics_json || '{}'); } catch { specifics = {}; }

  const aspects = Object.fromEntries(
    Object.entries(specifics).map(([k, v]) => [k, [String(v)]])
  );

  const imageUrls = String(row.image_url || '')
    .split('|')
    .map((x) => x.trim())
    .filter(Boolean);

  return {
    availability: {
      shipToLocationAvailability: {
        quantity: toNum(row.quantity, 0)
      }
    },
    condition: 'NEW',
    packageWeightAndSize: {
      weight: {
        value: String(process.env.EBAY_DEFAULT_WEIGHT_VALUE || '0.5'),
        unit: process.env.EBAY_DEFAULT_WEIGHT_UNIT || 'POUND'
      }
    },
    product: {
      title: row.title,
      description: row.title,
      aspects,
      ...(imageUrls.length ? { imageUrls } : {})
    }
  };
};

const main = async () => {
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('Missing EBAY_CLIENT_ID/EBAY_CLIENT_SECRET');

  const raw = await readFile(csvPath, 'utf8');
  const rows = parseCsv(raw);

  const plan = rows.map((r) => ({
    sku: r.sku,
    price_usd: toNum(r.price_usd, 0),
    quantity: toNum(r.quantity, 0),
    payload: buildInventoryPayload(r)
  }));

  await mkdir(new URL('../state/', import.meta.url), { recursive: true });

  if (!apply) {
    const out = {
      mode: 'dry-run',
      env: EBAY_ENV,
      total: plan.length,
      next: 'Run with --apply to upsert inventory items only (offers publish is separate).',
      plan: plan.map((p) => ({ sku: p.sku, price_usd: p.price_usd, quantity: p.quantity }))
    };
    await writeFile(new URL('../state/ebay-push-plan.json', import.meta.url), JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  const results = [];
  for (const p of plan) {
    try {
      await api(`/sell/inventory/v1/inventory_item/${encodeURIComponent(p.sku)}`, {
        method: 'PUT',
        body: p.payload
      });
      results.push({ sku: p.sku, ok: true, action: 'inventory_item_upserted' });
    } catch (e) {
      results.push({ sku: p.sku, ok: false, error: String(e.message || e) });
    }
  }

  const report = {
    mode: 'apply',
    env: EBAY_ENV,
    total: results.length,
    ok: results.filter((x) => x.ok).length,
    failed: results.filter((x) => !x.ok).length,
    results
  };

  await writeFile(new URL('../state/ebay-push-result.json', import.meta.url), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
};

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
