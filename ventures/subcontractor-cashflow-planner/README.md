# Subcontractor Cash Flow Planner

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/subcontractor-cashflow-planner/>

A free, private browser calculator for independent subcontractors who need to
know whether a project will create a working-capital gap before the invoice is
paid. Enter the invoice, materials, weekly business burn, payment terms,
retention, late-payment buffer, retention release timing, cash available, any
deposit, the terms your supply house gives you, and the rate you would pay to
borrow. The planner shows the expected collection day, retained cash release
day, cash needed before payment, any funding gap, what that gap costs to carry,
and how many further days of late payment the scenario survives.

**After using this, you can now** see the cash a subcontract needs, what
bridging it costs, and how much late payment it survives, **which used to take**
a spreadsheet and a hopeful guess.

## The three levers

A gap on its own is not a decision. These are the fields that move it, and the
tool exists to say which one is worth pulling on a given job:

- **Deposit or mobilisation payment.** Counts as cash in hand on day 0 and
  comes off the payment still due on terms. On the shipped defaults a 25%
  deposit closes the $1,900 gap outright.
- **Supplier terms.** What matters is not their length but whether they outlast
  the client. Paid on day 44, a net-30 materials invoice still leaves your
  account first and only shortens the borrowing window; a net-45 one falls due
  after the money lands and removes the need to bridge the materials at all.
- **The rate you would borrow at.** A $1,900 gap carried from day 26 to day 44
  at 12% costs about $6 — which usually reframes the gap as a financing
  question rather than a reason to decline. Interest accrues on the daily
  shortfall, which ramps up over the window, not on the peak gap for every day
  of it. It is simple interest and ignores draw fees, minimums, and factoring
  discounts, so read it as a floor.

The scenario also reports **how many further days of late payment it survives**
once it is covered. That figure can be zero while a surplus is showing: if the
materials invoice falls due the day after payment was expected, one day of slip
pulls the whole bill in ahead of the money.

## Run it

Open [`index.html`](index.html) directly, or serve this directory:

```sh
python3 -m http.server 8080
```

Then visit `http://localhost:8080/`. There is no build step, account, API key,
network request, or paid dependency. The calculation is deterministic and is
implemented in [`calc.mjs`](calc.mjs).

## Why this niche

This is for independent tradespeople and small subcontractors who may finish
work, buy materials, and pay weekly operating costs well before a general
contractor pays an invoice. Generic cash-flow spreadsheets rarely separate
payment terms, retention, and a late-payment buffer. Unlike a quote-margin
calculator, this tool answers *when can I afford to carry this project?* It is
not a scheduling, invoice collection, lending, or payment product.

## Privacy and usage

Everything runs in your browser. Drafts are saved only in local storage on the
device where you choose to save them. The optional usage counter records only
the event name (`scenario_planned` or `csv_exported`) in local storage, never
your inputs, output, identity, IP address, or content. It is visible,
off-switchable, and disabled automatically only by the checkbox you control.
There are no cookies, accounts, analytics vendors, or uploads.

## Limits and disclaimer

The result is a timing scenario, not a prediction. It models one invoice with
one materials bill; it does not model taxes, existing debt, staged or progress
billing, multiple overlapping jobs, milestone approvals, or whether a retention
amount is actually released on the day you enter. The financing cost is simple
daily interest on the shortfall and is not a quote: it ignores draw fees,
minimum charges, factoring discounts, and whether any credit is available to
you at all. Confirm contract terms and funding decisions with a qualified
accountant or adviser.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not legal, tax, financial, or accounting advice,
and it does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, and for meeting any
obligation it helps you prepare for. To the maximum extent permitted by law,
the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and
may be slow, broken, moved, or taken offline without notice. We do not
promise uptime, backups of anything you type, or that a URL will keep
working. Do not use this as a system of record. If a tool needs to
survive, export your inputs and run it yourself.

Optional support: [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
Refusing to sponsor does not change the calculator.

## Test

```sh
node --test
```

MIT licensed; see [`LICENSE`](LICENSE).
