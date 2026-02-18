export const sendDiscordApprovalQueue = async ({ queue, webhookUrl, mode = 'mock' }) => {
  if (!webhookUrl) {
    return { ok: false, skipped: true, reason: 'DISCORD_WEBHOOK_URL not set' };
  }

  const top = queue.items.slice(0, 10);
  const lines = top.map((i, idx) => `${idx + 1}. **${i.orderId}** | $${i.orderValue} | risk:${i.riskScore} | ${i.reason}`);

  const content = [
    `🚨 **Approval Queue Alert** (${mode})`,
    `manual_review_count: **${queue.count}**`,
    lines.length ? '\n' + lines.join('\n') : '\nNo manual-review items.',
    queue.count > top.length ? `\n...and ${queue.count - top.length} more` : ''
  ].join('\n');

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Discord webhook failed (${res.status}): ${txt}`);
  }

  return { ok: true, sent: top.length, total: queue.count };
};
