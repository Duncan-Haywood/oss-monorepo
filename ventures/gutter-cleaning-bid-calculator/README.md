# Gutter Cleaning Bid Calculator

A free browser calculator for independent gutter-cleaning contractors. It
prices a visit the way the job actually takes time — each run of trough,
the story it sits on, the pitch, the guards, the debris, and every
downspout — and shows the margin before the quote goes out.

**After using this, you can now send a visit price (and an optional
spring-and-fall contract) that already includes two-story access, gutter
guards, and downspout flushes**, which used to take a guess on a
per-linear-foot number that hid the expensive runs.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/gutter-cleaning-bid-calculator -p 8080
# Run the tests
cd ventures/gutter-cleaning-bid-calculator && node --test
```

## The problem it solves

Gutter companies are told to bid by the linear foot. That rule cannot see
the house. A 150-foot ranch that is all one-story open trough is a
different job from 150 feet that includes a two-story rear and a screened
garage, because a second story is extra ladder moves and reach time, and
guards turn a scoop into a pick. Two houses of identical footage can
differ by more than 2× in labor, and labor is most of the cost. A
per-foot bid on the wrong one is a Saturday that pays less than the dump
ticket.

The second thing that sinks these bids is forgetting the stop. Travel,
setup, disposal, and a minimum charge are most of the price on a small
ranch. Contractors who only multiply footage by a dollar figure give the
small jobs away.

## How it works

1. **Per-run labor.** Each row is a gutter run with its own linear feet,
   story, pitch, guard type, debris, and downspout count. Minutes on the
   trough = (feet ÷ 10) × baseline minutes × story × pitch × guards ×
   debris. Downspouts add their own minutes, still multiplied by the
   story (a second-story leader takes longer to reach) but not by pitch
   or guards.
2. **Travel once.** Setup, walkaround, and pack-up are charged once per
   visit, not per run.
3. **Loaded labor.** Hourly wage × (1 + payroll burden %).
4. **Other direct cost.** Disposal and equipment for the visit.
5. **Overhead.** A percentage markup on that direct cost.
6. **Price.** Cost ÷ (1 − target margin %), then lifted to the minimum
   stop charge when the raw price would be lower. Margin is a share of
   price, not a markup on cost.
7. **Seasonal contract.** Visits per year of 2 is spring and fall; the
   annual total is the visit price times that count.

It then reports the numbers a contractor sanity-checks a bid against:
implied dollars per linear foot, effective hourly billing rate, the labor
split across runs, and the **walk-away visit price** — total visit cost,
below which the job makes nothing. Entering a price already on the table
scores it against the same cost base. **Copy bid summary** turns the
result into a plain-text draft ready to paste into a text or estimate.

The companion page
[`two-story-gutter-cleaning-cost.html`](two-story-gutter-cleaning-cost.html)
is the searchable explanation of why a second story is not twice the
footage.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Starting rates

The story, pitch, guard, and debris factors ship as common ballpark
multipliers. **They are not an industry standard, a benchmark, or a
guarantee.** Real times depend on the crew, the ladders, the landscaping,
and how packed the trough is. Every rate is editable. Time your own
crews and replace the baseline minutes-per-10-feet.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `gutter-cleaning-bid-usage` — never the house, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `run_added`, `run_removed`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax handling; the contractor enters their own numbers.
- One visit model. Gutter *repair*, guard *installation*, and roof-work
  add-ons are not priced separately yet.
- Difficulty factors are multipliers on a single baseline, not a library
  of timed houses.
- Day-rate or two-crew routing (several stops in one neighborhood) is
  not modelled.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, financial, or
engineering advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying
on it**, and for meeting any obligation it helps you prepare for. To the
maximum extent permitted by law, the authors accept no liability for any
loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
