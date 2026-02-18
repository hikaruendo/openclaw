#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { loadEnv } from './load-env.mjs';

const args = process.argv.slice(2);
const cmd = args[0];

await loadEnv();
const env = process.env;
const EBAY_ENV = env.EBAY_ENV || 'sandbox';
const BASE = EBAY_ENV === 'production' ? 'https://api.ebay.com' : 'https://api.sandbox.ebay.com';
const AUTH_BASE = EBAY_ENV === 'production' ? 'https://auth.ebay.com' : 'https://auth.sandbox.ebay.com';

const CLIENT_ID = env.EBAY_CLIENT_ID;
const CLIENT_SECRET = env.EBAY_CLIENT_SECRET;
const RUNAME = env.EBAY_RUNAME;
const REDIRECT_URI = env.EBAY_REDIRECT_URI || null;
const SCOPES = (env.EBAY_SCOPES || [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
  'https://api.ebay.com/oauth/api_scope/sell.account',
  'https://api.ebay.com/oauth/api_scope/sell.marketing.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly'
].join(' ')).trim();

const tokenPath = new URL('../.secrets/ebay-token.json', import.meta.url);

const requireBaseConfig = () => {
  const missing = [];
  if (!CLIENT_ID) missing.push('EBAY_CLIENT_ID');
  if (!CLIENT_SECRET) missing.push('EBAY_CLIENT_SECRET');
  if (!RUNAME && !REDIRECT_URI) missing.push('EBAY_RUNAME or EBAY_REDIRECT_URI');
  if (missing.length) throw new Error(`Missing env: ${missing.join(', ')}`);
};

const b64 = (s) => Buffer.from(s).toString('base64');

const saveTokens = async (tokens) => {
  await mkdir(new URL('../.secrets/', import.meta.url), { recursive: true });
  await writeFile(tokenPath, JSON.stringify({
    savedAt: new Date().toISOString(),
    env: EBAY_ENV,
    ...tokens
  }, null, 2));
  console.log(`Saved token file: ${tokenPath.pathname}`);
};

const loadSavedTokens = async () => {
  const raw = await readFile(tokenPath, 'utf8');
  return JSON.parse(raw);
};

const printAuthUrl = () => {
  requireBaseConfig();
  const redirect = REDIRECT_URI || RUNAME;
  const u = new URL(`${AUTH_BASE}/oauth2/authorize`);
  u.searchParams.set('client_id', CLIENT_ID);
  u.searchParams.set('redirect_uri', redirect);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', SCOPES);
  u.searchParams.set('prompt', 'login');
  console.log('\nOpen this URL in browser and approve:\n');
  console.log(u.toString());
  console.log('\nAfter approval, copy the `code` from redirected URL and run:');
  console.log('node automation/dropshipping/scripts/ebay-oauth.mjs exchange-code --code="<CODE>"');
};

const parseFlag = (name) => {
  const key = `--${name}=`;
  const found = args.find(a => a.startsWith(key));
  return found ? found.slice(key.length) : null;
};

const tokenRequest = async (bodyParams) => {
  requireBaseConfig();
  const body = new URLSearchParams(bodyParams);
  const res = await fetch(`${BASE}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${b64(`${CLIENT_ID}:${CLIENT_SECRET}`)}`
    },
    body
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!res.ok) {
    throw new Error(`Token request failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
};

const exchangeCode = async () => {
  const code = parseFlag('code');
  if (!code) throw new Error('Missing --code="..."');
  const redirect = REDIRECT_URI || RUNAME;
  const token = await tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirect
  });
  await saveTokens(token);
  console.log('Access token + refresh token acquired.');
};

const refresh = async () => {
  const refreshFromFlag = parseFlag('refresh_token');
  const refreshToken = refreshFromFlag || (await loadSavedTokens()).refresh_token;
  if (!refreshToken) throw new Error('No refresh token found.');

  const token = await tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: SCOPES
  });

  await saveTokens({ ...token, refresh_token: refreshToken });
  console.log('Access token refreshed.');
};

const main = async () => {
  if (!cmd || cmd === 'help' || cmd === '--help') {
    console.log('Usage:');
    console.log('  node automation/dropshipping/scripts/ebay-oauth.mjs print-auth-url');
    console.log('  node automation/dropshipping/scripts/ebay-oauth.mjs exchange-code --code="..."');
    console.log('  node automation/dropshipping/scripts/ebay-oauth.mjs refresh-token [--refresh_token="..."]');
    return;
  }

  if (cmd === 'print-auth-url') return printAuthUrl();
  if (cmd === 'exchange-code') return exchangeCode();
  if (cmd === 'refresh-token') return refresh();
  throw new Error(`Unknown command: ${cmd}`);
};

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
