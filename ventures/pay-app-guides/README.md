# Pay app guides

Free front door for paid bet #1, pay-app billing for specialty subcontractors
(`portfolio/monetization/bets.md` on the bets branch). Search intent such as
"how to fill out a pay application", "retainage", "schedule of values" and
"lien waiver" lands here; every page ends with an honest CTA to the hosted
product, which is **in development, with early access**, at
https://marisstella.app/industries/construction/ (PR #18693 builds that page; the link is absolute so it is not a dead internal link before that lands).

Live: <https://marisstella.app/pay-app-guides/>

## Pages

| Page | What it is |
|---|---|
| `index.html` | Schedule of values / continuation sheet calculator: work completed, stored materials, retainage held and released, balance to finish, current payment due, over-billed lines flagged; copy summary, CSV, print. Runs in the browser. |
| `how-to-fill-out-a-pay-application.html` | The continuation sheet column by column and the summary page line by line, one worked example, what to attach. |
| `retainage-explained.html` | How retainage is calculated, reduced, released and flowed down, and a table of public retainage caps for 16 states, each linked to the official statute. |
| `conditional-vs-unconditional-lien-waivers.html` | The four waiver types, when to sign each, exceptions to write in, California and Florida statutory forms. |
| `schedule-of-values-template.html` | Free Excel schedule of values / continuation sheet template and a filled-in example (`schedule-of-values-template.xlsx`, `schedule-of-values-example.xlsx`), built by `template.mjs` with no library; `template.test.mjs` checks the committed files match the code and, where LibreOffice is installed, recalculates the example against the guide's numbers. Rebuild with `node template.mjs`. |
| `retainage-in-quickbooks.html` | QuickBooks Online has no retainage field: the Retainage Receivable account and item, negative holdback line, release invoice, how to see retainage the A/R aging report leaves out, the cash-basis caveat, Desktop notes, and an invoice-line calculator (`quickbooksLines` in `calc.mjs`). Sources are Intuit help and community pages, read 2026-11-25 through search results (the session could not load quickbooks.intuit.com directly). |
| `lien-waiver-forms-by-state.html` | Statutory lien waiver forms by state: AZ, NV, TX, UT, FL, MI, WY read on the official legislature sites on 2026-11-25 (CA linked, not re-read), number of forms, how strict, what each requires. Every quoted phrase was checked against the fetched statute text; `page.test.mjs` checks each row links an official site. |
| `change-orders-schedule-of-values.html` | How approved and deductive change orders enter the SOV and the summary, with a worked example. |
| `prompt-payment-laws.html` | Prompt payment deadlines (days after the GC is paid) and late-payment interest for TX, CA, IL, NC, PA, VA (public) and FL, each linked to the legislature's text, read 2026-11-25 through search results limited to the official sites; a rate is shown only where that text confirmed it (CA, PA and FL say "not confirmed"). Late-payment interest calculator: `promptPayInterest` and `PROMPT_PAY` in `calc.mjs`, tested in `prompt-pay.test.mjs`. |
| `change-order-log.html` | Change order log (`colog.mjs`): paste or open a log; approved, pending, rejected and void totals, revised contract sum, pending aging against a flag, billing on unsigned or rejected changes and over-billing flagged, approved COs written as SOV lines the pay application generator reads (`colog.test.mjs` round-trips them through its `compute()`), log CSV, and exceptions wording for a progress lien waiver. Optional remember-in-this-browser. |
| `pay-application-software-compared.html` | Buyer-intent comparison: spreadsheet, QuickBooks Online, Knowify, PayAppHub, Trimble Pay, Siteline with published prices (read 2026-11-25 through search results; aggregator prices marked as such), and what GC portals charge the sub (Textura, Procore Pay, Trimble Pay, from the vendors' help sites), with a portal fee calculator (`portals.mjs`, tested in `portals.test.mjs` against Oracle's own $50,000 → $110 example). |
| `pay-if-paid-clauses.html` | Pay-if-paid vs pay-when-paid: a clause reader (`clause.mjs`, tested in `clause.test.mjs`) that says which kind a pasted subcontract payment clause is, quoting the words that decided it, and a table of how 11 states treat a pay-if-paid clause (NC, SC, WI, NV, MO, MD, IL statutes from the legislature sites; CA, NY, FL and a federal Ohio-law decision from the opinions on Justia), read 2026-11-25 through search results limited to those sites. Unread states are left out. |
| `retainage-release.html` | Getting retainage released: the closeout documents usually asked for, where the release date comes from (subcontract or statute; statute rules are linked to `retainage-explained.html`, not restated), and a release date calculator that writes a request letter listing unticked closeout items (`retainageRelease`, `CLOSEOUT_ITEMS` in `calc.mjs`, tested in `release.test.mjs`). |
| `pay-application-checker.html` | Why pay apps get sent back, and a checker (`check.mjs`, tested in `check.test.mjs`): paste last month's approved schedule of values and this month's draft (CSV or tab-separated; the calculator's own CSV export reads as it is). Lines are matched by item number; it flags a "from previous" figure that is not last month's previous plus this period, a changed scheduled value, a missing line, a new line not numbered as a change order, stored materials that fell by more than was billed as installed, a retainage rate change, and previous certificates that are not last month's earned less retainage. Copyable list. |
| `lien-waiver-log.html` | Lien waiver log (`waivers.mjs`): paste waivers given (to the GC or owner) and received (from suppliers and lower-tier subs); each conditional matched to its unconditional by party, stage and through date; unconditional waivers given with no cleared payment, signed before it cleared, or for more than was paid flagged; paid lower tiers with no unconditional held listed (flagged after a chase window); repeats, missing through dates and progress-after-final noted; the next pay app's waivers to request written as plain requests; log CSV with formula cells neutralised. Tested in `waivers.test.mjs`. It checks the log against itself and makes no state-law claim. |
| `overbilling-underbilling.html` | Overbilling and underbilling: the pay application's billed to date (gross of retainage) against cost-to-cost percent complete for one job; earned revenue, over/under, gross profit to date, certified less retainage against cost, the adjusting entry, and what to bill next period to finish even (`overUnder` in `billing.mjs`, tested in `billing.test.mjs`). Links the multi-job `contractor-wip-schedule` tool. |
| `retainage-tracker.html` | Retainage receivable across jobs (`retlog.mjs`, tested in `retlog.test.mjs` against hand sums): paste or open one row per job (held, released, completion date, release days, release billed); outstanding retainage, due date = completion + the user's own release days (a default fills blanks; none means no due date, never a guessed one), aging buckets, days overdue and an optional carrying cost at the user's rate, completed jobs with no release billed, totals by GC with a concentration flag, a chase list ordered by money x days late, CSV with formula-safe cells. Optional remember-in-this-browser. |

## Spec sources

- Arithmetic: the continuation-sheet layout pay-app guides describe in
  general terms (scheduled value; previous; this period; stored; total
  completed and stored; percent; balance to finish; retainage), checked
  against a hand calculation in `calc.test.mjs`. The professional who would
  sign it off is a construction accountant or the GC's project accountant.
  The AIA G702/G703 forms are copyrighted and are **not** reproduced; the
  pages say they are not affiliated with the AIA.
- Statutes: each state row in `retainage-explained.html` and each statute in
  the lien-waiver guide links the state legislature's own published text.
  Read on 2026-11-24. Direct page loads from this cloud session were
  blocked by its network policy, so the text was read through web-search
  results limited to the official legislature domains. Where those results
  disagreed or showed a pending change (North Carolina's threshold, Florida's
  older 10% rule), the page says so. Ohio, Georgia and New Jersey were left
  out because their current text could not be confirmed. On 2026-11-25 the
  statute pages loaded directly: nine of the twelve rows matched as written
  (California, Pennsylvania and Illinois still refuse automated loads), and
  Minnesota, Nevada, Oregon and Utah were added from the statute pages
  themselves. **Re-check a row
  against the linked statute before changing it.**

## Run and test

Open `index.html` through any static server. Tests:
`python3 platform/ci/run_venture_tests.py pay-app-guides` (or
`node --test *.test.mjs` in this directory).

## No warranty

This tool is provided free and as-is, without warranty of any kind, express
or implied. It is not legal, tax, accounting, or financial advice, and it
does not replace your contract, your accountant, or an attorney. **You are
responsible for reviewing and verifying its output before relying on it.**
To the maximum extent permitted by law, the authors accept no liability for
any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. Do not use this as a
system of record.

Not affiliated with the American Institute of Architects. AIA, G702 and G703
are marks of their owner.

## Privacy

Everything runs in the browser. Nothing typed is uploaded; no accounts,
cookies or analytics vendors. Anonymous feature counters (`sov_calculated`,
`example_loaded`, `summary_copied`, `csv_downloaded`, one
`guide_*_viewed` per guide, `colog_*` on the change order log, `overbilling_summary_copied`, `pay_app_checked` / `pay_app_check_copied` on the checker, and `waivers_*` on the lien waiver log) are kept in the visitor's own local storage,
switched off by Do Not Track or the opt-out button.

## Licence

FSL-1.1-MIT, see `LICENSE`.
