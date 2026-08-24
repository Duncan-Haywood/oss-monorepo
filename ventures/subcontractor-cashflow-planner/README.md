# Subcontractor Cash Flow Planner

A free, private browser calculator for independent subcontractors who need to
know whether a project will create a working-capital gap before the invoice is
paid. Enter the invoice, upfront materials, weekly business burn, payment
terms, retention, late-payment buffer, and cash available. The planner shows
the expected collection day, cash needed before payment, and any funding gap.

**After using this, you can now** see the cash you need to bridge a subcontract
before ordering materials, **which used to take** a spreadsheet and a hopeful
guess.

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

The result is a timing scenario, not a prediction. It does not model taxes,
debt, staged billing, supplier credit, milestone approvals, or the date a
retention amount is released. Confirm contract terms and funding decisions
with a qualified accountant or adviser.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not legal, tax, financial, or accounting advice,
and it does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, and for meeting any
obligation it helps you prepare for. To the maximum extent permitted by law,
the authors accept no liability for any loss or damage arising from its use.

## Test

Run the calculation tests with:

```sh
node --test calc.test.mjs
```

MIT licensed; see [`LICENSE`](LICENSE).
