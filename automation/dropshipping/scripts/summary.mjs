import { readFile, mkdir, writeFile } from 'node:fs/promises';

const loadJson = async (u, fallback) => {
  try { return JSON.parse(await readFile(u, 'utf8')); } catch { return fallback; }
};

const main = async () => {
  const q = await loadJson(new URL('../state/approval-queue.json', import.meta.url), { count: 0, items: [] });
  const last = await loadJson(new URL('../state/last-run.json', import.meta.url), { metrics: {} });
  const runState = await loadJson(new URL('../state/run-state.json', import.meta.url), { autoApprovedToday: 0 });

  const report = {
    createdAt: new Date().toISOString(),
    manualQueueCount: q.count,
    autoApprovedToday: runState.autoApprovedToday || 0,
    latestMetrics: last.metrics || {},
    note: 'Wire DB for multi-day KPI trends (cancel rate, late shipment, returns).'
  };

  await mkdir(new URL('../state/', import.meta.url), { recursive: true });
  await writeFile(new URL('../state/daily-summary.json', import.meta.url), JSON.stringify(report, null, 2));
  console.log(report);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
