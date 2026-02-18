import { calcTargetPrice, evaluateProfit } from './price-engine.mjs';

export const runResearch = ({ products, rules }) => {
  const summary = products.map((p) => {
    const suggestedSellPrice = calcTargetPrice({
      sourcePrice: p.sourcePrice,
      shippingCost: p.shippingCost,
      rules
    });

    const sellPrice = p.targetSellPrice ?? suggestedSellPrice;
    const evalRes = evaluateProfit({
      sellPrice,
      sourcePrice: p.sourcePrice,
      shippingCost: p.shippingCost,
      rules
    });

    return {
      sku: p.sku,
      sourcePrice: p.sourcePrice,
      sellPrice,
      suggestedSellPrice,
      grossProfit: evalRes.grossProfit,
      grossMarginPct: evalRes.grossMarginPct,
      netMarginPct: evalRes.netMarginPct,
      pass: evalRes.pass,
      next: evalRes.pass ? 'listing_queue' : 'reject'
    };
  });

  return { summary };
};
