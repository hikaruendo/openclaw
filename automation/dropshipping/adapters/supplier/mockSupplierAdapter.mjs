import { readFile } from 'node:fs/promises';

const loadJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

export class MockSupplierAdapter {
  constructor({ baseDirUrl }) {
    this.baseDirUrl = baseDirUrl;
  }

  async fetchCatalogCandidates() {
    return loadJson(new URL('./data/products.sample.json', this.baseDirUrl));
  }

  async fetchStockAndPriceBySku() {
    return loadJson(new URL('./data/listings.sample.json', this.baseDirUrl));
  }

  async placeOrder({ supplierSku, quantity, shippingAddress }) {
    return {
      ok: true,
      mode: 'mock',
      supplierOrderId: `SUP-${Date.now()}`,
      supplierSku,
      quantity,
      shippingAddress,
      trackingNumber: `MOCKTRK${Math.floor(Math.random() * 1e8)}`,
      carrier: 'UPS'
    };
  }
}
