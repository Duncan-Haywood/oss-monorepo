# Well Pump Bid Calculator

A free browser calculator for well-service and plumbing shops. It prices
a well-pump replacement the way the trade actually loses money — extra
drop-pipe footage past the included run, a seized pitless versus one
that comes apart, a stuck-pump pull, extra well cable, a new pressure
tank, and a constant-pressure drive as their own hours — and shows the
margin before the price goes out.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx --yes serve ventures/well-pump-bid-calculator -p 8080
# Run the tests
cd ventures/well-pump-bid-calculator && node --test
```

## The problem it solves

Small well-service shops are told to bid by a published "$1,495 well-pump
special," or by a coupon-site pump-swap price. That rule cannot see the
well extras. A 60-foot 1/2 HP submersible with a pitless that comes
apart is not the same job as a 280-foot 1.5 HP pull with a seized
adapter, a stuck pump, 300 feet of well cable, a new tank, and a
constant-pressure drive. The trip is the same. The hours are not.
Matching a cheaper special written for the brochure shallow well is how
a sold deep-well job becomes a half-day loss after the first seized
adapter.

Water-heater calculators price a vent, a gas upsize, and an attic.
Septic-pumping calculators price a tank lid, a hose, and extra gallons.
Hydro-jet calculators price a drain line and a toilet pull.
Electrical-panel calculators price a feeder and a utility. None of
those price a well.

After using this, you can now send a well-pump price that already
includes extra footage, pitless, tank, and stuck-pull hours, which used
to take a guess from a published special.

## How it works

1. **Pump type and horsepower.** A jet pump is not a submersible and a
   1/2 HP swap is not a 1.5 HP pull.
2. **Footage past the included run.** The special includes a stated
   number of feet. Everything past that is billed as its own hours. A
   shallower well than the included footage still prices — extra
   footage is zero, not an error.
3. **Pitless and stuck pull as their own hours.** A pitless that
   unscrews is free access. A seized adapter and a stuck pump are not.
4. **Loaded labor.** Hourly wage × (1 + payroll burden %).
5. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price, not a markup on cost.

It then reports the numbers a shop sanity-checks a bid against: price
per foot of well depth, effective hourly billing rate, the hour split, and
the **walk-away price** — total cost, below which the job makes
nothing. Entering a price already on the table scores it against the
same cost base. **Copy bid summary** turns the result into a
plain-text draft with wages omitted, ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Starting rates

The job, type, horsepower, work, and pitless presets ship with common
ballpark hours and material figures. **They are not an industry
standard, a well-drilling specification, or a water-quality report.**
Changing type, horsepower, work, or pitless never overwrites a rate the
shop has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `well-pump-bid-usage` — never the house, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy
Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax handling; the shop enters their own numbers.
- One well / one trip. A new well, a well rehabilitation, or a whole-
  house re-pipe is not priced as a package.
- Horsepower is one pump cost each; two-wire versus three-wire, control
  boxes, and constant-pressure brands are the shop's choice of rate, not
  a second model.
- Starting hours are ballpark figures, not timed from a named crew.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not plumbing, well-drilling,
construction, legal, tax, or financial advice, and it does not replace a
qualified professional. **You are responsible for reviewing and verifying
its output before relying on it**, and for meeting any obligation it helps
you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
