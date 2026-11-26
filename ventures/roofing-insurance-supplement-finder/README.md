# Roofing Insurance Supplement Finder

A free browser tool for roofing contractors and homeowners after a storm claim.
Type the quantities from a roof measurement report beside the quantities on the
adjuster's estimate, plus your own unit prices. It prices the gap line by line and
shows what the claim pays now and on completion. Entirely client-side; no policy or
homeowner information is asked for.

**Live tool:** https://marisstella.app/roofing-insurance-supplement-finder/

After using this, you can **see what an estimate left out in dollars, argue the
measurement gaps and the price gap separately, and see what you keep after a
supplement service's fee**.

## Try it

Open [`index.html`](index.html) and click **Find the gap**.

## The model

[`calc.mjs`](calc.mjs), pure functions, no dependencies.

- Shingle field: squares needed = net squares x (1 + waste). Squares short are priced at
  your price per square; the estimate's lower price is a separate price gap on the squares
  it does pay. A lower price of yours is never a negative gap.
- Eleven checked lines (starter, drip edge, ridge cap, ice and water, underlayment,
  flashing, pipe jacks, steep and high charges, haul-off, permit): gap = (measured - on
  estimate) x your price, only where the estimate is short. Lines where the estimate is
  more generous are listed but not netted.
- Supplement = shingle gap + short lines, plus overhead and profit (added, not compounded,
  and only if switched on) plus tax on the material share.
- Claim payments: straight-line depreciation (age over life, capped), ACV paid first less
  the deductible, depreciation released on completion only if recoverable. The supplement is
  scaled by the share you expect accepted.
- Net kept = supplement x accepted share x (1 - service fee), over a 4x4 grid.

## Limits

Defaults are placeholders, not benchmarks. This is arithmetic, not insurance, legal or
public-adjuster advice; it does not say what a policy covers, whether O&P applies, or who may
negotiate a claim for a homeowner in your state. Real depreciation is set by the carrier.

## Known gaps

From the 2026-11-26 quality audit
([`portfolio/quality/audits/2026-11-26-roofing-insurance-supplement-finder.json`](../../portfolio/quality/audits/2026-11-26-roofing-insurance-supplement-finder.json)):

- One blended tear-off-plus-install price per square is applied to the squares
  needed, waste included. Estimating software prices removal on the net roof area
  and adds waste only to the install line, so the request can be overstated.
  Fixing it needs a separate tear-off rate on net squares.
- The shingle split prices the missing squares at your price and the price gap on
  the adjuster's squares only. Splitting it the other way (missing squares at the
  estimate's price, price gap on every square needed) gives the same total but
  different halves; the page does not say which convention it uses.
- Starter, drip edge and ice barrier are typed in, not derived from eave and rake
  lengths, and are not flagged as code items (IRC 2021 R905.2.8.5, R905.1.2). Steep
  slope is one tier, and there are no line codes or export.

## No warranty

Provided free and as-is, without warranty of any kind. You are responsible for verifying its
output before relying on it. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

## Privacy and usage

Nothing leaves your browser. Anonymous feature counts (`gap_run`, `example_loaded`) are kept
in local storage only, and can be turned off on the page; Do Not Track and Global Privacy
Control are honoured.

Support is optional: [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).

## Tests

`node --test`
