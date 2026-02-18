const calcRiskScore = (o, rules) => {
  const w = rules.riskScoring.weights;
  let score = 0;
  if (o.orderValue >= rules.autoApproval.alwaysManualIf.orderValueUsdGte) score += w.orderValue;
  if (o.addressMismatch) score += w.addressQuality;
  if (o.freightForwarderSuspected) score += w.regionRisk;
  if (o.highRiskSignal) score += w.velocity;
  if (o.newSupplierFirstOrder) score += w.itemRisk;
  if (o.buyerHistoryBad) score += w.buyerHistory;
  return Math.min(100, score);
};

export const runOrderTriage = ({ orders, rules, currentAutoApprovedToday = 0 }) => {
  const maxAutoValue = rules.autoApproval.orderValueUsdMax;
  const dailyMax = rules.autoApproval.autoApprovedOrdersPerDayMax;
  const threshold = rules.riskScoring.manualReviewThreshold;

  let autoApproved = currentAutoApprovedToday;

  const decisions = orders.map((o) => {
    const computedRisk = calcRiskScore(o, rules);
    const blocked = (
      o.addressMismatch ||
      o.freightForwarderSuspected ||
      o.highRiskSignal ||
      o.newSupplierFirstOrder ||
      computedRisk >= threshold
    );

    const manualByPolicy = blocked || o.orderValue >= (rules.autoApproval.alwaysManualIf.orderValueUsdGte);
    const dailyCapReached = autoApproved >= dailyMax;

    const decision = (manualByPolicy || dailyCapReached || o.orderValue > maxAutoValue)
      ? 'manual_review'
      : 'auto_approve';

    if (decision === 'auto_approve') autoApproved += 1;

    return {
      orderId: o.orderId,
      orderValue: o.orderValue,
      riskScore: computedRisk,
      decision,
      reason: manualByPolicy
        ? 'policy/risk trigger'
        : dailyCapReached
          ? 'daily auto-approve cap reached'
          : 'within auto-approval bounds'
    };
  });

  return { decisions, autoApprovedToday: autoApproved };
};
