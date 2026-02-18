import { readFile } from 'node:fs/promises';

const loadJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

export class MockEbayAdapter {
  constructor({ baseDirUrl }) {
    this.baseDirUrl = baseDirUrl;
  }

  async fetchOpenOrders() {
    return loadJson(new URL('./data/orders.sample.json', this.baseDirUrl));
  }

  async fetchActiveListings() {
    return loadJson(new URL('./data/listings.sample.json', this.baseDirUrl));
  }

  async updateListingPrice(sku, newPrice) {
    return { ok: true, mode: 'mock', action: 'update_price', sku, newPrice };
  }

  async setListingOutOfStock(sku) {
    return { ok: true, mode: 'mock', action: 'set_out_of_stock', sku };
  }

  async postTracking(orderId, trackingNumber, carrier) {
    return { ok: true, mode: 'mock', action: 'post_tracking', orderId, trackingNumber, carrier };
  }

  async sendMessage(buyerId, subject, body) {
    return { ok: true, mode: 'mock', action: 'send_message', buyerId, subject, body };
  }
}
