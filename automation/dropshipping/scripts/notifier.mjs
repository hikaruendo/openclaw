import { appendFile, mkdir } from 'node:fs/promises';

export const notifyManualQueue = async ({ queue, outFileUrl }) => {
  const lines = [];
  lines.push(`[${new Date().toISOString()}] manual_review_count=${queue.count}`);
  for (const item of queue.items.slice(0, 20)) {
    lines.push(`- ${item.orderId} value=$${item.orderValue} risk=${item.riskScore} reason=${item.reason}`);
  }
  lines.push('');

  await mkdir(new URL('../state/', outFileUrl), { recursive: true });
  await appendFile(outFileUrl, lines.join('\n'));

  return { sent: queue.count, channel: 'local-log' };
};
