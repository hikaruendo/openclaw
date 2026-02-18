/**
 * eBay adapter interface (documented contract)
 *
 * Implementations:
 * - mockEbayAdapter.mjs
 * - liveEbayAdapter.mjs (TODO: real API wiring)
 */

export class IEbayAdapter {
  async fetchOpenOrders() {
    throw new Error('Not implemented: fetchOpenOrders');
  }

  async fetchActiveListings() {
    throw new Error('Not implemented: fetchActiveListings');
  }

  async updateListingPrice(_sku, _newPrice) {
    throw new Error('Not implemented: updateListingPrice');
  }

  async setListingOutOfStock(_sku) {
    throw new Error('Not implemented: setListingOutOfStock');
  }

  async postTracking(_orderId, _trackingNumber, _carrier) {
    throw new Error('Not implemented: postTracking');
  }

  async sendMessage(_buyerId, _subject, _body) {
    throw new Error('Not implemented: sendMessage');
  }
}
