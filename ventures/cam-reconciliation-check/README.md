# CAM Reconciliation Check

The free CAM reconciliation calculator helps a small commercial landlord or tenant check common-area-maintenance math before discussing a year-end statement. Enter annual operating expenses, rentable area, the tenant's area, billed charges, and credits to see the area-share calculation and a transparent variance.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/cam-reconciliation-check/

Open `index.html` in a browser. It runs without an account, network request, API key, or paid dependency. After a check you can download a private text worksheet or a JSON review record with the same arithmetic and checklist. The JSON never includes a tenant name, address, or lease identifier. It does not interpret a lease, determine recoverability, or create a payment obligation. Verify every input against the lease, statement, and supporting records.

An optional "Occupancy gross-up" section models the clause most net leases carry: the occupancy-sensitive share of CAM (utilities, janitorial) can be grossed up to what it would have cost at a stated target occupancy — usually 95% — when the building actually ran below that. It is opt-in: leave it blank and the reconciliation is exactly what it has always been. Enter the variable expense share and the actual and target occupancy percentages to see the dollar adjustment added to the expense pool before the area share is applied.

## Privacy and usage

Everything runs in your browser. Your figures are never uploaded. There are no accounts, cookies, tracking pixels, or analytics vendor. Unless you opt out, the page stores only aggregate event counters by feature name in local storage. It never stores people, IPs, user agents, or the expense content. Disable **Count anonymous local usage events** at any time; the page also respects Do Not Track and Global Privacy Control.

## Opportunity and differentiation

Property managers and small-business tenants search for terms such as “CAM reconciliation calculator,” “common area maintenance audit,” and “triple net expense reconciliation.” General spreadsheets often hide the area-share formula and do not distinguish modeled share from net billed charges. This tool makes each assumption visible, produces a review checklist, and keeps sensitive lease and expense data on the user's device. A future optional bring-your-own-key assistant could classify uploaded statement line items locally or explain categories, but the deterministic math is the complete free core.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, financial, or real-estate advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken offline without notice. We do not promise uptime, backups of anything you type, or that a URL will keep working. Do not use this as a system of record.

Optional support: [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood). Refusing to sponsor does not change the calculator.

## Test

```sh
node --test
```
