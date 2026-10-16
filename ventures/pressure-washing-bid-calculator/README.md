# Pressure Washing Bid Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/pressure-washing-bid-calculator/>

A free browser calculator for pressure-washing and soft-wash contractors. It
prices a job the way the trade actually runs one — each surface divided by
its own production rate, plus the drive and the setup a flat per-square-foot
quote cannot see — and shows the after-travel hourly before the price goes
out.

**After using this, you can now send a bid that includes travel, setup, and
the house-siding hours hiding behind a driveway call**, which used to take a
scratch pad that quietly dropped the drive.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

Search page: [`how-much-to-charge.html`](how-much-to-charge.html).

```bash
# Serve it locally
npx http-server ventures/pressure-washing-bid-calculator -p 8080
# Run the tests
cd ventures/pressure-washing-bid-calculator && node --test
```

## The problem it solves

Homeowners call about the driveway. The driveway is the fast part. A 1,200 sq
ft concrete pad at 1,000 sq ft per hour is a little over an hour; the 2,200
sq ft house wash at 500 sq ft per hour is four. A blended "we charge $0.20 a
foot" quote prices those as the same work.

The second thing that sinks these bids is the drive. Forty minutes each way
plus twenty minutes of setup is a billed hour that never touches a surface.
On a small job that hour is most of the day, and the on-site hourly the
contractor quotes themselves looks fine while the after-travel hourly is
minimum wage. This calculator reports both, so the drive is visible before
the text goes out.

## How it works

1. **Per-surface labor.** Each row is a surface with its own square footage,
   production rate (sq ft per technician-hour), and chemical dollars. Wash
   hours = square feet ÷ production rate.
2. **Travel and setup.** Round-trip minutes and setup minutes become hours.
   Total hours = wash + travel + setup. Those hours are all paid.
3. **Loaded labor.** Hourly wage × (1 + payroll burden %).
4. **Other direct cost.** Chemicals, water / meter, equipment wear and fuel,
   and anything else billed to this job.
5. **Overhead.** A percentage markup on that direct cost. It is not applied
   to itself or to profit.
6. **Price.** Cost ÷ (1 − target margin %), then the greater of that number
   and the minimum job. A $40 pad still has to cover showing up.
7. **After-travel hourly.** Bid ÷ total hours — the rate they actually keep
   after the drive. The on-site hourly (bid ÷ wash hours) is shown next to it
   so the gap is obvious.
8. **Rate card.** What they would have to bid to keep $40 / $50 / $60 / $75
   per hour after travel.
9. **Maintenance package.** Optional: a yearly visit count and a discount off
   the one-time bid, so a quarterly house-wash plan has a number.

Entering a price already on the table scores it against the same cost base
and says plainly whether it is under water, under the minimum, or fine. Copy
bid summary puts a paste-ready text on the clipboard for a text or email.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Production rates

The surface types ship with common ballpark rates as a starting point. **They
are not an industry standard, a benchmark, or a guarantee.** Real rates
depend on the equipment, the soil, storey height, dwell time, and how much
hand work the job actually needs. Every rate is editable, and picking a
surface never overwrites a rate or chemical figure the contractor has already
changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `pressure-washing-bid-usage` — never the address,
surfaces, wages, costs, or prices. It is opt-out from the footer, and it is
skipped automatically when the browser sends Do Not Track or Global Privacy
Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `surface_added`, `surface_removed`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax handling; the contractor enters their own numbers.
- One-technician model. A two-person crew is not split out as a second wage.
- No weather / reclean guarantee reserve as its own line — fold it into
  "other cost" or the minimum.
- Starting chemical dollars are a square-foot estimate from the preset, not
  a recipe (no SH percentage, no dwell time).

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, financial, engineering,
or business advice, and it does not replace a qualified professional. **You
are responsible for reviewing and verifying its output before relying on
it**, and for meeting any obligation it helps you prepare for. To the
maximum extent permitted by law, the authors accept no liability for any
loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).

Optional support via the [GitHub repository](https://github.com/Duncan-Haywood/monorepo-projects)
never changes what the tool does.
