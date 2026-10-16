# Medical Bill Error Checker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/medical-bill-error-checker/>

A free browser tool for patients: **drop in your itemized medical bill and see the lines worth
questioning**, then copy a draft request to the billing office. The file is read in the browser.
Nothing is uploaded, and no portal login is needed.

After using this, you can now **see possible duplicate charges, codes normally billed once a day
that appear twice, lab-panel components billed alongside the panel that includes them, two levels
of the same visit on one date, and lines whose math does not add up**, which used to mean reading a
bill line by line against a coding reference.

## Input

CSV (comma, semicolon, tab or pipe) with a header row. Needs a **charge** column and a **code** or
**description** column. Date of service, quantity, insurance paid, adjustment and patient
responsibility are used when present. Column names are matched by alias and are **unverified against
real hospital or clinic exports**; skipped rows are listed with the reason.

## Rules

Duplicate lines (same date, code, modifier, description, quantity, charge); once-a-day codes
(office and ER visit levels, 36415, ECG, common lab panels) billed more than once; panel
components (80053, 80048, 80061, 85025, 93000) billed with the panel, downgraded to information
when a distinct-service modifier is present; two levels of one visit family the same day; charge
less paid less adjustment versus patient responsibility. The "most in question" figure is capped at
the bill total and is not a refund estimate. Not checked: medical necessity, fair pricing, the full
national edit tables, other modifiers, facility versus professional billing, network and
balance-billing rules.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not medical, legal, tax, or financial advice, and it does not replace your provider,
your insurer or a qualified professional. **You are responsible for reviewing and verifying its
output before relying on it**, and before disputing a charge or withholding payment. A flagged line
is a question, not a finding that a bill is wrong. To the maximum extent permitted by law, the
authors accept no liability for any loss or damage arising from its use.

CPT is a registered trademark of the American Medical Association. Independent of any hospital,
clinic, insurer or billing company.

**Privacy.** Nothing is uploaded; a bill contains health information and stays in the browser.
Anonymous feature counts (`csv_analyzed`, `example_loaded`, `report_downloaded`) are kept only in
local storage, can be switched off on the page, and honour Do Not Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken,
moved, or taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
