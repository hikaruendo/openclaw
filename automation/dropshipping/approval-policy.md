# eBay Dropshipping Approval Policy (US / New York Focus)

## 1) Auto-Approve (No Human Action)
Orders can proceed automatically only if **all** are true:

- Order value <= **$120**
- Daily auto-approved order count < **20**
- Buyer has no risk flags
- Address quality passes validation
- No freight-forwarder suspicion
- Item is not policy-risk / VeRO-risk
- Supplier is already trusted (not first order)

## 2) Manual Approval Required
Any one of the below routes to approval queue:

- Order value >= **$121**
- New supplier first order
- Address mismatch or parsing failure
- Fraud/high-risk score above threshold
- Same buyer places multiple orders quickly
- Refund / partial refund / cancellation requested
- Negative feedback related case
- Tracking unavailable or delayed beyond SLA

## 3) Hard Stop (Do Not Process)

- Item flagged as prohibited or VeRO-sensitive
- Source item out-of-stock and no valid substitute
- Shipping cannot provide tracking
- Profit rule fails after latest source price sync

## 4) SLA Rules

- Order triage: within **15 min**
- Approval queue first response: within **60 min**
- Tracking upload: same business day, target < **6 hours** from supplier shipment

## 5) Escalation

- 3+ manual flags on same buyer in 14 days -> blacklist review
- Late shipment trend > 2% weekly -> tighten automation and raise handling buffer
- Cancel rate > 2% weekly -> force manual approval for all affected SKUs
