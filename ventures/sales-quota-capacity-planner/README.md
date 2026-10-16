# Sales Quota Capacity Planner

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/sales-quota-capacity-planner/>

**How many quota-carrying reps must you hire, and by when, to hit next year's bookings target?** Enter the target, per-rep quota, ramp, attainment, attrition, recruiting lead time and your existing reps with their start dates. The planner counts ramped-rep-equivalents month by month, shows expected bookings and the gap to target, finds the fewest hires that close it, and works backwards to the **latest start date and requisition-open date for each hire cohort**. It also shows how the answer moves with attainment and attrition, and prices hiring early against hiring late from your fully loaded cost per rep.

Open `index.html` in a browser. It needs no account, network request, API key or CRM connection. Export the month-by-month plan as CSV, or copy a shareable link (the inputs live in the link itself).

## The model

- 12 months from the plan start. A rep in tenure month *k* produces `min(1, k / rampMonths)` of a fully ramped rep (linear), or nothing until the ramp is over (cliff).
- A fully ramped rep books `quota / 12 x effective attainment` per month. Effective attainment blends the share of reps at or over quota (counted at 100% unless you enter more) with the average attainment of the rest.
- Attrition is an expected-value monthly rate: each cohort keeps `1 - attrition` of its reps every month. Existing reps are exposed from the first plan month; a hire from the month after it starts.
- A requisition opened in the first plan month cannot start earlier than the hiring lead time, which is the earliest start the plan can use. The fewest hires at that start that reach the target is the hire count; each is then delayed as far as the target still holds to give the latest-start schedule.
- Pipeline coverage x win rate gives a ceiling on what the pipeline supports; the page warns when more reps would not help.

It does not model seasonality, territories, product mix or mid-year quota changes. Treat the output as a planning aid and check it against your own forecast.

## Privacy and usage

Everything runs in your browser. Your numbers are never uploaded and there are no accounts, cookies, tracking pixels, or analytics vendor. Unless opted out, the page stores only an aggregate event name and day in local storage (`plan_calculated`, `csv_exported`, `share_link_copied`). It stores no identity, IP address, URL, or planning figures. Do Not Track and Global Privacy Control disable counting. A shared link contains the inputs it was made from.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not financial, business, or employment advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and never changes what the tool does.

## Development

`calc.mjs` is a pure ES module (also holds CSV and URL-state encoding). Run tests with `node --test`.
