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
| `retainage-explained.html` | How retainage is calculated, reduced, released and flowed down, and a table of public retainage caps for 12 states, each linked to the official statute. |
| `conditional-vs-unconditional-lien-waivers.html` | The four waiver types, when to sign each, exceptions to write in, California and Florida statutory forms. |
| `change-orders-schedule-of-values.html` | How approved and deductive change orders enter the SOV and the summary, with a worked example. |

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
  out because their current text could not be confirmed. **Re-check a row
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
`example_loaded`, `summary_copied`, `csv_downloaded`, and one
`guide_*_viewed` per guide) are kept in the visitor's own local storage,
switched off by Do Not Track or the opt-out button.

## Licence

MIT, see `LICENSE`.
