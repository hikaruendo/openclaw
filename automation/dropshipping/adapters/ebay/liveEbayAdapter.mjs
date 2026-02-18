import { readFile, writeFile, mkdir } from 'node:fs/promises';

/**
 * Live eBay adapter (sandbox/production)
 *
 * Expected env:
 * - EBAY_ENV=sandbox|production
 * - EBAY_CLIENT_ID
 * - EBAY_CLIENT_SECRET
 * - EBAY_REFRESH_TOKEN (optional if token file exists)
 *
 * Token file fallback:
 * automation/dropshipping/.secrets/ebay-token.json
 */
export class LiveEbayAdapter {
  constructor({ fetchImpl = fetch } = {}) {
    this.fetch = fetchImpl;
    this.env = process.env.EBAY_ENV || 'sandbox';
    this.clientId = process.env.EBAY_CLIENT_ID;
    this.clientSecret = process.env.EBAY_CLIENT_SECRET;
    this.refreshTokenFromEnv = process.env.EBAY_REFRESH_TOKEN;
    this.baseUrl = this.env === 'production' ? 'https://api.ebay.com' : 'https://api.sandbox.ebay.com';
    this.tokenUrl = `${this.baseUrl}/identity/v1/oauth2/token`;
    this.tokenFileUrl = new URL('../../.secrets/ebay-token.json', import.meta.url);
  }

  _assertConfigured() {
    const missing = ['clientId', 'clientSecret'].filter((k) => !this[k]);
    if (missing.length) {
      throw new Error(`LiveEbayAdapter not configured. Missing: ${missing.join(', ')}`);
    }
  }

  _b64(s) {
    return Buffer.from(s).toString('base64');
  }

  async _readTokenFile() {
    try {
      const raw = await readFile(this.tokenFileUrl, 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async _writeTokenFile(payload) {
    await mkdir(new URL('../../.secrets/', import.meta.url), { recursive: true });
    await writeFile(this.tokenFileUrl, JSON.stringify(payload, null, 2));
  }

  async _refreshAccessToken() {
    this._assertConfigured();
    const saved = await this._readTokenFile();
    const refreshToken = this.refreshTokenFromEnv || saved?.refresh_token;
    if (!refreshToken) {
      throw new Error('No refresh token. Run OAuth flow first: scripts/ebay-oauth.mjs');
    }

    const scope = (process.env.EBAY_SCOPES || 'https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.fulfillment https://api.ebay.com/oauth/api_scope/sell.account').trim();

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope
    });

    const res = await this.fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${this._b64(`${this.clientId}:${this.clientSecret}`)}`
      },
      body
    });

    const txt = await res.text();
    let data;
    try { data = JSON.parse(txt); } catch { data = { raw: txt }; }

    if (!res.ok) {
      throw new Error(`Failed to refresh eBay token (${res.status}): ${JSON.stringify(data)}`);
    }

    const merged = {
      savedAt: new Date().toISOString(),
      env: this.env,
      ...data,
      refresh_token: refreshToken
    };

    await this._writeTokenFile(merged);
    return merged.access_token;
  }

  async _getAccessToken() {
    const saved = await this._readTokenFile();
    if (saved?.access_token) return saved.access_token;
    return this._refreshAccessToken();
  }

  async _request(path, { method = 'GET', body, headers = {} } = {}) {
    const token = await this._getAccessToken();
    const res = await this.fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    if (!res.ok) {
      throw new Error(`eBay API ${method} ${path} failed (${res.status}): ${JSON.stringify(json)}`);
    }
    return json;
  }

  async fetchOpenOrders() {
    const data = await this._request('/sell/fulfillment/v1/order?limit=100');
    const orders = data.orders || [];
    return orders.map((o) => ({
      orderId: o.orderId,
      orderValue: Number(o.pricingSummary?.total?.value || 0),
      riskScore: 0,
      addressMismatch: false,
      freightForwarderSuspected: false,
      highRiskSignal: false,
      newSupplierFirstOrder: false,
      raw: o
    }));
  }

  async fetchActiveListings() {
    const data = await this._request('/sell/inventory/v1/offer?limit=200');
    const offers = data.offers || [];
    return offers.map((o) => ({
      sku: o.sku,
      offerId: o.offerId,
      availableQuantity: Number(o.availableQuantity || 0),
      currentPrice: Number(o.pricingSummary?.price?.value || 0),
      currency: o.pricingSummary?.price?.currency || 'USD',
      sourcePricePrev: Number(o.pricingSummary?.price?.value || 0),
      sourcePriceNow: Number(o.pricingSummary?.price?.value || 0),
      sourceStock: Number(o.availableQuantity || 0),
      raw: o
    }));
  }

  async _findOfferBySku(sku) {
    const data = await this._request(`/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}&limit=1`);
    const offer = (data.offers || [])[0];
    if (!offer) throw new Error(`Offer not found for sku=${sku}`);
    return offer;
  }

  async updateListingPrice(sku, newPrice) {
    if (newPrice == null) {
      return { ok: true, mode: 'live', action: 'update_price_skipped', sku, reason: 'newPrice is null' };
    }

    const offer = await this._findOfferBySku(sku);
    const currency = offer.pricingSummary?.price?.currency || 'USD';
    const qty = Number(offer.availableQuantity || 0);

    const payload = {
      requests: [
        {
          offerId: offer.offerId,
          price: {
            value: String(newPrice),
            currency
          },
          availableQuantity: qty
        }
      ]
    };

    await this._request('/sell/inventory/v1/bulk_update_price_quantity', {
      method: 'POST',
      body: payload
    });

    return { ok: true, mode: 'live', action: 'update_price', sku, newPrice, offerId: offer.offerId };
  }

  async setListingOutOfStock(sku) {
    const offer = await this._findOfferBySku(sku);
    const currentPrice = offer.pricingSummary?.price;
    if (!currentPrice?.value) {
      throw new Error(`Cannot set out of stock for ${sku}: price missing on offer ${offer.offerId}`);
    }

    const payload = {
      requests: [
        {
          offerId: offer.offerId,
          price: {
            value: String(currentPrice.value),
            currency: currentPrice.currency || 'USD'
          },
          availableQuantity: 0
        }
      ]
    };

    await this._request('/sell/inventory/v1/bulk_update_price_quantity', {
      method: 'POST',
      body: payload
    });

    return { ok: true, mode: 'live', action: 'set_out_of_stock', sku, offerId: offer.offerId };
  }

  async postTracking(orderId, trackingNumber, carrier) {
    // eBay requires line items in many flows; keep explicit manual integration point.
    return {
      ok: false,
      mode: 'live',
      action: 'post_tracking_todo',
      orderId,
      trackingNumber,
      carrier,
      reason: 'Implement with /sell/fulfillment/v1/order/{orderId}/shipping_fulfillment including lineItems.'
    };
  }

  async sendMessage(buyerId, subject, body) {
    return {
      ok: false,
      mode: 'live',
      action: 'send_message_todo',
      buyerId,
      subject,
      body,
      reason: 'Implement with eBay-supported messaging path for your account/app permissions.'
    };
  }
}
