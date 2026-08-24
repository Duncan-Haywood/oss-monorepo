# Change Order Margin Calculator

Price a construction or trade change order from the added labor, loaded wage,
materials, subcontractor cost, overhead, and target margin. The result gives a
target price, a walk-away cost floor, and a plain-text approval summary.

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
kind, express or implied. It is not financial or engineering advice, and it does
not replace a qualified professional. **You are responsible for reviewing and
verifying its output before relying on it**, and for meeting any obligation it
helps you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

MIT licensed. Publishing under the portfolio's public name remains owner-gated.
