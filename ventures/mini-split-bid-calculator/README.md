# Mini-Split / Ductless Install Bid Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/mini-split-bid-calculator/>

A free browser calculator for HVAC installers. It prices a ductless
mini-split job the way the trade actually loses money — heads, then a
head-type and story factor, then line-set and electrical extras that a
per-head quote cannot see — and shows the margin before the price goes out.

**After using this, you can now price a second-story cassette with a 50 ft
line-set, a condensate pump, and a new 240 V circuit as a different job from
a first-floor 12k wall-mount with 15 ft of included line-set**, which used to
take a spreadsheet that still started from "$2,800 a head" and hid the extras.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/mini-split-bid-calculator -p 8080
# Run the tests
cd ventures/mini-split-bid-calculator && node --test
```

## The problem it solves

Homeowners shop mini-splits as a price per head or a price per ton. Equipment
mostly does scale that way. The line-set, the height, the head type, and the
electrical work do not. Fifty extra feet of line-set, a ceiling cassette, a
second story, a condensate pump, or a new 240 V circuit are hours and material
that stay roughly the same whether you hang one head or three. Matching a
cheaper per-head quote written for a first-floor wall-mount is how a sold job
becomes a loss.

The second thing that sinks these bids is payroll burden. An installer paid $42
costs more like $55 once employer taxes, workers' compensation, liability
insurance, and paid time off are counted. Pricing off the raw wage is short
before the first flare is made.

## How it works

1. **System size.** Head count × BTU per head. Not a rounded marketing ton.
2. **Indoor labor.** Heads × hours per head on an easy wall × head-type factor
   (wall, floor, cassette, concealed ducted) × story factor.
3. **Line-set extras.** Feet beyond what the equipment quote includes, as
   material plus hours per extra 10 ft — and those hours climb with the story.
4. **Outdoor labor.** Pad, mount, and whip. Not height-scaled; the outdoor
   unit stays at grade.
5. **Electrical extras.** Hours and material that do not scale with heads —
   a new circuit, a subpanel, or a relocated disconnect.
6. **Condensate.** Gravity, pump, or a long drain chase.
7. **Loaded labor.** Hourly wage × (1 + payroll burden %).
8. **Price.** Direct cost plus overhead, then ÷ (1 − target margin %), because
   margin is quoted as a share of price, not a markup on cost.

It then reports the numbers an installer sanity-checks a bid against: price
per head, dollars per kBTU, effective hourly billing rate, the cost split,
and the **walk-away price** — total cost, below which the job makes nothing.
Entering a price already on the table scores it against the same cost base.
**Copy bid summary** turns the customer-facing side into a plain-text draft.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

A short answer to the search query lives in
[`how-much-to-charge-to-install-a-mini-split.html`](how-much-to-charge-to-install-a-mini-split.html).

## Starting rates

Head-type factors, story factors, and electrical extras ship with common
ballpark figures. **They are not an industry standard, a benchmark, or a
guarantee.** Real hours depend on the crew, the wall, the line-set path, and
the AHJ. Every rate is editable, and picking a preset never overwrites a
number the installer has already changed.

This tool is **not** an HVAC maintenance-contract calculator, a water-heater
replacement bid, an EV-charger install bid, or a standby-generator bid. It
prices a ductless indoor/outdoor pair plus the line-set, condensate, and
electrical work that pair actually requires.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `mini-split-bid-usage` — never the head count, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `system_preset_applied`, `head_type_changed`,
`story_changed`, `electrical_changed`, `condensate_changed`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax or rebate handling. Utility rebates and sales
  tax are the customer's or the accountant's — this prices the install.
- One outdoor unit as a single job. Multiple outdoors can be run as separate
  bids; they are not drawn as a site plan.
- No load calculation, Manual J, or refrigerant-handling certification.
  Output is arithmetic.
- Starting factors are ballpark, not timed from a specific crew.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, financial, engineering,
or electrical-code advice, and it does not replace a qualified professional.
It is not a load calculation, permit approval, or refrigerant-handling
determination. **You are responsible for reviewing and verifying its output
before relying on it**, and for meeting any obligation it helps you prepare
for. To the maximum extent permitted by law, the authors accept no liability
for any loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).

Free support is optional and never required:
[the project on GitHub](https://github.com/Duncan-Haywood/monorepo-projects).
