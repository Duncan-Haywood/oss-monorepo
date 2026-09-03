# Exterior Painting Bid Calculator

A free browser calculator for exterior painting contractors. It prices a
two-coat repaint, scrape-and-prime, bare-wood, or elastomeric masonry
job the way the trade actually loses money — the included one-story
ranch, then the extra story, the extra elevation square footage, extra
trim, shutters, a scrape of failing paint, a primer coat,
occupied-home protection, and hard second-story access as their own
hours — and shows the margin before the price goes out.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx --yes serve ventures/exterior-painting-bid-calculator -p 8080
# Run the tests
cd ventures/exterior-painting-bid-calculator && node --test
```

## The problem it solves

Small painting shops are told to bid a published $3,999 house special,
or to match a "$1.50/sqft of wall" rule. That rule cannot see the
access extras. A one-story ranch with 1,800 square feet of sound
existing paint is not the same job as a two-story colonial with 2,800
square feet of elevation, 240 feet of trim, occupied landscaping, and
hard second-story access. The word "paint the house" is the same. The
hours are not. Matching a cheaper ranch quote written for the brochure
house is how a sold colonial becomes a loss after the first extra
story.

Interior-painting calculators price rooms, walls, and ceilings.
Cabinet-refinishing calculators price doors and drawers. None of those
price an exterior paint *job*.

After using this, you can now send a paint price that already includes
extra stories, extra elevation, and scrape hours, which used to take a
guess from a published special.

## How it works

1. **Included ranch elevation.** A 1-story, 1,600 sf include is not a
   2-story, 2,800 sf colonial. Extra stories and extra elevation over
   the include are their own hours.
2. **Access as its own hours.** Extra stories, extra elevation, and
   hard second-story access do not scale with "a house is a house."
3. **Service extras.** Extra trim, shutters, a scrape of failing
   paint, a primer coat, and occupied-home protection are billed as
   their own hours and materials.
4. **Loaded labor.** Hourly wage × (1 + payroll burden %).
5. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price, not a markup on cost.

It then reports the numbers a shop sanity-checks a bid against:
price per elevation square foot, effective hourly billing rate, the
hour split, and the **walk-away price** — total cost, below which the
job makes nothing. Entering a price already on the table scores it
against the same cost base. **Copy bid summary** turns the result into
a plain-text draft with wages omitted, ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Starting rates

The job and system-type presets ship with common ballpark hours
and paint figures. **They are not an industry standard, a lead-paint
determination, or a building-code inspection.** Changing job type
never overwrites a rate the shop has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `exterior-painting-bid-usage` — never the
address, wages, costs, or prices. It is opt-out from the footer, and it is
skipped automatically when the browser sends Do Not Track or Global Privacy
Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax handling; the shop enters their own numbers.
- One elevation. A whole-building commercial facade, a historic
  restoration, or a lead-abatement package is not priced as a package.
- Hard access is one hour line; a county fall-protection form is the
  shop's choice of permit, not a second model.
- Starting hours are ballpark figures, not timed from a named crew.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not construction, painting,
lead-paint, building-code, legal, tax, or financial advice, and it does
not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, and for
meeting any obligation it helps you prepare for. To the maximum extent
permitted by law, the authors accept no liability for any loss or
damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
