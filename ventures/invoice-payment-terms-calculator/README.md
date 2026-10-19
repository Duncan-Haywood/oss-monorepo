# Invoice Payment Terms Calculator

Free browser tool for freelancers and small service businesses. Enter an invoice amount, terms, late-rate assumption, and outstanding invoices to get the due date, **when the cash actually lands on your client's payment run**, cash-flow exposure, 30/60/90-day late-fee scenarios, copyable payment-terms wording, whether a **2/10 Net 30 discount still beats waiting**, and whether **factoring still beats waiting** after your carrying cost. Before the first invoice goes out, it also prices the **billing schedule** — how much of your finished work a deposit or milestone split actually leaves unpaid on handover day.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/invoice-payment-terms-calculator/

**After using this, you can now** see when the invoice is due, when the money actually arrives, how many operating days several unpaid invoices consume, whether giving 2% to get paid in 10 days still covers the float, whether a 3% factor fee still beats waiting, and how much of a project you are financing under each billing schedule — which used to mean a spreadsheet that forgot grace days, treated “2/10 Net 30” and “get paid now” as slogans, or argued about the deposit percentage without checking when the deposit arrives.

## When the cash actually lands

The due date is the date the invoice says. It is usually **not** the date
money arrives, because accounts-payable departments pay in runs — weekdays
only, the 1st and 15th, once a month, one weekday a week. Two things follow
that a due date alone will never show you:

- **Drift.** An invoice dated 2026-08-24 on Net 30 is due 2026-09-23. At a
  client who pays on the 1st and 15th, cash lands **2026-10-01** — eight days
  later, about **$6.31** on $1,200 at a 24% carrying rate. Those days are not
  lateness and no late fee applies to them; they are the client's normal
  process, and they are invisible until you model the run.

- **Longer terms are often free.** Because runs are batched, a longer term
  frequently lands on the very same one. At a client paying monthly on the
  1st, that same invoice lands **2026-10-01 under both Net 15 and Net 30** —
  fifteen extra days of terms at no cost in cash timing. The tool lays Net 7,
  15, 30, 45, and 60 side by side so you can see where that happens before you
  negotiate.

When moving the invoice date earlier would catch the previous run, the tool
says by which date and how many days sooner you would be paid. It only says so
when batching actually gives leverage — where every shift is one-for-one, as
on a weekdays-only schedule, there is nothing useful to report and it stays
quiet.

This models the schedule you tell it. It does not predict whether a client
pays on time.
Open [`index.html`](index.html) in a browser. The calculation is local and works without an account, network request, or API key.

[Should I offer 2/10 Net 30?](should-i-offer-2-10-net-30.html)
answers the early-pay question on the same $1,200 default. On 24% money,
waiting still leaves $1,176.33 against $1,168.27 after the discount.
They match at about 36.1%. At 50%, the discount flips ahead.

[Should I factor this invoice?](should-i-factor-this-invoice.html)
answers the third-party fee question. On 24% money, waiting still leaves
$1,176.33 against $1,161.24 after a 3% fee and 90% advance. They match
at a 1.74% fee. At 50%, factoring flips ahead.

[Already overdue? Wait, chase, settle, or collections](chasing-a-late-invoice.html)
picks up where the due date runs out. The same invoice, 15 days late, scored
four ways on expected cash after float and the hours a chase costs: a 10%
settlement is worth $861.16, waiting $823.43, chasing it yourself $755.61
(three hours at $85 is $255 spent whether or not they pay), and collections
$355.63. The most useful number is the chase-hours break-even — about **1.8
hours** on these defaults. Odds are the operator's estimate, not a prediction.

[Should I ask for a deposit?](should-i-ask-for-a-deposit.html) answers the
other end of the job — the schedule, before the first invoice exists. On a
$6,000 project delivered over 30 days at Net 30 paid 12 days late, billing
once at the end leaves the whole $6,000 of finished work unpaid on handover
day; a 50% deposit that clears in five days leaves $3,000. Two results are
worth knowing before copying anyone else's contract:

- **Thirds can be worse than a half deposit** ($3,960 unpaid against $3,000),
  because the midpoint bill is collected on the same 42-day cycle and lands
  on day 57 — nearly a month after the work shipped.
- **A deposit collected on that same cycle protects nothing.** Set the
  deposit to take 42 days and every schedule leaves the full $6,000 unpaid.
  The collection time is what protects you, not the percentage.

What the schedule model does *not* claim: delivered value is assumed to
spread evenly across the project's days, so front-loaded work is more
exposed than shown; a client who has prepaid is never credited back as if
they were lending to you; and none of it predicts whether a given client
pays.
It is not a quote-margin tool (that prices the job), not a retainage
schedule (that is construction withhold), and not a Faire payout-speed
page (that is marketplace processing). This page is invoice terms for
service firms.

## Payment reminder schedule

Under the payment-terms wording the page lists dated follow-ups — three days
before the due date, on it, then 7, 14 and 30 days after — with editable
wording for each, and a **Download calendar (.ics)** button that creates
all-day events you can import into Google, Apple or Outlook calendar. The file
is built in your browser and never uploaded. The wording is a neutral template,
not legal advice, and says nothing about what a late fee or collection step is
permitted to do where you are ([`reminders.mjs`](reminders.mjs)).

## Run

```sh
python3 -m http.server 8877 --directory ventures/invoice-payment-terms-calculator
```

Then open `http://localhost:8877`. There is no build step.

## Privacy and usage

Everything runs in your browser. Your amounts, dates, and drafts are never uploaded. There are no accounts, cookies, tracking pixels, or analytics vendors. The optional anonymous local counter records only feature names (`calculation`, `terms_copied`, `draft_saved`, `draft_loaded`, `early_pay_compared`, `factor_compared`, `settlement_projected`, `late_invoice_compared`, `late_invoice_draft_saved`, `late_invoice_draft_loaded`, `schedule_compared`, `schedule_copied`, `reminders_copied`, `reminders_downloaded`) and can be disabled in the footer. Saved drafts stay on this device.
## Safety

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, financial, or business advice, and it does not replace a qualified professional. It does not determine whether a late-fee term is permitted or enforceable, and it does not tell you to offer or withhold an early-pay discount or to factor an invoice. **You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken offline without notice. We do not promise uptime, backups of anything you type, or that a URL will keep working. Do not use this as a system of record. If a tool needs to survive, export your inputs and run it yourself.

Late-fee results are arithmetic scenarios, not a recommendation or a determination that a fee can be charged. Billing-schedule results are arithmetic scenarios from the numbers you enter; they are not a recommendation to ask for or waive a deposit, and not a prediction about any client.

The overdue comparison is arithmetic on recovery odds you type. It does not tell you to settle, escalate, or walk away, and it does not say what a late fee, a settlement, or a collection agency is permitted to do — those vary by jurisdiction and by the contract you signed.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and never changes what the tool does.

## Tests

```bash
node --test
```
