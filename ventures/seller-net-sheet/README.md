# Seller Net Sheet Calculator

A free seller net sheet for homeowners and listing agents. It shows **cash
at closing** after the loan payoff, listing-broker pay, optional
buyer-broker compensation, other concessions, title, transfer tax, and
prorations — then compares **two offers on the same house** and solves for
the sale price that hits a target net.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/seller-net-sheet/

Open [`index.html`](index.html) in a browser. The calculation is local and
works without an account, network request, or API key. It is arithmetic, not
a closing disclosure: enter the rates from your title/escrow estimate, and
verify them there.

**After using this, you can now see which offer leaves more cash — and the
list/sale price that produces a target net** — which used to mean waiting
on a title worksheet or treating “the higher offer” as the better one.

## Why it's different

Most “seller closing cost calculator” pages still treat commission as one
percentage. After the NAR settlement, that is the wrong model:

- **Listing-broker pay** is a contract between the seller and their broker.
- **Buyer-broker compensation** is a negotiated seller concession, a
  buyer-paid amount, or nothing. It is not automatically half of 5% or 6%.
- **Other seller concessions** (closing-cost help, repair credits) come out
  of the same proceeds.

A $425,000 offer that asks for 2.5% buyer-broker pay plus $8,000 in
closing help can net less than a cleaner $417,000 offer. This tool keeps
those lines separate and shows both nets on one page.

[Higher offer vs cleaner offer](offer-comparison.html) answers that search
question directly, and
[this calculator vs. Zillow's Home Sale Calculator](vs-zillows-home-sale-calculator.html)
covers the rougher, pre-offer estimate most sellers see first.

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, financial, or
real-estate advice, and it does not replace a qualified professional, title
company, escrow officer, or attorney. **You are responsible for reviewing
and verifying its output before relying on it**, and for meeting any
obligation it helps you prepare for. To the maximum extent permitted by law,
the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and
may be slow, broken, moved, or taken offline without notice. We do not
promise uptime, backups of anything you type, or that a URL will keep
working. Do not use this as a system of record. If a tool needs to
survive, export your inputs and run it yourself.

## Privacy and usage

Everything runs in your browser. Your prices, loan balances, and addresses
are never uploaded. There are no accounts, cookies, tracking pixels, or
analytics vendors. The optional local counter records only the event name
and day in your browser; it never records the inputs. Turn it off with the
checkbox in the footer, or your browser's Do Not Track / Global Privacy
Control setting.

## Support

The tool is free and full-featured. The
[project lives on GitHub](https://github.com/Duncan-Haywood/monorepo-projects);
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is entirely
optional and never changes what the tool does.

## Development

Pure ES modules, no build step, no dependencies.

```
node --test        # runs calc.test.mjs and usage.test.mjs
```

`calc.mjs` holds the net-sheet, walk-away price, offer-comparison, and
tax-proration-estimate arithmetic; `usage.mjs` holds the anonymous local
counter; `index.html` is the calculator UI, including the **Estimate it**
box under the Tax / HOA proration field, which turns the annual tax bill and
the days charged to the seller into a proration figure with one click
instead of asking the visitor to do the day-count division themselves.

Not yet deployed to a public URL — publishing under the portfolio's name is
owner-gated per `portfolio/DIRECTION.md` — but the page is ready to host as
static files.
