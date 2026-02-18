export class LiveSupplierAdapter {
  constructor() {
    this.apiBase = process.env.SUPPLIER_API_BASE;
    this.apiKey = process.env.SUPPLIER_API_KEY;
  }

  _assertConfigured() {
    const missing = [];
    if (!this.apiBase) missing.push('SUPPLIER_API_BASE');
    if (!this.apiKey) missing.push('SUPPLIER_API_KEY');
    if (missing.length) {
      throw new Error(`LiveSupplierAdapter not configured. Missing: ${missing.join(', ')}`);
    }
  }

  async fetchCatalogCandidates() {
    this._assertConfigured();
    throw new Error('TODO: implement supplier catalog candidate pull');
  }

  async fetchStockAndPriceBySku() {
    this._assertConfigured();
    throw new Error('TODO: implement supplier stock/price sync');
  }

  async placeOrder(_payload) {
    this._assertConfigured();
    throw new Error('TODO: implement supplier order placement');
  }
}
