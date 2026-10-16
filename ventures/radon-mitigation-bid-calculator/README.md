# Radon Mitigation Bid Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/radon-mitigation-bid-calculator/>

A free browser calculator for licensed radon mitigators. It prices a
sub-slab or crawl depressurization install the way the trade actually
loses money — the included footprint, then the extra suction pit, the
crawl membrane, a roof stack, a high-suction fan, a new circuit,
firestops, a permit, and a post-mitigation test as their own hours —
and shows the margin before the price goes out.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx --yes serve ventures/radon-mitigation-bid-calculator -p 8080
# Run the tests
cd ventures/radon-mitigation-bid-calculator && node --test
```

## The problem it solves

Small mitigation shops are told to bid a published radon special, or by
dollars per square foot of footprint. That rule cannot see the access
extras. A 1,200-square-foot walk-out basement with one suction and a
sidewall discharge is not the same job as a 2,400-square-foot
slab-and-crawl combo with two pits, a crawl membrane, a high-suction
fan, and a new circuit. The word "radon system" is the same. The hours
are not. Matching a cheaper per-square-foot quote written for the
brochure special is how a sold mixed-foundation job becomes a loss
after the first extra suction pit.

Basement-waterproofing calculators price wells, a pit, and discharge.
Foundation-repair calculators price access, extra shaft, and straps.
Attic-insulation calculators price blown-in bags. None of those price
a radon mitigation install.

After using this, you can now send a mitigation price that already
includes extra suction, membrane, and circuit hours, which used to
take a guess from a published special.

## How it works

1. **Included footprint.** A 1,200 sq ft include is not a 2,400 sq ft
   mixed foundation. Extra square feet over the include are their own
   hours.
2. **Access as its own hours.** Extra suction points and a crawl
   membrane do not scale with "a radon system is a radon system."
3. **Service extras.** Roof discharge, high-suction fan, new circuit,
   firestops, permit, and post-mitigation test are billed as their own
   hours and kits.
4. **Loaded labor.** Hourly wage × (1 + payroll burden %).
5. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price, not a markup on cost.

It then reports the numbers a mitigator sanity-checks a bid against:
price per square foot of footprint, effective hourly billing rate, the
hour split, and the **walk-away price** — total cost, below which the
job makes nothing. Entering a price already on the table scores it
against the same cost base. **Copy bid summary** turns the result into
a plain-text draft with wages omitted, ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Starting rates

The job, foundation, and fan presets ship with common ballpark hours
and kit figures. **They are not an industry standard, a radon design,
or a health determination.** Changing foundation or fan never
overwrites a rate the installer has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `radon-mitigation-bid-usage` — never the
address, wages, costs, or prices. It is opt-out from the footer, and it is
skipped automatically when the browser sends Do Not Track or Global Privacy
Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax handling; the installer enters their own numbers.
- One system. A whole-house HVAC retrofit, a heat-recovery ventilator,
  or a sub-membrane drain is not priced as a package.
- Diagnostic / communication testing is one rate; a county form is the
  installer's choice of permit fee, not a second model.
- Starting hours are ballpark figures, not timed from a named crew.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not radon, environmental, construction,
health, legal, tax, or financial advice, and it does not replace a qualified
professional. **You are responsible for reviewing and verifying its
output before relying on it**, and for meeting any obligation it helps
you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
