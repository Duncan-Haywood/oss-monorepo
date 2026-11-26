---
kind: milestone
date: 2026-11-26
---
# PayApps (bet #1): purchase orders from QuickBooks as commitments

2026-11-26, ventures run. Private PR: Duncan-Haywood/private-monorepo#279. ROADMAP Next #2,
"Job costing, part 3", the purchase-order part; claim
`claim/payapps/job-costing-part-3-qbo-purchase-orders`. Builds on costs from QuickBooks (private
PR 277) and committed costs (271). A parallel run landed labor from a payroll report (PR 278)
during this one; the merge conflicted only in ROADMAP text and one UI paragraph.

**What landed.**
- `packages/qbo-sync/src/costs.ts`: `JobCostReader.listPurchaseOrderLines` (QBO: `select * from
  PurchaseOrder where TxnDate …`, paged like the cost reader), `purchaseOrderLinesOf` (status from
  `POStatus`, `ManuallyClosed`), and `ExpenseLine.purchaseOrder` from a line's `LinkedTxn` of type
  `PurchaseOrder` (`TxnId`, optional `TxnLineId`). The fake cost book has `addPurchaseOrder`,
  `setPurchaseOrderStatus`, and `purchaseOrder` on expense lines. Field names checked against
  Intuit's PHP SDK `IPPPurchaseOrder`, `IPPPurchaseByVendor`, `IPPLine` and `IPPLinkedTxn`
  (raw.githubusercontent.com answered from the cloud session).
- payapps: migration 0053 adds (PR 274 took 0052 while this run was open) `job_cost_commitments.qbo_source` (unique per org) and
  `job_cost_entries.qbo_po_source`. `GET/POST .../job-cost/quickbooks/purchase-orders[/import]`
  take the same window and import body as the cost import. `putCostsOnPurchaseOrders` attaches
  costs on no commitment to the matching imported order line (`commitmentForPo` in
  `src/shared/job-cost-qbo.ts`: an exact line key, or the order's only line when QBO names just the
  order), limited to the rows just imported, so a manual unlink sticks. The UI panel
  `src/client/components/job-cost-qbo-po.tsx` sits inside "Costs from QuickBooks".
- Privacy policy 2026-11-26.12 names purchase orders and the stored source keys.

**What the next run should know.**
- Still unverified in a sandbox: whether a bill made from a PO in the QBO UI carries `LinkedTxn`
  on the line (assumed) and fills `TxnLineId`. If it is only on the transaction, read
  `txn.LinkedTxn` as a fallback in `purchaseOrderLinesOf`'s sibling `purchaseOrderOf`.
- Closing a PO in QBO after import does not change the commitment (documented). A later slice
  could offer "close in PayApps too" when the list shows an imported order as Closed.
- Left in part 3: payroll journal entries read from QBO, and picking lines by `ClassRef`.
- payapps-site copy was not updated for this slice.
