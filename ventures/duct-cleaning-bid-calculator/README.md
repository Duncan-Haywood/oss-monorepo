# Duct Cleaning Bid Calculator

A free browser calculator for HVAC and air-duct-cleaning contractors. It
prices a whole-house cleaning the way the trade actually loses money —
the included one-system ranch, then extra air handlers, extra vents,
extra stories, crawl access, and a coil clean — and shows the margin
before the price goes out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/duct-cleaning-bid-calculator/

**After using this, you can now send a priced duct-cleaning bid with a
walk-away number**, which used to take a napkin estimate against a
published $99 special.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no
build step, no network calls, no accounts. Not yet deployed to a public
URL — publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is
ready to deploy as-is.

```bash
# Serve it locally
npx http-server ventures/duct-cleaning-bid-calculator -p 8080
# Run the tests
cd ventures/duct-cleaning-bid-calculator && node --test
```

## The problem it solves

Small duct-cleaning shops are shopped on a **$99 whole-house special**.
That rule cannot see the shape of the system. One furnace and ten vents
on a ranch is not the same job as a two-system colonial with extra
returns, a crawl, and an evaporator-coil clean. Matching the coupon is
how a sold colonial becomes a loss after the first extra air handler.

This is not HVAC maintenance (filters and tune-ups), dryer-vent
cleaning, restaurant hood / NFPA-96 work, a chimney sweep, or a
mini-split install. It prices an *air-duct cleaning* job.

## How it works

1. **Included ranch.** The advertised special already covers one system,
   about ten supply vents, one return, and one story.
2. **Extras as their own hours.** Extra air handlers, extra vents, extra
   returns, extra stories, crawl / tight-attic access, occupancy, coil
   clean, sanitizer, and heavy debris each have their own hour line.
3. **Loaded labor.** Hourly wage × (1 + payroll burden %).
4. **Materials.** A filter per system, bags and tape, sanitizer only
   when that flag is on, plus truck / vacuum time.
5. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as
   a share of price, not a markup on cost.

It then reports the numbers a contractor sanity-checks a bid against:
price per supply vent, effective hourly billing rate, the hour split,
and the **walk-away price** — total cost, below which the job makes
nothing. Entering a price already on the table scores it against the
same cost base. **Copy bid summary** turns the result into a plain-text
draft with wages omitted, ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Starting hours

The shipped hours are common ballpark figures to start from. **They are
not an industry standard, a NADCA certification, a benchmark, or a
guarantee.** Real rates depend on the crew, the vacuum, the house, and
how much is actually done on the visit. Every rate is editable, and
picking a job type never overwrites a rate the contractor has already
changed.

## Privacy

Everything runs in your browser. Your data is never uploaded, and we
don't have accounts, tracking cookies, or an analytics vendor. We count
anonymous events (which features get used, nothing about who used them)
— see [Usage](#usage) to turn it off.

## Usage

The only thing stored is an anonymous local tally of which features
were used and the current date, in `localStorage` under
`duct-cleaning-bid-usage` — never the house, wages, costs, or prices.
It is opt-out from the footer, and it is skipped automatically when the
browser sends Do Not Track or Global Privacy Control. See
[`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

## Discoverability

- Landing copy names the $99 special and the extra-system problem in
  the first sentence.
- SEO article:
  [`how-much-to-charge-for-duct-cleaning.html`](how-much-to-charge-for-duct-cleaning.html)
  (FAQPage + HowTo JSON-LD).
- `robots.txt` and `sitemap.xml` are crawlable.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty
of any kind, express or implied. It is not HVAC, indoor-air-quality,
mold, construction, legal, tax, or financial advice, and it does not
replace a qualified professional. **You are responsible for reviewing
and verifying its output before relying on it**, and for meeting any
obligation it helps you prepare for. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising
from its use.

Free and open source. Support via the
[project on GitHub](https://github.com/Duncan-Haywood/monorepo-projects)
is entirely optional and never changes what the tool does.
