import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { loadEnv } from './load-env.mjs';

const DEFAULT_WATCHLIST = new URL('../data/supplier-watchlist.csv', import.meta.url);
const OUT_DIR = new URL('../state/', import.meta.url);

const nowJst = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return { date: `${y}${m}${day}`, ts: `${y}-${m}-${day} ${hh}:${mm}:${ss}` };
};

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
    if (ch === ',' && !inQ) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
};

const loadWatchlist = async (fileUrl) => {
  const raw = await readFile(fileUrl, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const row = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = cols[i] ?? '';
    return row;
  }).filter((r) => r.url && r.source_market && r.sku);
};

const esc = (v) => {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const toCsv = (rows, cols) => [
  cols.join(','),
  ...rows.map((r) => cols.map((c) => esc(r[c] ?? '')).join(','))
].join('\n') + '\n';

const parsePrice = (text) => {
  if (!text) return null;
  const compact = text.replace(/[\s\u00A0]/g, '');
  const m = compact.match(/(?:¥|￥|JPY)?\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{3,})/i);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

const detectStock = (html) => {
  const h = html.toLowerCase();
  if (h.includes('在庫切れ') || h.includes('sold out') || h.includes('売り切れ')) return 'out_of_stock';
  if (h.includes('在庫あり') || h.includes('in stock') || h.includes('カートに入れる')) return 'in_stock';
  return 'unknown';
};

const detectShipDays = (html) => {
  const plain = html.replace(/<[^>]*>/g, ' ');
  const m = plain.match(/([0-9]{1,2})\s*[〜~\-]\s*([0-9]{1,2})\s*日/);
  if (m) return `${m[1]}-${m[2]}d`;
  const m2 = plain.match(/([0-9]{1,2})\s*日(?:以内)?/);
  if (m2) return `${m2[1]}d`;
  return '';
};

const stripTags = (s) => s.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]*>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const readTitle = (html) => {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  if (og?.[1]) return og[1].trim();
  const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return t?.[1]?.trim() || '';
};

const extractBySource = (source, html) => {
  const plain = stripTags(html);
  const title = readTitle(html);

  // Qoo10 often has many numbers; try nearby price labels first
  if (source === 'qoo10') {
    const m = plain.match(/(?:販売価格|価格|Price)[:：]?\s*(?:¥|￥)?\s*([0-9,]{3,})/i);
    const p = m ? Number(m[1].replace(/,/g, '')) : parsePrice(plain);
    return { title, price_jpy: p ?? '', stock: detectStock(html), ship_days: detectShipDays(html) };
  }

  if (source === 'rakuten') {
    const m = plain.match(/(?:価格|税込)[:：]?\s*(?:¥|￥)?\s*([0-9,]{3,})/i);
    const p = m ? Number(m[1].replace(/,/g, '')) : parsePrice(plain);
    return { title, price_jpy: p ?? '', stock: detectStock(html), ship_days: detectShipDays(html) };
  }

  if (source === 'amazon_jp' || source === 'amazon') {
    const m = plain.match(/(?:￥|¥)\s*([0-9,]{3,})/);
    const p = m ? Number(m[1].replace(/,/g, '')) : parsePrice(plain);
    return { title, price_jpy: p ?? '', stock: detectStock(html), ship_days: detectShipDays(html) };
  }

  return { title, price_jpy: parsePrice(plain) ?? '', stock: detectStock(html), ship_days: detectShipDays(html) };
};

const fetchPage = async (url) => {
  const res = await fetch(url, {
    headers: {
      'user-agent': process.env.SUPPLIER_CRAWL_UA || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'accept-language': 'ja,en-US;q=0.9,en;q=0.8'
    }
  });
  const html = await res.text();
  return { status: res.status, html };
};

const main = async () => {
  await loadEnv();
  const watchlistArg = process.argv.find((x) => x.startsWith('--watchlist='));
  const watchlistUrl = watchlistArg ? new URL(watchlistArg.split('=')[1], `file://${process.cwd()}/`) : DEFAULT_WATCHLIST;

  const watchlist = await loadWatchlist(watchlistUrl);
  if (!watchlist.length) {
    console.error('No rows in watchlist CSV.');
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });

  const { date, ts } = nowJst();
  const rows = [];

  for (const row of watchlist) {
    const source = (row.source_market || '').toLowerCase();
    try {
      const { status, html } = await fetchPage(row.url);
      const ex = extractBySource(source, html);
      rows.push({
        checked_at: ts,
        sku: row.sku,
        source_market: row.source_market,
        title: ex.title || row.title || '',
        price_jpy: ex.price_jpy,
        stock: ex.stock,
        ship_days: ex.ship_days,
        source_url: row.url,
        http_status: status,
        error: ''
      });
    } catch (e) {
      rows.push({
        checked_at: ts,
        sku: row.sku,
        source_market: row.source_market,
        title: row.title || '',
        price_jpy: '',
        stock: 'unknown',
        ship_days: '',
        source_url: row.url,
        http_status: '',
        error: String(e.message || e)
      });
    }
  }

  const cols = ['checked_at', 'sku', 'source_market', 'title', 'price_jpy', 'stock', 'ship_days', 'source_url', 'http_status', 'error'];
  const csv = toCsv(rows, cols);

  const dated = new URL(`./supplier-snapshot-${date}.csv`, OUT_DIR);
  const latest = new URL('./supplier-snapshot-latest.csv', OUT_DIR);
  await writeFile(dated, csv, 'utf8');
  await writeFile(latest, csv, 'utf8');

  const ok = rows.filter((r) => !r.error).length;
  const fail = rows.length - ok;
  console.log(JSON.stringify({ ok: true, rows: rows.length, success: ok, failed: fail, dated: dated.pathname, latest: latest.pathname }, null, 2));
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
