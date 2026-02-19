export const sendDiscordApprovalQueue = async ({ queue, webhookUrl, mode = 'mock' }) => {
  if (!webhookUrl) {
    return { ok: false, skipped: true, reason: 'DISCORD_WEBHOOK_URL not set' };
  }

  const top = queue.items.slice(0, 10);
  const lines = top.map((i, idx) => `${idx + 1}. **${i.orderId}** | $${i.orderValue} | risk:${i.riskScore} | ${i.reason}`);

  const mention = process.env.DISCORD_ALERT_MENTION || '<@1472054632015728641>';
  const highRisk = top.some((i) => Number(i.riskScore || 0) >= Number(process.env.DISCORD_HIGH_RISK_THRESHOLD || 30));
  const isLive = mode === 'live';
  const shouldMention = (isLive && queue.count > 0) || highRisk;

  const muteMock = String(process.env.DISCORD_MUTE_MOCK_ALERTS || '1') === '1';
  if (mode === 'mock' && muteMock) {
    return { ok: true, skipped: true, reason: 'mock alerts muted' };
  }

  const content = [
    shouldMention ? `${mention}` : '',
    `🚨 **Approval Queue Alert** (${mode})`,
    `manual_review_count: **${queue.count}**`,
    lines.length ? '\n' + lines.join('\n') : '\nNo manual-review items.',
    queue.count > top.length ? `\n...and ${queue.count - top.length} more` : ''
  ].filter(Boolean).join('\n');

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Discord webhook failed (${res.status}): ${txt}`);
  }

  return { ok: true, sent: top.length, total: queue.count, mentioned: shouldMention };
};
