# Change Order Margin Calculator

Price a construction or trade change order from the added labor, loaded wage,
materials, subcontractor cost, schedule delay, overhead, and target margin. The
result gives a target price, a walk-away cost floor, what your contract's
markup cap actually leaves you, and a plain-text approval summary.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/change-order-margin-calculator/

## The two lines that decide a change order

Change orders are lost where they are priced, not where they are worked, and
both of these were previously absent:

- **Extended general conditions.** Added scope that pushes the schedule keeps
  the supervisor, the trailer, and the rented plant on site for days nobody
  billed. Enter days added and a daily rate; it is treated as a direct cost, so
  overhead and margin carry on it like any other. Three days at $450 turns the
  shipped $630 change order into $1,980 of direct cost and moves the target
  price from $866.25 to $2,722.50.
- **The contract's markup cap.** Most contracts cap change-order markup, which
  means the target margin you enter may not be available to you at all. The cap
  applies to cost while your own overhead comes out of the same allowance, so a
  10% cap against 10% overhead earns exactly nothing -- on the shipped defaults
  the cap and the $693.00 walk-away floor are the same number. At a 5% cap the
  most you may bill is $661.50 and every change order under that contract is a
  loss, which the page says before you have entered a proposed price, because
  it is a fact about the contract rather than about the price.

Both default to zero, so a contract with no cap on work that fits the existing
schedule prices exactly as it did before, and every figure in
[`how-to-price-a-change-order.html`](how-to-price-a-change-order.html) still
holds.

Open [`index.html`](index.html) directly or serve this directory statically.
It has no dependencies, accounts, network calls, or paid APIs.

```bash
cd ventures/change-order-margin-calculator && node --test
```

## Why it exists

When a customer changes scope, a contractor often prices the extra work from a
quick guess. That guess can omit payroll burden, material purchases, or office
overhead. **After using this, you can send a defensible change-order price with
its cost floor and expected margin, which used to take a spreadsheet and a
second pass.**

The tool is deliberately not a contract generator or a promise that a customer
will approve the work. Copy the summary, verify the quantities and schedule,
and get written approval before doing changed work.

## Privacy and usage

Everything runs in the browser. Inputs never leave the device. There are no
accounts, cookies, tracking pixels, or analytics vendors. An opt-out local tally
counts only `change_order_calculated` and `summary_copied` events; it never saves
the job title, price, or other content. DNT and GPC disable counting.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not financial, engineering, or construction advice, and it does
not replace a qualified professional. **You are responsible for reviewing and
verifying its output before relying on it**, and for meeting any obligation it
helps you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

MIT licensed. Publishing under the portfolio's public name remains owner-gated.
