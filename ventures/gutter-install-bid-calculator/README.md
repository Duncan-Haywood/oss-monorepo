# Gutter Install Bid Calculator

A free browser calculator for gutter shops. It prices a new gutter hang the
way the trade actually loses money — inside and outside miters, extra
downspouts past the included first two, extra downspout footage past ten
feet per drop, second-story hours, fascia repair, and tear-off as their
own hours — and shows the margin before the price goes out.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx --yes serve ventures/gutter-install-bid-calculator -p 8080
# Run the tests
cd ventures/gutter-install-bid-calculator && node --test
```

## The problem it solves

Small gutter shops are told to bid by a published "$4.50 a foot
installed" special, or by a coupon-site ranch price. That rule cannot
see the house extras. A 140-foot one-story 5-inch aluminum hang with
two included downspouts is not the same job as a 220-foot two-story
6-inch hang with extra drops, inside miters, forty feet of fascia, and
tear-off of the old system. The trip is the same. The hours are not.
Matching a cheaper special written for the brochure ranch is how a
sold two-story-and-fascia job becomes a two-day loss after the first
inside miter.

Gutter-*cleaning* calculators price stories and downspouts for a wash.
Gutter-*guard* calculators price mesh on an existing trough. Neither
prices a new hang.

After using this, you can now send a gutter-install price that already
includes corners, extra drops, stories, and fascia, which used to take
a guess from a published per-foot special.

## How it works

1. **Profile and stories.** A 5-inch one-story ranch hang is not a
   6-inch two-story colonial and is not a copper hang.
2. **Footage past the included drops.** The special includes a stated
   number of downspouts and a stated footage per drop. Everything past
   that is billed as its own hours. A shorter run than the included
   footage still prices — extra footage is zero, not an error.
3. **Corners, fascia, tear-off, and steep access as their own hours.**
   A ranch-only special is not a changeout package. Inside miters,
   fascia rot, and haul-away of the old trough are not blended into
   the trip.
4. **Loaded labor.** Hourly wage × (1 + payroll burden %).
5. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price, not a markup on cost.

It then reports the numbers a shop sanity-checks a bid against: price
per foot of gutter, effective hourly billing rate, the hour split, and
the **walk-away price** — total cost, below which the job makes
nothing. Entering a price already on the table scores it against the
same cost base. **Copy bid summary** turns the result into a
plain-text draft with wages omitted, ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Starting rates

The job, profile, and story presets ship with common ballpark hours
and material figures. **They are not an industry standard or a
water-management design.** Changing profile or stories never overwrites
a rate the shop has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `gutter-install-bid-usage` — never the house, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy
Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax handling; the shop enters their own numbers.
- One hang / one trip. A commercial box-gutter run, a copper half-round
  custom shop drawing, or a full roof-edge rebuild is not priced as a
  package.
- Starting hours are ballpark figures, not timed from a named crew.
- Does not price gutter *cleaning* or gutter *guards*.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not construction, legal, tax,
financial, or engineering advice, and it does not replace a qualified
professional. **You are responsible for reviewing and verifying its output
before relying on it**, and for meeting any obligation it helps you
prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
