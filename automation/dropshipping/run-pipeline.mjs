import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { loadEnv } from './scripts/load-env.mjs';
import { runResearch } from './scripts/research.mjs';
import { runReprice } from './scripts/reprice.mjs';
import { runOrderTriage } from './scripts/order-triage.mjs';
import { writeApprovalQueue } from './scripts/approval-queue.mjs';
import { notifyManualQueue } from './scripts/notifier.mjs';
import { sendDiscordApprovalQueue } from './scripts/discord-notifier.mjs';
import { createEbayAdapter } from './adapters/ebay/index.mjs';
import { createSupplierAdapter } from './adapters/supplier/index.mjs';
import { calcTargetPrice } from './scripts/price-engine.mjs';

const loadJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const loadJsonSafe = async (path, fallback) => {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return fallback; }
};

const main = async () => {
  await loadEnv();
  const mode = process.env.ADAPTER_MODE || 'mock'; // mock | live
  const rules = await loadJson(new URL('./rules.json', import.meta.url));

  const ebay = createEbayAdapter({ mode, baseDirUrl: import.meta.url });
  const supplier = createSupplierAdapter({ mode, baseDirUrl: import.meta.url });

  const products = await supplier.fetchCatalogCandidates();
  const listings = await ebay.fetchActiveListings();
  const orders = await ebay.fetchOpenOrders();

  const runStatePath = new URL('./state/run-state.json', import.meta.url);
  const runState = await loadJsonSafe(runStatePath, { autoApprovedToday: 0, day: new Date().toISOString().slice(0, 10) });
  const today = new Date().toISOString().slice(0, 10);
  const autoApprovedToday = runState.day === today ? runState.autoApprovedToday : 0;

  const research = runResearch({ products, rules });
  const repriced = runReprice({ listings, rules });
  const triage = runOrderTriage({ orders, rules, currentAutoApprovedToday: autoApprovedToday });

  const applyActions = [];
  for (const action of repriced.actions) {
    if (action.action === 'set_out_of_stock') {
      applyActions.push(await ebay.setListingOutOfStock(action.sku));
    } else if (action.action === 'reprice' || action.action === 'reprice_now') {
      const listing = listings.find((l) => l.sku === action.sku);
      const newPrice = calcTargetPrice({
        sourcePrice: Number(listing?.sourcePriceNow || listing?.currentPrice || 0),
        shippingCost: Number(listing?.shippingCost || 0),
        rules
      });
      applyActions.push(await ebay.updateListingPrice(action.sku, newPrice));
    }
  }

  const approvalQueue = await writeApprovalQueue({
    triage,
    outFileUrl: new URL('./state/approval-queue.json', import.meta.url)
  });
  const notifyResult = await notifyManualQueue({
    queue: approvalQueue,
    outFileUrl: new URL('./state/notifications.log', import.meta.url)
  });

  let discordResult;
  try {
    discordResult = await sendDiscordApprovalQueue({
      queue: approvalQueue,
      webhookUrl: process.env.DISCORD_WEBHOOK_URL,
      mode
    });
  } catch (e) {
    discordResult = { ok: false, error: e.message };
  }

  console.log(`\nAdapter mode: ${mode}`);
  console.log('\n=== RESEARCH ===');
  console.table(research.summary);
  console.log('\n=== REPRICE ===');
  console.table(repriced.actions);
  console.log('\n=== ORDER TRIAGE ===');
  console.table(triage.decisions);
  await mkdir(new URL('./state/', import.meta.url), { recursive: true });
  await writeFile(runStatePath, JSON.stringify({
    day: today,
    autoApprovedToday: triage.autoApprovedToday
  }, null, 2));

  const runReport = {
    createdAt: new Date().toISOString(),
    mode,
    metrics: {
      researchAccepted: research.summary.filter((x) => x.pass).length,
      repriceActions: repriced.actions.filter((x) => x.action !== 'none').length,
      autoApproved: triage.decisions.filter((x) => x.decision === 'auto_approve').length,
      manualReview: approvalQueue.count
    }
  };
  await writeFile(new URL('./state/last-run.json', import.meta.url), JSON.stringify(runReport, null, 2));

  console.log('\n=== APPLY ACTIONS ===');
  console.table(applyActions);
  console.log('\n=== APPROVAL QUEUE ===');
  console.log(`manual_review_count: ${approvalQueue.count}`);
  console.log('\n=== NOTIFY ===');
  console.log(notifyResult);
  console.log('\n=== DISCORD ===');
  console.log(discordResult);

  console.log(`\nPipeline finished (${mode} mode).`);
};

main().catch((err) => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
