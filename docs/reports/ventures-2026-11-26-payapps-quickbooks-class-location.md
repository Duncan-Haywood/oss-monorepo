---
kind: milestone
date: 2026-11-26
---
# PayApps: QuickBooks class and location per job (private PR 274)

Date: 2026-11-26. ROADMAP item "QuickBooks, part 7" in `private-monorepo/apps/payapps`.

## What landed

- `packages/qbo-sync` (private): `getTrackingPrefs()` (GET `company/{realmId}/preferences`,
  `AccountingInfoPrefs.ClassTrackingPerTxn`/`ClassTrackingPerTxnLine`/`TrackDepartments`/
  `DepartmentTerminology`), `listClasses`/`getClass`, `listLocations`/`getLocation` (the
  `Department` entity), plus `classId` on invoice lines and `classId`/`locationId` on invoice and
  credit-memo inputs. Both the adapter and the fake have them.
- payapps: `GET/PUT /api/orgs/:orgId/quickbooks/tracking[/:projectId]`, a "Class and location per
  job" panel on the QuickBooks page, and the preview naming them. Sends (invoice and short-pay
  credit memo) read the preferences again. An inactive choice gives a 409, and a kind no longer
  tracked is left off. Migration 0052 (0050 and 0051 were each taken by other runs while this one was in progress).

## What the next run should know

- **Sources.** Intuit's developer site renders in the browser and gives nothing to curl, but
  `raw.githubusercontent.com/intuit/QuickBooks-V3-PHP-SDK/master/src/XSD/Finance.xsd` downloads
  fine, and every field name came from there. The schema marks `SalesTransaction.ClassRef`
  (transaction-level) "Product: QBW" and the line-level `ItemLineDetail.ClassRef` "Product: ALL".
  PayApps sends the transaction-level one only to companies with `ClassTrackingPerTxn` on. Confirm
  it in a sandbox company once the owner has an Intuit developer app.
- **Migration numbers collide often.** Two other runs (0050, then 0051) landed while this one was in progress.
  Regenerate with `pnpm exec drizzle-kit generate --name <x>` after moving onto the new main, and
  don't renumber with a blanket sed: it also rewrites other features' "(migration N)" comments.
- Next steps (ROADMAP "QuickBooks, part 8", only if asked): a class per SOV line, and classes and
  locations on costs read from QuickBooks for job costing.
