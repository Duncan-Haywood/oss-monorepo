# Pay app guides

Free front door for paid bet #1, pay-app billing for specialty subcontractors
(`portfolio/monetization/bets.md` on the bets branch). Search intent such as
"how to fill out a pay application", "retainage", "schedule of values" and
"lien waiver" lands here; every page ends with an honest CTA to the hosted
product, PayApps, which is **open on the Free plan** (one active job; paid
plans not on sale yet) since 2026-11-27 at
<https://payapps.marisstella.app/?signup> (`APP_URL` in `cta.mjs`).

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
| `lien-waiver-forms-by-state.html` | Statutory lien waiver forms by state: AZ, NV, TX, UT, FL, MI, WY read on the official legislature sites on 2026-11-25 (CA from the Legislative Counsel's bulk download); MA read on malegislature.gov and GA, MS from the Acts that wrote their sections, 2026-11-26; MO's residential unconditional final form, number of forms, how strict, what each requires. Every quoted phrase was checked against the fetched statute text; `page.test.mjs` checks each row links an official site. |
| `change-orders-schedule-of-values.html` | How approved and deductive change orders enter the SOV and the summary, with a worked example. |
| `prompt-payment-laws.html` | Prompt payment deadlines (days after the GC is paid) and late-payment interest for TX, CA, IL, NC, PA, VA (public) and FL, each linked to the legislature's text, read 2026-11-25 through search results limited to the official sites; a rate is shown only where that text confirmed it (CA, PA and FL say "not confirmed"). Late-payment interest calculator: `promptPayInterest` and `PROMPT_PAY` in `calc.mjs`, tested in `prompt-pay.test.mjs`. |
| `change-order-log.html` | Change order log (`colog.mjs`): paste or open a log; approved, pending, rejected and void totals, revised contract sum, pending aging against a flag, billing on unsigned or rejected changes and over-billing flagged, approved COs written as SOV lines the pay application generator reads (`colog.test.mjs` round-trips them through its `compute()`), log CSV, and exceptions wording for a progress lien waiver. Optional remember-in-this-browser. |
| `pay-application-software-compared.html` | Buyer-intent comparison: spreadsheet, QuickBooks Online, Knowify, PayAppHub, Trimble Pay, Siteline with published prices (read 2026-11-25 through search results; aggregator prices marked as such), and what GC portals charge the sub (Textura, Procore Pay, Trimble Pay, from the vendors' help sites), with a portal fee calculator (`portals.mjs`, tested in `portals.test.mjs` against Oracle's own $50,000 → $110 example). |
| `coconstruct-alternatives.html` | For CoConstruct users facing the 31 March 2027 cut-off on new projects (CoConstruct's migration page, read 2026-11-27): options by kind of business with an honest PayApps fit column, a checklist for moving a partly billed job, and a countdown (`cocon.mjs`, tested in `cocon.test.mjs`). |
| `pay-if-paid-clauses.html` | Pay-if-paid vs pay-when-paid: a clause reader (`clause.mjs`, tested in `clause.test.mjs`) that says which kind a pasted subcontract payment clause is, quoting the words that decided it, and a table of how 11 states treat a pay-if-paid clause (NC, SC, WI, NV, MO, MD, IL statutes from the legislature sites; CA, NY, FL and a federal Ohio-law decision from the opinions on Justia), read 2026-11-25 through search results limited to those sites. Unread states are left out. |
| `retainage-release.html` | Getting retainage released: the closeout documents usually asked for, where the release date comes from (subcontract or statute; statute rules are linked to `retainage-explained.html`, not restated), and a release date calculator that writes a request letter listing unticked closeout items (`retainageRelease`, `CLOSEOUT_ITEMS` in `calc.mjs`, tested in `release.test.mjs`). |
| `pay-application-checker.html` | Why pay apps get sent back, and a checker (`check.mjs`, tested in `check.test.mjs`): paste last month's approved schedule of values and this month's draft (CSV or tab-separated; the calculator's own CSV export reads as it is). Lines are matched by item number; it flags a "from previous" figure that is not last month's previous plus this period, a changed scheduled value, a missing line, a new line not numbered as a change order, stored materials that fell by more than was billed as installed, a retainage rate change, and previous certificates that are not last month's earned less retainage. Copyable list. |
| `joint-checks.html` | Joint checks: a splitter (`joint.mjs`, tested in `joint.test.mjs`) for a check payable to a sub and its suppliers: each payee's share (agreed, else what is owed on the job, pro rata to the cent when the check is short), the amount a supplier puts at risk by endorsing with no written split (what it was owed up to the check, less its share, per the joint check rule in Post Bros. v. Yoder (1977) 20 Cal.3d 1, read on Stanford SCOCAL 2026-11-25), the waiver each signs, a split letter, and a joint check agreement checklist. The state table is from a 2018 Travelers/Moss/Arent Fox handout hosted by AGC (read 2026-11-25) and says it is a secondary source. |
| `lien-waiver-log.html` | Lien waiver log (`waivers.mjs`): paste waivers given (to the GC or owner) and received (from suppliers and lower-tier subs); each conditional matched to its unconditional by party, stage and through date; unconditional waivers given with no cleared payment, signed before it cleared, or for more than was paid flagged; paid lower tiers with no unconditional held listed (flagged after a chase window); repeats, missing through dates and progress-after-final noted; the next pay app's waivers to request written as plain requests; log CSV with formula cells neutralised. Tested in `waivers.test.mjs`. It checks the log against itself and makes no state-law claim. |
| `sworn-statement.html` | Contractor's sworn statement: Illinois 770 ILCS 60/5 and Michigan MCL 570.1110 side by side (read 2026-11-25 through search results limited to ilga.gov and legislature.mi.gov; direct loads were blocked), and a builder (`sworn.mjs`, tested in `sworn.test.mjs`): paste subs, suppliers and own forces; totals, balance to complete, checks that completed less retainage equals paid plus owing, that the rows add to the contract sum and the owing column to this pay request, missing addresses, and the lien waivers to collect. It builds the table, not the statutory wording or oath. |
| `progress-billing.html` | Progress billing for contractors: draw schedule (milestones), percent complete by line and pay applications compared, how a deposit is credited back and retainage held on each invoice, QuickBooks Online progress invoicing (Intuit's help article, read 2026-11-27 through search results), and a draw schedule calculator (`progress.mjs`, tested in `progress.test.mjs` against hand sums): stages as percents or amounts (percents rounded by largest remainder so 100% adds to the contract to the cent), the deposit spread pro rata or put on the first or last stage, retainage per stage, the invoice for the stages reached and not yet billed, gaps between the stages and the contract named, a schedule CSV with formula-safe cells. Figures only; no contract, notice or state-law wording. |
| `overbilling-underbilling.html` | Overbilling and underbilling: the pay application's billed to date (gross of retainage) against cost-to-cost percent complete for one job; earned revenue, over/under, gross profit to date, certified less retainage against cost, the adjusting entry, and what to bill next period to finish even (`overUnder` in `billing.mjs`, tested in `billing.test.mjs`). Links the multi-job `contractor-wip-schedule` tool. |
| `retainage-tracker.html` | Retainage receivable across jobs (`retlog.mjs`, tested in `retlog.test.mjs` against hand sums): paste or open one row per job (held, released, completion date, release days, release billed); outstanding retainage, due date = completion + the user's own release days (a default fills blanks; none means no due date, never a guessed one), aging buckets, days overdue and an optional carrying cost at the user's rate, completed jobs with no release billed, totals by GC with a concentration flag, a chase list ordered by money x days late, CSV with formula-safe cells. Optional remember-in-this-browser. |
| `pay-app-cash-forecast.html` | When will I get paid (`forecast.mjs`, tested in `forecast.test.mjs` against hand-dated examples): one row per job (monthly billing, retainage %, GC cutoff day, owner days, GC days, months left, optional state) plus the applications sent and not fully paid; each payment dated as submitted + owner days + GC days, late ones listed in chase order, a cutoff skipped when an open application already covers its period (so this month is not counted twice), a recent cutoff with nothing listed flagged, money in by week with late money and retainage kept out, and an optional bank balance (cash on hand less weekly spending) with the first week below zero. Cutoff 31 means the month's last day. GC days are compared with `PROMPT_PAY` in `calc.mjs`, never replaced by it. CSVs with formula-safe cells. |
| `stored-materials-billing.html` | Billing stored materials (`stored.mjs`): the monthly rollforward per SOV line (stored last app + delivered - installed = stored now; installed plus other work = this period), so installed material is billed once; flags installing more than was stored, a line over its value, off-site material the contract may not allow or without title papers, and idle stock; writes SOV lines the calculator and the pay application generator read (`stored.test.mjs` round-trips them through both) and next month's starting sheet. Off-site rule quoted from FAR 52.232-5 on acquisition.gov, read 2026-11-25. |
| `miller-act-payment-bond-claims.html` | Miller Act payment bond claims on federal jobs (`millerbond.mjs`, tested in `millerbond.test.mjs` against hand-counted dates): who may claim (first tier, second tier with notice, nobody below a sub-subcontractor per J.W. Bateson, 434 U.S. 586), the 90-day notice date, earliest suit (day 91) and one-year limit counted from the last day of labor or material (29 Feb -> 28 Feb, the earlier date), the FAR 28.102-1 bond threshold ($150,000; protections from $35,000), and a draft second-tier notice to the prime naming the amount and the party furnished to. Statute text read 2026-11-25 on govinfo.gov and Cornell LII, FAR on acquisition.gov (FAC 2026-01). Federal only. |
| `california-preliminary-notice.html` | California 20-day preliminary notice for private works (`prelim.mjs`, tested in `prelim.test.mjs` against hand-counted dates): who must get it by role (§ 8200, laborers and owner-hired claimants excepted), the last day (first furnished + 20 calendar days, § 8204(a), not moved off weekends), when it is given per delivery method (§ 8116; left and mailed is five days after mailing, so the page gives an earlier mail-by date), what a late notice still covers (20 days before it), the §§ 8102/8202 contents table, proof of notice (§ 8118), and a draft notice with § 8202(a)(3) word for word that prints the statement in bold. Statute text from the Legislative Counsel's bulk download (pubinfo_2025.zip), read 2026-11-25, the same snapshot private PayApps uses. Private works only. |
| `florida-notice-to-owner.html` | Florida Notice to Owner for private works (`flnto.mjs`, tested in `flnto.test.mjs` against hand-counted dates): who serves it and on whom by role (§ 713.06(2)(a), (b); laborers excepted, contractors in privity not covered), the last day (first furnished + 45 calendar days, not moved off weekends), the § 713.18(2) mail-by date (day 40) for service on mailing by certified, registered or Global Express Guaranteed mail, delivery dates for later mail and couriers, a late notice as a complete defense (§ 713.06(2)(a), (f)), the claim of lien date (last furnished + 90, § 713.08(5)), and a draft of the § 713.06(2)(c) form word for word. Statute text in `sources/fl-713.txt` (flsenate.gov, 2026 Florida Statutes, read 2026-11-27; §§ 713.06(2) and 713.18 are the same snapshot PayApps' Notice to Owner uses); the test checks the whole form and every quoted phrase against it. Private works only. |
| `texas-lien-notice.html` | Texas notice of claim for unpaid labor or materials (`txnotice.mjs`, tested in `txnotice.test.mjs` against hand-counted dates): one date per month of unpaid work, the 15th day of the third month after it (second on a residential construction project, Tex. Prop. Code § 53.056(a-1)), for every tier on original contracts from 2022-01-01 (H.B. 2237 SECTIONS 37-38); § 53.003(e) Saturday, Sunday and holiday extensions shown beside the unmoved date to plan on (holidays: Gov't Code § 662.003(a), (b) on their named dates; chapter 53 does not define "legal holiday"); the retainage notice (§ 53.057(a-1)), the reserved-funds affidavit (§ 53.103), the lien affidavit (§ 53.052(b)-(d)), its 5-day copies (§ 53.055) and the suit date (§ 53.158(a)); drafts of the § 53.056(a-2) and § 53.057(a-2) forms word for word, plus the § 53.254(g) homestead statement. Statute text in `sources/tx-53.txt` (statutes.capitol.texas.gov, read 2026-11-27); the test checks both forms, the homestead statement and every quoted phrase on the page against it. Private works only. |
| `front-loading-schedule-of-values.html` | Front-loading check (`frontload.mjs`, tested in `frontload.test.mjs` against hand sums): paste the SOV with each line's estimated cost; job markup, each line's markup and loading (value minus the balanced value at the job markup), early and late lines (by start/finish month, else list order, and closeout words), value pulled onto early lines, late lines below cost, an optional mobilization cap from the user's contract (no cap is assumed), a balanced SOV and the smallest cost-weighted change that brings every line within a tolerance (both rounded with largest remainder to sum exactly to the contract), and with months a cash curve (billed, balanced, over-billed, cost, job cash, value of the early cash at the user's rate). The SOV it writes reads in the calculator (`frontload.test.mjs` round-trips it). Makes no legal claim about what a contract allows. |
| `tm-tickets.html` | T&M tickets: what a ticket should show, and a ticket log (`tmlog.mjs`, tested in `tmlog.test.mjs` against hand sums): paste one row per labor, material, equipment, lower-tier sub or other line; each ticket priced at the user's own markups by cost type plus an optional bond and insurance percent (blank is 0%, nothing assumed; rounding half up to the cent once per line, per markup and on the bond), unsigned tickets and signed tickets with no change order past a chase window flagged, qty x rate against an amount column, unnamed labor and multi-day tickets noted; signed unconverted tickets written as pending change order request rows the change order log reads (`tmlog.test.mjs` runs them through `colog.compute()`), a priced-tickets CSV with formula-safe cells, and a change order request listing only computed figures (no notice, rights or entitlement wording). |
| `punch-list.html` | Punch list template and tracker (`punch.mjs`, tested in `punch.test.mjs` against hand counts): the columns a punch item should record; paste a table or the list straight from the GC's email (numbering dropped, a location before " - ", ": " or a tab split off); each item open, overdue (past the due date the user entered), done awaiting back-check, accepted, or not ours (left out of the count), with the same status order as PayApps' own punch list (`apps/payapps/src/shared/punch-list.ts`); items without a number numbered after the highest given; the accepted share, the retainage the user says is held while items are not accepted, a back-check email naming every fixed item and how many are still open (no claim that contract conditions are met), and a CSV with a blank GC initials column, formula-safe cells. |
| `electrical-contractor-billing.html`, `mechanical-contractor-billing.html`, `drywall-contractor-billing.html`, `concrete-contractor-billing.html` | Landing pages by trade (2026-11-27), for searches such as "electrical contractor billing" or "concrete pay application": what makes that trade's pay apps different (a table linking the guide or tool for each situation), an example SOV labelled as an example, where that trade loses money, an FAQ, and a CTA naming only PayApps features in its ROADMAP's Done list (stored materials, T&M tickets, certified payroll, close-out, punch list, unit-price lines and GCPay's unit-price upload). No statistics or statute claims beyond those the linked guides already source (FAR 52.232-5, 29 CFR 5.5(a)(3)(ii)). |

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

## The PayApps call to action

Each page ends with a card about PayApps, the paid pay-app billing app these
guides are the front door to (`ventures/payapps`). The heading and the
sentence about what it does for that page's job are written per page; the
lead ("We are building hosted" / "PayApps is hosted") and the status sentence
with its link come from `cta.mjs`. Before launch (`APP_URL = null`) they say
"in development" and link to the construction industry page. On launch day,
set `APP_URL` to the deployed app and run `node cta.mjs`: every page then says
"open now, free on one job" and links to `<APP_URL>/?signup&from=pay-app-guides/<page>`,
which opens the app on "Create an account". `PAID_PLANS_ON` adds the prices
once checkout is live. `page.test.mjs` fails if a page is out of date, and
`state-forms.mjs` runs each state page through `cta.mjs` so a rebuild keeps
the launch state. Switched on 2026-11-27 after deploy run 45949861746.

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
`guide_*_viewed` per guide, `colog_*` on the change order log, `overbilling_summary_copied`, `pay_app_checked` / `pay_app_check_copied` on the checker, `waivers_*` on the lien waiver log, and `stored_*` on the stored materials page) are kept in the visitor's own local storage,
switched off by Do Not Track or the opt-out button.

## Licence

FSL-1.1-MIT, see `LICENSE`.
