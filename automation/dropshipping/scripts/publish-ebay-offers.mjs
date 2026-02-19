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
const MARKETPLACE_ID = env.EBAY_MARKETPLACE_ID || 'EBAY_US';
const CATEGORY_ID = env.EBAY_DEFAULT_CATEGORY_ID || '20625';
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

const pickPolicy = (list) => (list?.[0]?.fulfillmentPolicyId || list?.[0]?.paymentPolicyId || list?.[0]?.returnPolicyId || null);

const getDependencies = async () => {
  const [locations, payment, fulfillment, returns] = await Promise.all([
    api('/sell/inventory/v1/location').catch(() => ({ locations: [] })),
    api(`/sell/account/v1/payment_policy?marketplace_id=${MARKETPLACE_ID}`).catch(() => ({ paymentPolicies: [] })),
    api(`/sell/account/v1/fulfillment_policy?marketplace_id=${MARKETPLACE_ID}`).catch(() => ({ fulfillmentPolicies: [] })),
    api(`/sell/account/v1/return_policy?marketplace_id=${MARKETPLACE_ID}`).catch(() => ({ returnPolicies: [] }))
  ]);

  const preferredLocationKey = env.EBAY_MERCHANT_LOCATION_KEY || null;
  const existingKeys = new Set((locations.locations || []).map((l) => l.merchantLocationKey));

  return {
    locationKey: preferredLocationKey && existingKeys.has(preferredLocationKey)
      ? preferredLocationKey
      : (locations.locations?.[0]?.merchantLocationKey || null),
    paymentPolicyId: pickPolicy(payment.paymentPolicies),
    fulfillmentPolicyId: pickPolicy(fulfillment.fulfillmentPolicies),
    returnPolicyId: pickPolicy(returns.returnPolicies)
  };
};

const findOfferBySku = async (sku) => {
  try {
    const data = await api(`/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}&limit=1`);
    return data.offers?.[0] || null;
  } catch (e) {
    if (String(e.message || e).includes('failed (404)')) return null;
    throw e;
  }
};

const createOfferPayload = (row, deps) => ({
  sku: row.sku,
  marketplaceId: MARKETPLACE_ID,
  format: 'FIXED_PRICE',
  availableQuantity: toNum(row.quantity, 1),
  categoryId: CATEGORY_ID,
  listingDescription: row.title,
  listingPolicies: {
    paymentPolicyId: deps.paymentPolicyId,
    returnPolicyId: deps.returnPolicyId,
    fulfillmentPolicyId: deps.fulfillmentPolicyId
  },
  pricingSummary: {
    price: {
      value: String(row.price_usd),
      currency: 'USD'
    }
  },
  merchantLocationKey: deps.locationKey
});

const main = async () => {
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('Missing EBAY_CLIENT_ID/EBAY_CLIENT_SECRET');

  const deps = await getDependencies();
  const missingDeps = Object.entries(deps).filter(([, v]) => !v).map(([k]) => k);

  const raw = await readFile(csvPath, 'utf8');
  const rows = parseCsv(raw);

  const plan = rows.map((r) => ({ sku: r.sku, price_usd: r.price_usd, quantity: r.quantity }));

  await mkdir(new URL('../state/', import.meta.url), { recursive: true });

  if (!apply) {
    const out = {
      mode: 'dry-run',
      env: EBAY_ENV,
      marketplace: MARKETPLACE_ID,
      categoryId: CATEGORY_ID,
      dependencies: deps,
      missingDependencies: missingDeps,
      total: plan.length,
      plan
    };
    await writeFile(new URL('../state/ebay-offer-plan.json', import.meta.url), JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  if (missingDeps.length) {
    throw new Error(`Cannot apply: missing dependencies ${missingDeps.join(', ')}`);
  }

  const results = [];
  for (const r of rows) {
    try {
      let offer = await findOfferBySku(r.sku);
      let offerId = offer?.offerId;

      const payload = createOfferPayload(r, deps);

      if (!offerId) {
        const created = await api('/sell/inventory/v1/offer', {
          method: 'POST',
          body: payload
        });
        offerId = created.offerId;
      } else {
        await api(`/sell/inventory/v1/offer/${offerId}`, {
          method: 'PUT',
          body: payload
        });
      }

      const pub = await api(`/sell/inventory/v1/offer/${offerId}/publish`, { method: 'POST' });
      results.push({ sku: r.sku, ok: true, offerId, listingId: pub.listingId || null });
    } catch (e) {
      results.push({ sku: r.sku, ok: false, error: String(e.message || e) });
    }
  }

  const report = {
    mode: 'apply',
    env: EBAY_ENV,
    marketplace: MARKETPLACE_ID,
    categoryId: CATEGORY_ID,
    total: results.length,
    ok: results.filter((x) => x.ok).length,
    failed: results.filter((x) => !x.ok).length,
    results
  };

  await writeFile(new URL('../state/ebay-offer-result.json', import.meta.url), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
};

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
