# Dropshipping Automation (US/NY)

This folder contains a safe MVP pipeline for eBay export dropshipping automation.

## Current mode
- Adapter mode defaults to `mock`
- Switch with: `ADAPTER_MODE=live`
- In `mock` mode, no live eBay/supplier API calls are made

## Files
- `rules.json`: business rules
- `approval-policy.md`: manual approval conditions
- `ops-checklist.md`: daily operations
- `run-pipeline.mjs`: orchestrator
- `scripts/research.mjs`: candidate scoring
- `scripts/reprice.mjs`: inventory/price checks
- `scripts/order-triage.mjs`: auto-approve vs manual queue
- `scripts/price-engine.mjs`: target price & margin evaluator
- `scripts/approval-queue.mjs`: writes manual-review queue JSON
- `scripts/summary.mjs`: daily summary generator
- `scripts/validate-config.mjs`: rules sanity checks
- `scripts/backtest.mjs`: 14-day simulation backtest
- `scripts/notifier.mjs`: local notification log writer
- `data/*.sample.json`: sample input data

## Run
```bash
node automation/dropshipping/scripts/validate-config.mjs
node automation/dropshipping/run-pipeline.mjs
node automation/dropshipping/scripts/summary.mjs
```

## Backtest (approval wait period)
```bash
node automation/dropshipping/scripts/backtest.mjs
```

## Discord approval queue notifications
1) Create Discord webhook (Server Settings -> Integrations -> Webhooks -> New Webhook)
2) Set env var:
```bash
export DISCORD_WEBHOOK_URL='https://discord.com/api/webhooks/...'
```
3) Run pipeline; manual queue alerts will post automatically.

## Run (live adapter)
```bash
ADAPTER_MODE=live node automation/dropshipping/run-pipeline.mjs
```
Requirements:
- eBay OAuth token created with script above
- env vars for `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET`
- Supplier live adapter still TODO

## OAuth bootstrap (eBay)
1) Copy `.env.example` values to your shell env
2) Generate consent URL:
```bash
node automation/dropshipping/scripts/ebay-oauth.mjs print-auth-url
```
3) Open URL, approve, copy `code` from redirect URL
4) Exchange code:
```bash
node automation/dropshipping/scripts/ebay-oauth.mjs exchange-code --code="<CODE>"
```
5) Token is saved to `automation/dropshipping/.secrets/ebay-token.json`

## While waiting for eBay approval
You can proceed with:
1) Full simulation runs (`ADAPTER_MODE=mock`)
2) Profit rule tuning in `rules.json`
3) Approval queue design (`state/approval-queue.json`)
4) Cron dry-runs (`scripts/scheduler-suggest.txt`)

## Next step for production
You must connect:
1) eBay API (Inventory, Orders; tracking/message TODO points already marked)
2) Supplier API/scraper with stock+price+tracking
3) Persistent DB (Postgres recommended)
4) Notification channel for manual approvals
