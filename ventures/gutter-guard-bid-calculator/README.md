# Gutter Guard Bid Calculator

A free browser calculator for gutter shops. It prices a screen, foam,
reverse-curve, or micromesh install the way the trade actually loses
money — the included one-story ranch, then the extra story, the extra
lineal feet, extra miters, extra downspouts, a clean-first pass,
fascia repair, steep-roof access, and occupied landscaping as their
own hours — and shows the margin before the price goes out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/gutter-guard-bid-calculator/

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx --yes serve ventures/gutter-guard-bid-calculator -p 8080
# Run the tests
cd ventures/gutter-guard-bid-calculator && node --test
```

## The problem it solves

Small gutter shops are told to bid a published $8/foot leaf-filter
special, or to match a Home Depot DIY micromesh price. That rule
cannot see the access extras. A one-story ranch with 140 feet of
empty 5" K-style is not the same job as a two-story colonial with
220 feet of micromesh, packed leaves, and rotten fascia. The word
"gutter guard" is the same. The hours are not. Matching a cheaper
screen quote written for the brochure ranch is how a sold mesh job
becomes a loss after the first extra story.

Gutter-*cleaning* calculators price a seasonal debris flush. Roofing
calculators price squares and a reroof. None of those price a
gutter-guard *install*.

After using this, you can now send an install price that already
includes extra stories, extra feet, and micromesh hours, which used
to take a guess from a published special.

## How it works

1. **Included ranch run.** A 1-story, 120 ft include is not a
   2-story, 220 ft colonial. Extra stories and extra feet over the
   include are their own hours.
2. **Access as its own hours.** Extra stories, extra feet, and a
   steep roof do not scale with "a gutter is a gutter."
3. **Service extras.** Extra miters, extra downspouts, a clean-first
   pass, fascia repair, and occupied-home landscaping are billed as
   their own hours and kits.
4. **Loaded labor.** Hourly wage × (1 + payroll burden %).
5. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price, not a markup on cost.

It then reports the numbers a shop sanity-checks a bid against:
price per foot, effective hourly billing rate, the hour split, and
the **walk-away price** — total cost, below which the job makes
nothing. Entering a price already on the table scores it against the
same cost base. **Copy bid summary** turns the result into a
plain-text draft with wages omitted, ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Starting rates

The job and system-type presets ship with common ballpark hours
and coil figures. **They are not an industry standard, a leak
warranty, or a building-code determination.** Changing system type
never overwrites a rate the shop has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `gutter-guard-bid-usage` — never the
address, wages, costs, or prices. It is opt-out from the footer, and it is
skipped automatically when the browser sends Do Not Track or Global Privacy
Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax handling; the shop enters their own numbers.
- One elevation. A whole-building commercial fascia, a copper custom
  system, or a buried-downspout rebuild is not priced as a package.
- Steep-roof access is one hour line; a county fall-protection form
  is the shop's choice of permit, not a second model.
- Starting hours are ballpark figures, not timed from a named crew.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not construction, roofing,
building-code, legal, tax, or financial advice, and it does not
replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, and for
meeting any obligation it helps you prepare for. To the maximum extent
permitted by law, the authors accept no liability for any loss or
damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
