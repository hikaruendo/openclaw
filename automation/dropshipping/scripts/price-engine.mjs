export const calcTargetPrice = ({ sourcePrice, shippingCost = 0, rules }) => {
  const r = rules.profitRules;
  const feePct = (r.estimatedCostRates.ebayFeePct + r.estimatedCostRates.paymentFeePct + r.estimatedCostRates.returnReservePct + r.estimatedCostRates.fxSlippagePct + r.estimatedCostRates.miscReservePct) / 100;

  // price needs to satisfy:
  // 1) gross profit >= minGrossProfitUsd
  // 2) gross margin >= minGrossMarginPct
  // 3) net margin >= minNetMarginPct after reserves/fees
  const costBase = sourcePrice + shippingCost;

  const byGrossProfit = costBase + r.minGrossProfitUsd;
  const byGrossMargin = costBase / (1 - r.minGrossMarginPct / 100);
  const byNetMargin = costBase / (1 - feePct - r.minNetMarginPct / 100);

  const target = Math.max(byGrossProfit, byGrossMargin, byNetMargin);
  return Math.round(target * 100) / 100;
};

export const evaluateProfit = ({ sellPrice, sourcePrice, shippingCost = 0, rules }) => {
  const r = rules.profitRules;
  const costBase = sourcePrice + shippingCost;
  const grossProfit = sellPrice - costBase;
  const grossMarginPct = (grossProfit / sellPrice) * 100;

  const feePct = (r.estimatedCostRates.ebayFeePct + r.estimatedCostRates.paymentFeePct + r.estimatedCostRates.returnReservePct + r.estimatedCostRates.fxSlippagePct + r.estimatedCostRates.miscReservePct) / 100;
  const netProfit = sellPrice * (1 - feePct) - costBase;
  const netMarginPct = (netProfit / sellPrice) * 100;

  const pass = grossProfit >= r.minGrossProfitUsd && grossMarginPct >= r.minGrossMarginPct && netMarginPct >= r.minNetMarginPct;
  return {
    grossProfit: +grossProfit.toFixed(2),
    grossMarginPct: +grossMarginPct.toFixed(2),
    netProfit: +netProfit.toFixed(2),
    netMarginPct: +netMarginPct.toFixed(2),
    pass
  };
};
