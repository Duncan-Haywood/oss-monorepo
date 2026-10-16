# Auto Glass Bid Calculator

A free browser calculator for independent auto-glass shops and mobile
technicians. It prices a windshield, door-glass, or back-glass replacement
the way the job actually costs — glass source, ADAS camera/sensor
calibration, mobile trip fee, and cash versus insurance billing — and flags
a bid where a required calibration was never actually priced.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/auto-glass-bid-calculator/

**After using this, you can now send a windshield bid that already includes
the calibration line**, which used to take a flat coupon-rate guess that
quoted the glass and quietly dropped the camera.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL under
the portfolio's own domain until the owner flips Pages/hosting settings — see
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is and is mirrored into the front-door tool catalogue.

```bash
# Serve it locally
npx http-server ventures/auto-glass-bid-calculator -p 8080
# Run the tests
cd ventures/auto-glass-bid-calculator && node --test
```

## The problem it solves

Most vehicles built since roughly 2018 carry a forward-facing camera, a
radar unit, or both mounted to or sighted through the windshield — lane-keep
assist, automatic emergency braking, adaptive cruise. Replacing the glass
moves that camera's aim even when the bracket looks untouched, so the
vehicle manufacturer specifies a calibration procedure: a dynamic road test,
a static in-shop procedure with target boards, or often both. A flat
"$249 windshield installed" coupon rate cannot see any of that — it prices
the part, not the job.

The trade's actual failure mode is not usually underpricing the glass. It is
quoting the calibration requirement and then never pricing it at all,
because the estimate sheet has a line for the windshield and nothing for the
camera. That is either a comeback the shop eats, or a vehicle that drives
away with a safety system reading the road incorrectly.

## How it works

1. **Glass position, source, and R&R hours.** Windshield, front door, rear
   door, or back glass, each with its own starting labor hours and
   trim/clip cost; OEM, OEM-equivalent aftermarket, or economy aftermarket,
   each with its own starting glass-cost tier.
2. **ADAS calibration, priced as its own line.** None, dynamic, static, or
   both — each with starting hours (your shop's labor: setup, target-board
   placement, the supervised road test) and a starting cost (a sublet fee to
   a calibration center or dealer, or the amortized cost of your own target
   equipment). If a calibration requirement is selected but both stay at
   zero, the bid is flagged **calibration required but not priced**.
3. **Mobile trip, billed once.** A trip fee and trip hours for a mobile job;
   neither applies in-shop, because the customer's own drive is not billed.
4. **Loaded labor, overhead, then price.** Whole-job hourly wage × (1 +
   payroll burden %), overhead as a markup on direct cost, price = cost ÷
   (1 − target margin %).
5. **Cash versus insurance, applied after the price.** A cash discount is
   applied to the target-margin price and reported as savings, never as a
   hidden markdown of the underlying cost. An insurance job instead splits
   the same price into what the customer's deductible covers and what gets
   billed to the insurer.

It then reports the numbers a shop sanity-checks a bid against: effective
hourly rate, the walk-away price (total cost), and which line — glass,
calibration, or trip — is carrying the job. Entering a price already on the
table scores it against the same cost base and says plainly whether it is
under water. **Copy bid summary** turns the result into a plain-text draft
ready to paste into a work order or a customer text.

The method is also written for search and assistants as
[`how-much-to-charge-for-adas-calibration.html`](how-much-to-charge-for-adas-calibration.html).

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Starting hours and costs

Position, source, and calibration ship with starting factors. **They are
not an industry standard, a parts catalog, or a calibration specification.**
Real cost depends entirely on the vehicle — a base sedan windshield and a
heated, acoustic, camera-bracket windshield for a luxury SUV are not the
same part, and calibration procedures are set by the manufacturer, not by
this tool. Every rate is editable. Replace every figure with your own
supplier invoice and calibration-center quote.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing
stored is an anonymous local tally of which features were used and the
current date, in `localStorage` under `auto-glass-bid-usage` — never the
vehicle, glass cost, wages, costs, or prices. It is opt-out from the
footer, and it is skipped automatically when the browser sends Do Not Track
or Global Privacy Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `proposed_price_compared`,
`summary_copied`, `share_link_copied`.

## Limitations

- Single currency and no state-specific insurance-billing rules; the shop
  enters its own numbers and negotiated network rates.
- One glass replacement at a time. A multi-vehicle fleet contract or a
  recurring windshield-replacement program is not modelled.
- No vehicle-specific glass-cost or calibration-procedure lookup — three
  glass-source tiers and four calibration buckets on purpose, so the
  estimator still has to check the actual vehicle.
- Not a chip-repair calculator, a collision-damage estimate, or a
  determination that any ADAS or safety system is functioning correctly
  after the work.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not automotive, legal, tax, financial,
or engineering advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying
on it**, and for meeting any obligation it helps you prepare for. It is not
a determination that any ADAS or safety system is functioning correctly
after the work. To the maximum extent permitted by law, the authors accept
no liability for any loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
