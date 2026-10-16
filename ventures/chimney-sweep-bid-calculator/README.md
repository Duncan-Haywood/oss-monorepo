# Chimney Sweep Bid Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/chimney-sweep-bid-calculator/>

A free browser calculator for chimney sweeps and fireplace shops. It prices a
stop the way the trade actually loses money when they skip it — each flue
times the height and roof access, then creosote, inspection, travel, and
margin — and shows the walk-away number before a neighborhood special goes
out.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/chimney-sweep-bid-calculator -p 8080
# Run the tests
cd ventures/chimney-sweep-bid-calculator && node --test
```

After using this, you can now **quote a chimney from flue hours, stories, and
creosote instead of a flat house price**, which used to take a spreadsheet
that still hid the drive and the burden.

## The problem it solves

Sweeps are told to bid “the house.” That rule cannot see the stop. A
one-story gas fireplace is roughly forty minutes on an easy roof. A
three-story wood stove with glazed creosote, a camera pass, and a twelve-mile
drive is a half day plus chemical. Two addresses on the same street can
differ by 3× in labor, and labor is most of the cost. A $199 special on the
wrong one is a Saturday the sweep works at a loss.

The second thing that sinks these quotes is payroll burden and the round
trip. A sweep paid $28 often costs more than $36 once employer taxes,
roof-work workers’ compensation, liability, and paid time off are counted.
Twelve miles at 35 mph is forty minutes on the clock before anyone climbs.
Contractors who price off the raw wage and treat the drive as “in the
neighborhood” are short before they start.

## How it works

1. **Per-flue labor.** Each row is an appliance with its own quantity and
   hours for a Level 1 sweep on a single-story, easy roof.
2. **Height.** Stories multiply those sweep hours (2-story 1.35×, 3+ 1.75×).
   Roof access then adds a fraction on *every* on-site chimney hour — steep
   and snow-ice slow the whole stop, not just the first climb.
3. **Condition and extras.** Moderate or glazed creosote, Level 2 or camera
   inspection, and animal / nest removal add time per flue. Caps, dampers,
   and a smoke test add hours and parts.
4. **Travel and minimum.** Miles are a round trip. If on-site time would
   land under the minimum, the stop is padded to that minimum — the first
   hour of a tiny gas job still required the van.
5. **Loaded labor.** Hourly wage × (1 + payroll burden %).
6. **Price.** (Labor + consumables + chemical + parts + trip + other +
   overhead) ÷ (1 − target margin %), because margin is a share of the
   price the homeowner sees.

It then reports the numbers a sweep sanity-checks a quote against: price per
flue, effective hourly billing rate, the hour split across flues, and the
**walk-away price** — total cost, below which the job makes nothing. Entering
a price already on the table scores it against the same cost base and says
plainly whether it is under water. **Copy quote summary** turns the result
into a plain-text draft. **Copy share link** puts the same figures in the
page hash so the recipient computes the same profit the sender saw.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. Share encoding is an allowlist ([`share.mjs`](share.mjs)) so a
dropped field cannot silently change the quote. See the `*.test.mjs` files.

## Starting hours

The appliance types ship with common ballpark hours as a starting point.
**They are not a CSIA standard, an NFPA 211 table, a benchmark, or a
guarantee, and they are not a finding that any chimney is safe, clean, or
due for repair.** Real times depend on the crew, the roof, the flue, and
what is actually found on site. Every hour is editable, and picking an
appliance type never overwrites a time the sweep has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `chimney-sweep-bid-usage` — never the address, flue
count, wages, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
A share link encodes only the quote fields in the URL hash; it is not sent
to us. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `flue_added`, `flue_removed`,
`proposed_price_compared`, `summary_copied`, `share_copied`.

## Limitations

- Single currency and no tax handling; the sweep enters their own numbers.
- One stop, not a seasonal route or a multi-day masonry rebuild.
- Starting hours are ballpark, not timed from a particular crew or region.
- Access issues (locked gates, no ladder set-down, occupied flue) are not
  modelled beyond the roof-access factor and the other-cost field.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, financial, engineering,
or fire-safety advice, and it does not replace a qualified professional. It
is not a CSIA, NFPA 211, or insurance inspection, and it does not determine
that any chimney is safe to use. **You are responsible for reviewing and
verifying its output before relying on it**, and for meeting any obligation
it helps you prepare for. To the maximum extent permitted by law, the
authors accept no liability for any loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
