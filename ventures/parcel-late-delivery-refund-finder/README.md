# Parcel Late-Delivery Refund Finder

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/parcel-late-delivery-refund-finder/>

A free browser tool for shippers: **drop in your UPS or FedEx shipment report and see the parcels
delivered after the promised day**, the shipping charge on each, the last day to file, and any
duplicate charges, then copy a draft claim request for the carrier. The file is read in the
browser. Nothing is uploaded, and no carrier login is needed.

After using this, you can now **list the late deliveries on guaranteed services with the charge and
claim deadline for each**, which used to mean checking tracking pages one parcel at a time or paying
a refund-recovery service a share of what it finds.

## Input

CSV (comma, semicolon, tab or pipe) with a header row. Needs a **ship date** and a **delivery date**
column, and a tracking number or service column. Charge, invoice date, status or exception note,
and a scheduled-delivery date or transit-days column are used when present. Column names are matched
by alias and are **unverified against real carrier exports**; skipped rows are listed with the reason.

## Rules

Promised day = ship date plus the service's business days (next-day 1, 2nd Day / 2Day 2, 3 Day
Select / Express Saver 3); a promised-date or transit-days column overrides. Ground is judged only
with the ground-days setting or one of those columns; economy and postal services are never judged.
Late = delivered on a business day after the promised day, on a calendar that skips weekends and six
holidays by default (an unverified pattern; switchable, plus extra closure dates). Not counted:
weather, recipient, address or customer-hold notes, shipments with a credit line already, late
shipments past the claim window (invoice date plus a setting, 15 by default). Also flags exact
duplicate charges and charges far above the median for a service. The amount is the transportation
charge column only and is the most that could be affected, not a refund estimate.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace your carrier's terms,
your account representative or a qualified professional. **You are responsible for reviewing and
verifying its output before relying on it**, and before filing a claim. A flagged shipment is a
question, not a finding that a refund is owed. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

Independent: not affiliated with, endorsed by, or sponsored by UPS, FedEx, DHL, the United States
Postal Service or any carrier.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`csv_analyzed`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do
Not Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken,
moved, or taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
