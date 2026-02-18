import { readFile } from 'node:fs/promises';

const load = async (u) => JSON.parse(await readFile(u, 'utf8'));

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const main = async () => {
  const rules = await load(new URL('../rules.json', import.meta.url));

  assert(rules.market.country === 'US', 'market.country must be US for this profile');
  assert(rules.profitRules.minGrossProfitUsd > 0, 'minGrossProfitUsd must be > 0');
  assert(rules.profitRules.minGrossMarginPct >= 10, 'minGrossMarginPct should be >= 10');
  assert(rules.profitRules.minNetMarginPct >= 5, 'minNetMarginPct should be >= 5');
  assert(rules.autoApproval.orderValueUsdMax > 0, 'orderValueUsdMax must be > 0');
  assert(rules.inventoryAndPricing.pollIntervalMinutes <= 60, 'poll interval too long (>60)');
  assert(rules.inventoryAndPricing.repriceOnSourceDeltaPct <= rules.inventoryAndPricing.immediateRepriceDeltaPct, 'reprice threshold must be <= immediate threshold');

  console.log('Config validation OK');
};

main().catch((e) => {
  console.error('Config validation failed:', e.message);
  process.exit(1);
});
