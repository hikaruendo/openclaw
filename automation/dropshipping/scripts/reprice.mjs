export const runReprice = ({ listings, rules }) => {
  const threshold = rules.inventoryAndPricing.repriceOnSourceDeltaPct;
  const immediate = rules.inventoryAndPricing.immediateRepriceDeltaPct;

  const actions = listings.map((l) => {
    if (l.sourceStock <= 0) {
      return { sku: l.sku, action: 'set_out_of_stock', reason: 'source_stock_0' };
    }

    const deltaPct = +(((l.sourcePriceNow - l.sourcePricePrev) / l.sourcePricePrev) * 100).toFixed(2);

    if (Math.abs(deltaPct) >= immediate) {
      return { sku: l.sku, action: 'reprice_now', reason: `delta_${deltaPct}%` };
    }
    if (Math.abs(deltaPct) >= threshold) {
      return { sku: l.sku, action: 'reprice', reason: `delta_${deltaPct}%` };
    }
    return { sku: l.sku, action: 'none', reason: `delta_${deltaPct}%` };
  });

  return { actions };
};
