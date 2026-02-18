import { readFile } from 'node:fs/promises';
import { runResearch } from './research.mjs';
import { runReprice } from './reprice.mjs';
import { runOrderTriage } from './order-triage.mjs';

const load = async (u) => JSON.parse(await readFile(u, 'utf8'));

const main = async () => {
  const rules = await load(new URL('../rules.json', import.meta.url));
  const products = await load(new URL('../data/products.sample.json', import.meta.url));
  const listings = await load(new URL('../data/listings.sample.json', import.meta.url));
  const orders = await load(new URL('../data/orders.sample.json', import.meta.url));

  let auto = 0;
  let manual = 0;
  let accepted = 0;

  for (let day = 1; day <= 14; day++) {
    const r = runResearch({ products, rules });
    const p = runReprice({ listings, rules });
    const t = runOrderTriage({ orders, rules });

    accepted += r.summary.filter((x) => x.pass).length;
    auto += t.decisions.filter((x) => x.decision === 'auto_approve').length;
    manual += t.decisions.filter((x) => x.decision === 'manual_review').length;

    // simple drift simulation
    for (const l of listings) {
      l.sourcePriceNow = +(l.sourcePriceNow * (1 + (Math.random() - 0.5) * 0.04)).toFixed(2);
      l.sourceStock = Math.max(0, l.sourceStock + Math.round((Math.random() - 0.45) * 2));
      l.sourcePricePrev = l.sourcePriceNow;
    }
    for (const o of orders) {
      o.orderValue = +(o.orderValue * (1 + (Math.random() - 0.5) * 0.15)).toFixed(2);
    }

    console.log(`day ${day}: accepted=${r.summary.filter((x) => x.pass).length}, reprice_actions=${p.actions.filter((x)=>x.action!=='none').length}, auto=${t.decisions.filter((x)=>x.decision==='auto_approve').length}`);
  }

  console.log('\nBacktest summary (14d):');
  console.log({ accepted, auto, manual });
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
