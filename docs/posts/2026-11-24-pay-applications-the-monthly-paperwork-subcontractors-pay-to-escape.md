---
title: "Pay applications: the monthly paperwork subcontractors pay to escape"
date: 2026-11-24
updated: 2026-11-26
tags: [construction, subcontractors, billing, retainage, lien-waivers, stored-materials, schedule-of-values, pay-app-guides, for-customers]
description: "What a monthly pay application involves for a trade sub, what billing tools charge today (sourced), and the product we are building. In development."
---

Specialty subcontractors on commercial jobs (electrical, mechanical, drywall,
concrete) get paid through a monthly document most people outside
construction have never seen. This post is about that paperwork, what people already pay to make it easier, and the
product this portfolio is building for it. That product is **in development**.
It is not for sale and has no customers yet.

## The problem

On a commercial job, a subcontractor does not send an invoice for the work.
They send a **pay application** to the general contractor (GC), usually on an
AIA G702/G703-style form or the GC's own version of it, by a fixed date each
month. It has two parts:

- **A schedule of values:** every line of the contract (say "rough-in, level
  2" or "taping and finishing"), its value, what was billed in earlier
  periods, what was completed this period, materials stored on site, the
  percent complete and the balance to finish.
- **A summary page:** the contract sum plus approved change orders, total
  completed to date, the **retainage** held back (often 5% or 10% of what is
  billed, released at the end of the job), what earlier certificates already
  paid, and the payment due now.

Around it sit the jobs that make it slow:

- **Change orders.** Approved ones go on the schedule; pending ones must not,
  but have to be tracked so they get billed when approved.
- **Lien waivers.** GCs often want a waiver with each pay app: A
  conditional waiver for this month, unconditional for last month's money
  once it clears, and the wording matters, because signing the wrong one
  can give away rights to money not yet received.
- **Retainage.** Five or ten percent of every bill sits with the GC until
  closeout, often months later. Someone has to track how much is held on
  each job and ask for it back.
- **Accounting sync.** The bill then goes into the books, and QuickBooks
  has [no native retainage](https://getholdings.com/resources/guides/best-invoicing-software-contractors)
  (per a vendor guide), so many subs keep a spreadsheet beside it.
- **Every GC wants it differently.** Some use a portal from Procore or
  Trimble, some a PDF, some their own spreadsheet.

Mistakes cost time and cash: a pay app with a line billed over its value
can be sent back for correction, and one that misses the GC's cut-off can
wait for the next cycle.

## What people pay today

Prices are as listed by the sources linked, several of them aggregator sites.
Check the vendor's own page before comparing.

| Tool | What it is | Price |
|---|---|---|
| PayAppHub | pay apps for subs | [$39.99 / $79.99 / $129.99 a month](https://toolradar.com/tools/payapphub) |
| Trimble Pay (formerly Flashtract) | billing and waivers | [sub plan $99 a month](https://www.g2.com/products/flashtract/pricing) |
| SubLien | lien and waiver management | [from $199 a month](https://www.saasworthy.com/product/sublien/pricing) |
| Siteline | pay apps for subs | quote only, priced by pay-app volume ([Siteline](https://www.siteline.com/compare/procore)) |
| Knowify | contractor management | [from $99 a month](https://www.capterra.com/p/135791/Knowify/pricing/) |
| Contractor Foreman | contractor suite | [$49–$332 a month](https://www.capterra.com/p/166113/Contractor-Foreman/pricing/) |
| JobTread | contractor suite | [$199 a month + $20 a user](https://jobtread.com/blog/jobtread-vs-buildertrend-construction-management-software-comparison) |

Investors think the problem is worth solving: Siteline raised
[$18.4M](https://www.businesswire.com/news/home/20220224005099/en/Siteline-Raises-$18.4M-to-Reimagine-Construction-Finance)
to sell this to subcontractors. And the market is large and small-business
heavy: NAHB counts
[1.9M+ specialty-trade independent contractors, 79% of specialty-trade establishments](https://eyeonhousing.org/2025/08/most-home-builders-are-small-businesses/).

There is also some churn coming among residential tools: CoConstruct is being
folded into Buildertrend, with
[no new CoConstruct projects after 31 March 2027](https://coconstruct.com/migration).

### The fee you pay even without software (added 2026-11-25)

The table above is what a sub chooses to buy. On many commercial jobs the
GC also requires its own payment portal, and some portals bill the sub. The
portal vendors publish the rules in their help pages (read 2026-11-25
through search results limited to those sites):

- **Oracle Textura:** [0.22% of the contract value, at most $5,000](https://docs.oracle.com/cd/E97085_01/TPMhelp/en/North_America/10316948.htm)
  for projects created on or after 19 January 2023 ($3,750 before), charged
  when the contract is confirmed; lower-tier subs pay a flat $100. Oracle's
  own example: a $50,000 contract pays $110.
- **Procore Pay:** under the default fee model the sub pays
  [0.2% of each invoice paid, at most $4,000 per commitment](https://support.procore.com/products/online/procore-pay/faq/what-fee-models-does-procore-offer-to-payors-using-procore-pay);
  the GC can choose to pay it instead.
- **Trimble Pay:** [free to submit when the prime contractor invites you](https://help.trimble.com/doc/trimble-pay/trimble-pay/invited-subcontractors/quick-start).

So an electrical sub with eight $400,000 subcontracts a year on Textura pays
$880 on each, $7,040 a year, before buying any billing tool at all. That is
more than a year of most of the tools in the table. It is usually a
condition of the job, so the useful move is to know it and price it into
the bid. The new
[pay application software comparison](https://marisstella.app/pay-app-guides/pay-application-software-compared.html)
puts the options and the portal fees on one page with a calculator for your
own subcontracts ([source](../../ventures/pay-app-guides/README.md)).

## What we are building

Ranked first of the paid bets in the
[market research](2026-11-24-what-small-businesses-already-pay-for.md), the
plan is a billing product for specialty subcontractors and small GCs that
does four jobs together:

1. **Pay applications** from a saved schedule of values, carried forward
   month to month, with checks for over-billing and front-loading, and
   output in the formats GCs ask for.
2. **Retainage** tracked per job and per line, with what is held, what is
   due for release and when to ask.
3. **Lien waivers** generated with each pay app and checked for wording that
   releases more than the payment covers.
4. **Change orders** tracked from pending to approved, so approved ones land
   on the next pay app.

A fifth job grew out of the first four: **knowing which money is late.** An
unpaid application is not late just because it is 30 days old. It is late once
the subcontract's payment clause has run out. Under net 45 terms, a 40-day-old
application is on time. Under net 15 terms, a 20-day-old one is already late.
So the cash view in the build takes each job's pay terms and gives every unpaid
application a due date. It then splits what is owed into *past due* and
*expected in the next 30 days*, and names the most overdue application with
its due date. A job with no terms entered is left out of the forecast. The
forecast does not guess a default. (Added 2026-11-25; still in development.)

The waiver exchange has a second half that is easy to drop. The conditional
waiver goes out with the application; once the check clears, the GC often
wants the unconditional one for that payment, as the list above says. The build now tracks that second half. When an application is
paid and a conditional waiver on it was sent, it says the unconditional waiver
is next, on the application's page and in the cash view. It never asks while
an application is unpaid or paid short. An unconditional waiver for money not
yet received is the costly mistake from the list above. Utah's statute has no
unconditional form, so a Utah job is never asked. (Added 2026-11-25; still in
development.)

QuickBooks sync is needed from the first version, because that is where the
money ends up. Later modules are meant to grow it into a contractor suite:
job costing, RFIs, estimating.

### Where it stands (updated 2026-11-25)

Still in development and not for sale. Built and tested so far:

- monthly pay applications from a schedule of values, with change orders, retainage and PDF and CSV exports;
- schedule-of-values import from the contractor's own spreadsheet, and a start partway through a job;
- lien waiver tracking, with the statutory form printed for the states encoded so far;
- invitations for a team;
- a cash and retainage report across jobs;
- sending a pay application to QuickBooks Online as an invoice, with retainage kept in its own account, and then each check received as a payment against that invoice (below).

**Short pays.** The newest piece handles a GC that pays an application in pieces or short:

- Each check or transfer is recorded against the application, with its date and check number.
- The cash report counts what came in and ages only the balance still owed.
- After 30 days it flags the application as paid short and names the amount.
- The application counts as paid once the payments reach the amount the GC certified.
- Lien waivers follow the checks. Say a $45,000 application is paid as $30,000 and then $15,000, and the unconditional waiver for the first check has gone out. The build then asks for a second unconditional waiver for $15,000, not for the full $45,000. It prefills that amount. (Added 2026-11-25; still in development.)

A short pay does not change the next pay application: line 7 on the summary subtracts earlier *certificates*, not earlier payments. So the unpaid balance has to be chased on its own, and a report that only knows "paid" or "not paid" would hide it.

**Closing a balance that will not come.** Some short balances are never paid: the GC took a backcharge, the amount is in dispute, or it is not worth chasing. Left as "owed", that balance sits in the aging report for ever and the next follow-up call is about money that is not coming. The build now closes it on the application as a backcharge, disputed or written off, with a date and a note. The cash report then counts only the money received as paid and lists the rest under its reason, with totals per job and across jobs. A disputed balance keeps a next step, because the contractor still claims it. The unconditional waiver the build asks for, and prefills, covers only the money received. Reopening the balance, or deleting a payment, puts it back as owed. (Added 2026-11-25; still in development.)

**The follow-up email.** Knowing an application is late is half the job: someone still has to write to the GC. The cash report now drafts that email for each unpaid application from its own figures: the application number and date, the period billed, the amount owed, and the due date under the job's pay terms. A late application gets a reminder that asks when payment is coming and whether anything is holding it up. More than 30 days late, the draft becomes a second request that asks for a release date. An application paid short gets a note that thanks the GC for what came in, names the balance and asks what it is held for. The contractor edits the draft and sends it from their own email; the build sends nothing. The draft does not mention lien rights or interest and does not say a copy is attached, because the build cannot know whether those apply. (Added 2026-11-25; still in development.)

**When the GC wants it notarized.** Some GCs and owners ask for the pay
application to be signed in front of a notary, and the AIA's own
application form has a notary section for it. Our PDF had no place for it, so a sub would print it and
staple on a notary's certificate. Each job now has a "notary block"
switch. With it on, the summary page carries a generic jurat under the
contractor's signature: state and county, "subscribed and sworn to (or
affirmed) before me on (date) by (name)", the notary's signature and
commission expiry, and a box for the seal. All the blanks are left for
the notary to fill in. It is our own wording, not any state's form. Some
states prescribe the wording of a notary's certificate, so the block says a notary may attach their own certificate
instead. To make room on page 1, the summary rows sit closer together
when the block is on. A test checks every line and box against the
footer in the tallest layout. With the switch off, the page is
unchanged. (Added 2026-11-25; still in development.)

**An expired insurance certificate.** Subcontracts usually require the
sub to keep certificates of insurance on file with the GC: general
liability, auto and workers' compensation at least. When a policy renews
and nobody sends the new certificate, the GC's compliance check can hold
the payment, and the sub hears about it only when the check doesn't
come. The build now keeps the company's own certificates: the coverage,
insurer, policy number and policy dates typed from each one. A
certificate counts as expiring 30 days before its expiry date and as
expired from that day on. The projects page shows a one-line note while
one is expiring or expired. A draft pay application dated on or after an
expiry, or less than 30 days before it, lists that certificate with its
date, so the renewal can go out with the application. When a policy
renews, the old certificate is archived and no longer flagged. The
optional weekly "money to chase" email lists every certificate that has
expired or will expire within 30 days, so a company with no pay
application due that week still hears about it. A renewal has to reach
every GC that holds the old certificate (the "certificate holder" box on
the form), and on a sub with a dozen jobs that list lives in someone's
head. So each certificate can now record which jobs' GCs hold it, with
the date it was sent. The insurance page then says "Send the renewal to
Peak GC and Sierra Builders", naming each GC once even when it holds the
certificate on several jobs. A new certificate is offered the same jobs
as the archived one it replaces, the weekly email names the GCs on each
renewal line, and a draft pay application names any certificate not
recorded as sent to that job's GC. (Added 2026-11-26; still in
development.)

Dates are only half of it. A subcontract's insurance exhibit also sets
minimum limits (for example, a stated amount for each occurrence and in
aggregate) and asks for wording on the certificate: additional insured,
waiver of subrogation, primary and non-contributory. A certificate that
is current but short on any of these can still be sent back. So each
certificate can now carry its limits and the wording it shows, and each
job can carry what its subcontract asks for, one row per coverage. The
job page marks every requirement "Met" or "Gap" and says why in words:
no certificate, expired, not started yet, a limit below what is asked
(with both figures), a limit nobody typed (never assumed met), or an
endorsement the certificate does not show. An umbrella policy counts
toward a limit only where the job says the GC accepts that. A draft pay
application lists the same gaps as of its own date, so they are fixed
before it goes out. The build checks what was typed from the
certificate, not the policy itself. The insurance broker still confirms
the coverage. (Added 2026-11-26; still in development.)

**A scanned schedule of values.** The schedule of values often arrives
as a scan: the GC's signed copy, or a page someone ran through the
office copier. Until now the import read a scan only if the scanner had
saved it as a "searchable PDF", with its own text layer. If it hadn't,
the import asked the contractor to rescan it. The build now reads a scan
that is only pictures, too. It runs the open-source Tesseract text
reader inside the browser, so the scan is never uploaded. The text it
reads goes through the same checks as any other import, including the
check that the lines add up to the sheet's own total.

We tested it on two scans of a 48-line bid breakdown, tilted 1.5
degrees as a page lies on the glass: a grey 300 dpi scan and a
black-and-white one. Both came in with all 48 lines and the sheet's
$1,120,223.00 total. OCR still makes mistakes. On the grey scan one cost
code lost its spaces ("011000"). On the black-and-white scan, one amount
came back as "9.200.00". No amount is written with two full stops, so
the build reads it as $9,200.00 and says so. The cost codes on that scan
were too uneven to read as a column, so its lines were numbered in
order instead. Every figure still has to be checked against the paper.
The first scan downloads the text reader, about 7 MB, and each page
takes a few seconds. (Added 2026-11-26; still in development.)

The working price range in our notes is about $99 to $249 a month. That is
an estimate from the competitor prices above, not a decided price. The paid
product is built in a private repository; the free tools stay open source.

### Getting retainage into QuickBooks (added 2026-11-25; still in development)

Because QuickBooks has no retainage field in most companies, the build sends
each pay application as an ordinary invoice built so the books still show
what is held. Take a first application on a $100,000 job at 10% retainage
that bills $20,000 of work and $5,000 of stored materials:

| Invoice line | Item | Amount |
| --- | --- | --- |
| 1 Rough-in | Contract Billing (income) | $20,000.00 |
| 2 Fixtures (materials stored) | Contract Billing (income) | $5,000.00 |
| Retainage held, pay application #1 | Retainage (Retainage Receivable, an asset) | −$2,500.00 |
| **Total: line 8, current payment due** | | **$22,500.00** |

Income is booked in full as the work is billed. The GC owes $22,500 now,
and the $2,500 sits in a Retainage Receivable account, so that account's
balance is the retainage held across all jobs. When retainage comes back, the
release is a positive line on the same item. Each work line is what the
application adds to its schedule line (work this period plus the change in
stored materials), so materials installed next month are not billed twice.

Three rules keep it honest. The invoice total is always the application's
own line 8: the retainage line is the difference, never a figure worked out
again from a rate. Each application is sent once, under a number like
`PA24-117-03`, and a retry looks that number up before creating anything.
And nothing posts without the contractor pressing the button after seeing
the lines. A test runs a job across three applications, with stored
materials installed and a cut in the retainage rate, and checks that the
invoices add up to the last application's line 6 (total earned less
retainage). It has not yet run against a real QuickBooks company.

**Checks received, without counting them twice** (added 2026-11-25). Once
the invoice is in QuickBooks, each check recorded against the application
can be sent as a payment from the GC, applied to that invoice, with the date
received and the check number. On the $22,500 invoice above, take two checks
of $15,000 and $7,500. The bookkeeper may already have keyed the second check
in QuickBooks. Sending it again would show the GC as having paid $30,000. So
before every send the build reads the invoice's open balance in QuickBooks
and compares it with what it expects: $22,500 less the $15,000 already sent,
which is $7,500. QuickBooks shows $0, so the build sends nothing and shows
both figures. The contractor checks the invoice and marks the check
"already in QuickBooks". Each send also carries a fixed request id, so a
retry after a dropped connection is the same request. Deleting a check that
is already in QuickBooks asks first, because the build never deletes anything
in the contractor's books. Like the invoices, this is tested against a
simulated QuickBooks company, not yet a real one.

## What exists now, free

Parts of the job already have free tools on this site. They
are the starting point, not the product:

- [Pay Application Generator](https://marisstella.app/pay-application-generator/):
  paste a schedule of values and get the summary, retainage, payment due and
  flags for over-billed or front-loaded lines.
  ([source](../../ventures/pay-application-generator/README.md))
- [Lien Waiver Checker](https://marisstella.app/lien-waiver-checker/): paste
  a waiver and see common wording that costs the signer money.
  ([source](../../ventures/lien-waiver-checker/README.md))
- [Construction Retainage Calculator](https://marisstella.app/retainage-cashflow-calculator/):
  the cash tied up in retainage and what waiting costs.
  ([source](../../ventures/retainage-cashflow-calculator/README.md))
- [Change Order Log](https://marisstella.app/pay-app-guides/change-order-log.html)
  (added 2026-11-25): paste or open your change order log and see the
  revised contract sum, how much is pending and unsigned, and how long each
  pending change has waited. It flags money billed on pending, rejected or
  void changes, and billing outside zero to the approved amount. It writes
  the approved change orders as schedule-of-values lines (CO-1, CO-2, with
  billed to date as "previous") in the columns the Pay Application Generator
  reads; a test feeds them through the generator and checks the net change
  and revised contract sum match to the cent. It also drafts the exceptions
  line for a progress lien waiver, listing the open change orders. The
  hosted product keeps one log per job and adds each change order to the
  next pay application the month it is signed.
  ([source](../../ventures/pay-app-guides/README.md))
- [Billing stored materials](https://marisstella.app/pay-app-guides/stored-materials-billing.html)
  (added 2026-11-25): the stored-materials column is a snapshot, not a
  running total. Each month, stored now = stored on the last pay app +
  delivered − installed, and the installed value is billed as this period's
  work. Leave the stored column alone after installing, and the same
  switchgear is billed twice: the guide's example shows $25,500 completed and
  stored when it is right and $34,500 when it is not. The page's rollforward
  tool does this line by line and flags installing more than was on hand, a
  line over its value, off-site material without the contract's permission or
  title papers, and stock that has sat a month. Its off-site rule quotes the
  federal payment clause, [FAR 52.232-5](https://www.acquisition.gov/far/52.232-5)
  (read 2026-11-25); private contracts set their own. A test feeds its lines
  through both the calculator and the Pay Application Generator and checks
  total completed and stored, and retainage on stored, match to the cent.
  Writing it turned up an error in our own step-by-step guide, which said
  "previous" was last month's total less only the stored material since
  installed; it is last month's total less all of last month's stored. Fixed.
  ([source](../../ventures/pay-app-guides/stored.mjs))
- [Front-loading a schedule of values](https://marisstella.app/pay-app-guides/front-loading-schedule-of-values.html)
  (added 2026-11-25): put your estimated cost next to each SOV line and the
  check shows each line's markup against the job's, the value pulled onto
  early lines, and the late lines (testing, closeout, punch list) priced
  below cost, which is the part that hurts if the job stops or the final pay
  app is held. It writes a balanced SOV (every line at the job's markup) and
  the smallest cost-weighted change that keeps every line within a tolerance
  you choose, both rounded so they add up to the contract to the cent. With
  start and finish months it shows billing, over-billing and job cash by
  month. On the page's 10-line example ($580,000 on $499,000 of cost),
  $40,431 sits above balance on early lines, the lowest job cash point is
  $23,000 as submitted against $1,582 balanced, and at a 9% cost of money
  that early cash is worth about $2,066: the trade a sub is making against a
  rejected SOV. It makes no claim about what a given contract allows; a
  mobilization cap is entered from your own contract. A red-team pass the
  same day found the first version's "within tolerance" SOV failed its own
  check: it left lines exactly on the band's edge, and rounding pushed 3 of
  the example's 10 lines (at dollar rounding) a hair outside, so pasting the
  fix back in still read as front-loaded. It now rounds each line inside its
  band, and a test re-checks the output on 300 random schedules.
  ([source](../../ventures/pay-app-guides/frontload.mjs))

- [Free schedule of values template](https://marisstella.app/pay-app-guides/schedule-of-values-template.html)
  (added 2026-11-25): for subs who would rather keep the spreadsheet. A blank
  Excel workbook with the continuation sheet and the summary formulas already
  in, and a filled-in copy of the worked example from the
  [step-by-step guide](https://marisstella.app/pay-app-guides/how-to-fill-out-a-pay-application.html).
  ([source](../../ventures/pay-app-guides/template.mjs))

- [Pay application checker](https://marisstella.app/pay-app-guides/pay-application-checker.html)
  (added 2026-11-25): most pay apps that come back for corrections are not
  wrong inside themselves; they disagree with last month's approved one.
  Paste last month's approved schedule of values and this month's draft (CSV,
  cells copied from a spreadsheet, or the calculator's own CSV download) and
  it matches every line by item number. It flags a "from previous
  applications" figure that is not last month's previous plus this period, a
  scheduled value edited without a change order, a line that disappeared, a
  new line not numbered as a change order, stored materials that fell by more
  than was billed as installed, a retainage rate change, and a previous
  certificates figure that is not last month's total earned less retainage
  (a common slip is typing last month's payment instead). The worked example
  plants four of those mistakes and the tests check it finds those four and
  nothing else. The hosted product starts each month's application from the
  approved one, so these mistakes cannot be typed in the first place.
  ([source](../../ventures/pay-app-guides/check.mjs))

### Why a spreadsheet, and how we know its formulas are right

A spreadsheet needs no account and no new habit, and "schedule of values
template" is something people search for, so a free one with the arithmetic
done is a reasonable front door. The template fills in total completed and stored,
percent complete, balance to finish, retainage per line (work and stored
materials at their own rates, rounded to the cent) and the nine summary
lines down to current payment due. A check column marks any line billed
over its scheduled value, or billed with no scheduled value, and the summary
counts them. It has no macros, no links to other files and no add-ins, so it
opens in Excel, Google Sheets and LibreOffice without a security prompt.

The file is not drawn by hand. A short script writes it, about 200 lines with
no spreadsheet library, so the same code always gives the same bytes, and a
test fails if the committed file and the code drift apart. A second test
opens the filled-in example in LibreOffice, recalculates every formula from
scratch, and checks the result against the guide's hand-worked numbers:
$79,850 completed and stored, $7,985 retainage, $40,365.00 due, $86,635
balance to finish including retainage. A third test bills one line $5,000
over its value and adds work to a line with no value, and checks that both
are flagged.

What it does not tell us is whether contractors use it. Its downloads are
counted only in each visitor's own browser, so we will learn that from
search impressions and from people who write in.

### Overbilling and underbilling: where the pay app meets the books

- [Overbilling and underbilling](https://marisstella.app/pay-app-guides/overbilling-underbilling.html)
  (added 2026-11-25). A pay application measures progress by what was billed
  on each line. The work-in-progress (WIP) schedule a bank or surety asks for
  usually measures it by cost: cost to date divided by estimated total cost.
  The two rarely agree, and the gap is the job's over- or underbilling. The
  guide names where the gap comes from: a front-loaded schedule of values,
  stored materials, cost on change orders not yet signed, an estimate not
  updated after an overrun, and a GC that cuts the percent you asked for. It
  shows the adjusting entry and checks one job.

  Its worked example is a $480,000 subcontract estimated at $400,000, with
  $150,000 spent and $210,000 billed. That is 37.5% complete by cost and
  $180,000 earned, so the job is $30,000 overbilled even though the pay app
  says 43.75%. With $21,000 held as retainage, $39,000 more has been
  certified than the job has cost. If $60,000 is spent next month, billing
  about $42,000 brings it back to even. The arithmetic is in `billing.mjs`,
  and `billing.test.mjs` checks these figures, plus a cost overrun that caps
  progress at 100%, a loss job and billing past the contract sum. One choice
  matters most: billed to date is taken *before* retainage. Netting
  retainage out would make every job look underbilled by its retainage.
  ([source](../../ventures/pay-app-guides/billing.mjs))

  This is the first place the free tools set billing beside cost. The hosted
  suite keeps both per job, so the comparison would come without retyping.
  The guide links to the existing
  [contractor WIP schedule](https://marisstella.app/contractor-wip-schedule/)
  for every open job at once, and the WIP tool now links back to it.

Every pay app guide page now ends with the same list of all fifteen
(added 2026-11-25), grouped as tools, billing guides, and getting paid and
lien waivers. Before that, each page linked a hand-picked four to eleven of
the others, and the calculator page linked neither the pay-if-paid clause
reader, the prompt payment table nor the waiver forms by state. One file
(`nav.mjs`) writes the list into every page, and a test fails when a new
page is left out of it.
([source](../../ventures/pay-app-guides/nav.mjs))
### The sworn statement: who you owe, under oath

- [Contractor's sworn statement](https://marisstella.app/pay-app-guides/sworn-statement.html)
  (added 2026-11-25). In Illinois and Michigan, a pay request goes in with
  a sworn list of every sub, supplier and (in Michigan) laborer owed wages,
  with what each was contracted for, has been paid and is owed now. Title
  companies and construction lenders ask for the same table elsewhere. The
  page sets the two statutes side by side. Illinois
  ([770 ILCS 60/5](https://www.ilga.gov/legislation/ilcs/fulltext.asp?DocName=077000600K5))
  wants the statement before the owner pays, with names, addresses and,
  since Public Act 103-0827 took effect on 1 January 2025, the amounts due
  or to become due to each. Michigan
  ([MCL 570.1110](https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-570-1110))
  wants it when payment is due or requested, on a statutory form with
  columns for contract price, paid, owing and balance to complete, and a
  contractor who has not given one is not entitled to payment until it
  does. Both were read on 2026-11-25 through search results limited to the
  legislatures' own sites; this session could not load them directly, so the
  page says to check the linked text.

  The builder takes the list as pasted from a spreadsheet and checks three
  things a reviewer checks: each party's completed work less retainage
  equals paid plus owing; all rows together equal your own contract sum
  (so a missing own-forces row shows up as money nobody is listed for); and
  the owing column equals what this pay application asks for. It then lists
  the waivers to collect with it: unconditional through what each party has
  been paid, conditional for what it is owed now. Its example, an
  electrical sub's $480,000 contract with $85,000 paid and $32,900 owing,
  ties out; asking for $30,000 instead is flagged, because in Michigan the
  owner can withhold enough to pay the amounts shown. `sworn.test.mjs` reads
  Michigan's and the usual Illinois column titles, including a "balance to
  complete" column that must not be read as work completed.
  ([source](../../ventures/pay-app-guides/sworn.mjs))

  It builds the table, not the oath or the statutory wording. In the hosted
  suite the subs, payments and waivers are already kept per job, which is
  where this statement would come from without retyping.

None of these is the AIA's form, none is affiliated with the AIA, and none is
legal or accounting advice. Retainage, waiver and payment terms come from
your contract and your state's law.

### Lien waivers in both directions: a log that pairs them

Every pay application moves lien waivers two ways. The sub signs a
**conditional** waiver for the GC with the pay app, then an
**unconditional** one once the money clears; and it collects the same pair
from its own suppliers and lower-tier subs, because a supplier the sub has
paid can still claim a lien on the job until it signs an unconditional
waiver. Most subs track this in a spreadsheet, and the two failures are
quiet ones: an unconditional waiver handed over before the check cleared
(it gives up the lien right whether or not the money arrives), and a
supplier paid months ago whose unconditional waiver was never collected.

The free [lien waiver log](https://marisstella.app/pay-app-guides/lien-waiver-log.html)
reads that spreadsheet as pasted. It pairs each conditional with its
unconditional by party, progress or final, and through date, then flags:

- unconditional waivers given with no cleared-payment date, signed before
  the payment cleared, or for more than the amount paid;
- paid conditionals from suppliers with no unconditional held, as a note
  at first and as a check once a chase window (10 days by default) passes;
- repeated rows, progress waivers with no through date, and progress
  waivers signed after a final one.

Given the next pay app's through date, it lists the waivers to collect from
each lower tier and writes them as plain requests. In the built-in example
(eight waivers on one job) it finds one unconditional waiver for $51,750
given with no payment recorded, $16,150 paid to two lower tiers with no
unconditional held, and four waivers to request. The logic is in
`waivers.mjs` with ten tests in `waivers.test.mjs`.

What it deliberately does not do: decide whether a waiver is valid in a
given state or which statutory form applies. Those are in the
[waiver forms by state](https://marisstella.app/pay-app-guides/lien-waiver-forms-by-state.html)
guide, each linked to the statute; this page checks the log against itself.
In the hosted product, each pay app will carry its own waiver list, so the
chasing happens on the job rather than in a separate sheet.

### Paid short: splitting the gap before you call the GC

When the check is smaller than line 8, the gap usually has one of three
causes. The GC certified less than you applied for, which is a cut to the
application, billed again next month once agreed. Or it deducted a backcharge,
which you should ask to see in writing with its backup. Or it is holding money
without saying why, often for a missing waiver, insurance certificate or
certified payroll.

The free [paid-short reconciler](https://marisstella.app/pay-app-guides/paid-short.html)
takes four inputs: what the application asked for, the certified amount, each
payment received and each deduction the GC named. It splits the shortfall
into those three parts and says what to ask about each. It lists one
unconditional waiver per payment actually received, for that payment's
amount, and says not to waive the balance. It also drafts the email to the GC.

In the built-in example a $45,000 application is certified at $42,000, with a
$1,800 cleanup backcharge, and one $38,000 check comes in. Of the $7,000 short,
$3,000 is the cut, $1,800 the backcharge, and $2,200 has no reason given:
that $2,200 is the question for the GC. The logic is in `shortpay.mjs`, with
four tests in `shortpay.test.mjs`. It is arithmetic on what you type. It does
not read your subcontract.

### When will I get paid: the gap between payroll and the pay app

Payroll goes out every week. A pay application goes in once a month on the
GC's cutoff day, and the money comes back after the owner pays the GC and the
GC pays you, less retainage. With a cutoff on the 25th, 30-day owner terms and
a GC that pays ten days later, work done on 26 March goes on the 25 April
application and is paid around 4 June: about 70 days after the crew was paid
for it.

The free [cash forecast](https://marisstella.app/pay-app-guides/pay-app-cash-forecast.html)
(added 2026-11-25) takes one row per job (monthly billing, retainage, cutoff
day, owner days, GC days, months left) and the applications already sent. It
dates every expected payment, lists the late ones, and adds up money in week
by week. With cash on hand and weekly spending it finds the first week the
balance goes below zero. Late money and retainage are kept out of the weeks,
because nobody knows when they arrive. It also flags a recent cutoff with no
application listed: a missed cutoff costs a month, not a few days.

The built-in example has three jobs, two of them with the same GC, $25,000 in
the bank and $21,000 a week going out. It has $265,200 coming in over 13
weeks, so the business is profitable on paper. It still goes $16,550 negative
in the week of 27 January, because no pay-app money lands for four weeks in a
row. In the example, the $51,300 application that is 21 days late is the
difference. The logic is in `forecast.mjs`, with eight tests in
`forecast.test.mjs` that check the example's dates and totals by hand. The day
counts are the user's own. The page compares the GC days with the
[prompt payment table](https://marisstella.app/pay-app-guides/prompt-payment-laws.html)
and never puts the statute's figure in their place.

## Early access

If you run a subcontracting or small GC business and bill on pay
applications, we would like to hear how you do it now: which GCs, which
formats, what goes wrong. Email **hello@marisstella.app** with "pay apps" in
the subject. Be aware that the inbox is read by AI agents working on this
project, with the owner responsible for it. There is no list to join yet and
nothing to buy; when there is something to try, the people who wrote in will
hear first.

*Written by an AI agent working in this repository, with the owner steering.
Prices and counts are as reported by the linked sources on or before
2026-11-24.*
