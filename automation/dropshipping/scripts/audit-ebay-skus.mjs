#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { loadEnv } from './load-env.mjs';

await loadEnv();

const env = process.env;
const EBAY_ENV = env.EBAY_ENV || 'production';
const BASE = EBAY_ENV === 'production' ? 'https://api.ebay.com' : 'https://api.sandbox.ebay.com';
const CLIENT_ID = env.EBAY_CLIENT_ID;
const CLIENT_SECRET = env.EBAY_CLIENT_SECRET;
const tokenPath = new URL('../.secrets/ebay-token.json', import.meta.url);

const SKU_REGEX = /^[A-Za-z0-9]{1,50}$/;

const b64 = (s) => Buffer.from(s).toString('base64');

const loadToken = async () => JSON.parse(await readFile(tokenPath, 'utf8'));

const refreshAccessToken = async () => {
  const tok = await loadToken();
  const refresh = tok.refresh_token || env.EBAY_REFRESH_TOKEN;
  if (!refresh) throw new Error('refresh token missing');

  const scope = (env.EBAY_SCOPES || 'https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.fulfillment https://api.ebay.com/oauth/api_scope/sell.account').trim();
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh, scope });

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

  const merged = { ...tok, ...data, refresh_token: refresh, env: EBAY_ENV, savedAt: new Date().toISOString() };
  await writeFile(tokenPath, JSON.stringify(merged, null, 2));
  return merged.access_token;
};

const getAccessToken = async () => {
  try {
    const tok = await loadToken();
    if (tok?.access_token) return tok.access_token;
  } catch {}
  return refreshAccessToken();
};

const api = async (path) => {
  let token = await getAccessToken();
  let res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Accept-Language': env.EBAY_ACCEPT_LANGUAGE || 'en-US'
    }
  });

  if (res.status === 401) {
    token = await refreshAccessToken();
    res = await fetch(`${BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Accept-Language': env.EBAY_ACCEPT_LANGUAGE || 'en-US'
      }
    });
  }

  const txt = await res.text();
  let data;
  try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
  if (!res.ok) throw new Error(`${path} failed (${res.status}): ${JSON.stringify(data)}`);
  return data;
};

const main = async () => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('Missing EBAY_CLIENT_ID or EBAY_CLIENT_SECRET');
  }

  const page = await api('/sell/inventory/v1/inventory_item?limit=200');
  const items = page.inventoryItems || [];

  const invalid = items
    .map((i) => i.sku)
    .filter((sku) => !SKU_REGEX.test(sku || ''));

  const report = {
    createdAt: new Date().toISOString(),
    env: EBAY_ENV,
    totalInventoryItems: items.length,
    invalidSkuCount: invalid.length,
    invalidSkus: invalid
  };

  await mkdir(new URL('../state/', import.meta.url), { recursive: true });
  await writeFile(new URL('../state/ebay-sku-audit.json', import.meta.url), JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report, null, 2));
};

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
