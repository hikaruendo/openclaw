import { readFile } from 'node:fs/promises';

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

const toNum = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export class LiveSupplierAdapter {
  constructor() {
    this.apiBase = process.env.SUPPLIER_API_BASE;
    this.apiKey = process.env.SUPPLIER_API_KEY;
    this.snapshotPath = process.env.SUPPLIER_SNAPSHOT_PATH || new URL('../../state/supplier-snapshot-latest.csv', import.meta.url).pathname;
    this.watchlistPath = process.env.SUPPLIER_WATCHLIST_PATH || new URL('../../data/supplier-watchlist.csv', import.meta.url).pathname;
    this.defaultShippingCost = toNum(process.env.SUPPLIER_DEFAULT_SHIPPING_COST, 6);
    this.targetMarkupPct = toNum(process.env.SUPPLIER_TARGET_MARKUP_PCT, 0.45);
  }

  _assertConfigured() {
    const mode = (this.apiBase || '').toLowerCase();
    const csvMode = mode === 'csv';

    const missing = [];
    if (!this.apiBase) missing.push('SUPPLIER_API_BASE');
    if (!this.apiKey) missing.push('SUPPLIER_API_KEY');
    if (!csvMode && (!this.apiBase || this.apiBase === 'mock' || this.apiBase === 'csv')) {
      missing.push('valid SUPPLIER_API_BASE');
    }

    if (missing.length) {
      throw new Error(`LiveSupplierAdapter not configured. Missing: ${missing.join(', ')}`);
    }
  }

  async _loadSnapshotRows() {
    const raw = await readFile(this.snapshotPath, 'utf8');
    return parseCsv(raw);
  }

  async _loadWatchlistRows() {
    try {
      const raw = await readFile(this.watchlistPath, 'utf8');
      return parseCsv(raw);
    } catch {
      return [];
    }
  }

  async fetchCatalogCandidates() {
    this._assertConfigured();

    if ((this.apiBase || '').toLowerCase() !== 'csv') {
      throw new Error('Only SUPPLIER_API_BASE=csv is implemented for LiveSupplierAdapter currently.');
    }

    const [snapshotRows, watchRows] = await Promise.all([
      this._loadSnapshotRows(),
      this._loadWatchlistRows()
    ]);

    const watchBySku = new Map(watchRows.map((w) => [w.sku, w]));

    return snapshotRows
      .filter((r) => r.sku)
      .map((r) => {
        const sourcePrice = toNum(r.price_jpy, 0);
        const shippingCost = this.defaultShippingCost;
        const targetSellPrice = Math.round((sourcePrice + shippingCost) * (1 + this.targetMarkupPct) * 100) / 100;
        const watch = watchBySku.get(r.sku) || {};
        return {
          sku: r.sku,
          sourcePrice,
          shippingCost,
          targetSellPrice,
          sourceMarket: r.source_market || watch.source_market || '',
          sourceUrl: r.source_url || watch.url || '',
          sourceStock: r.stock === 'out_of_stock' ? 0 : 1,
          raw: r
        };
      })
      .filter((x) => x.sourcePrice > 0);
  }

  async fetchStockAndPriceBySku() {
    this._assertConfigured();

    if ((this.apiBase || '').toLowerCase() !== 'csv') {
      throw new Error('Only SUPPLIER_API_BASE=csv is implemented for LiveSupplierAdapter currently.');
    }

    const rows = await this._loadSnapshotRows();
    const out = {};
    for (const r of rows) {
      if (!r.sku) continue;
      out[r.sku] = {
        sku: r.sku,
        sourcePriceNow: toNum(r.price_jpy, 0),
        sourcePricePrev: toNum(r.price_jpy, 0),
        sourceStock: r.stock === 'out_of_stock' ? 0 : 1,
        sourceMarket: r.source_market || '',
        sourceUrl: r.source_url || '',
        checkedAt: r.checked_at || ''
      };
    }
    return out;
  }

  async placeOrder({ supplierSku, quantity, shippingAddress }) {
    this._assertConfigured();

    if ((this.apiBase || '').toLowerCase() !== 'csv') {
      throw new Error('Only SUPPLIER_API_BASE=csv is implemented for LiveSupplierAdapter currently.');
    }

    return {
      ok: false,
      mode: 'live-csv',
      action: 'manual_order_required',
      supplierSku,
      quantity,
      shippingAddress,
      reason: 'CSV live mode supports stock/price sync only. Place order manually or add supplier API integration.'
    };
  }
}
