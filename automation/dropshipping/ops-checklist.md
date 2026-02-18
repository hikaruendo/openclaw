# Daily Ops Checklist (US / NY eBay Export)

## Morning (NY 08:00-09:00)
- [ ] Sync supplier stock + prices
- [ ] Disable out-of-stock listings
- [ ] Reprice SKUs with source delta >= 3%
- [ ] Review approval queue (high value / risk)
- [ ] Confirm tracking uploads from previous day

## Midday (NY 12:00-13:00)
- [ ] Re-run stock sync
- [ ] Check customer messages (refund/return/manual only)
- [ ] Validate top 20 revenue SKUs margin health

## Evening (NY 18:00-19:00)
- [ ] Final stock sync + out-of-stock guard
- [ ] Process remaining approval queue
- [ ] Check late shipment risk list
- [ ] Export daily KPI snapshot

## Always-On Automated Jobs
- [ ] Stock/price poll every 30 minutes
- [ ] Auto pause on stock=0
- [ ] Auto reprice on source movement thresholds
- [ ] Auto reply only for FAQ shipping/tracking ETA

## Weekly Review (Every Monday)
- [ ] Cancel rate (target < 2%)
- [ ] Late shipment rate (target < 2%)
- [ ] Tracking delay rate (target < 1%)
- [ ] Return rate (target < 4%)
- [ ] Decide whether to relax thresholds per rules.json
