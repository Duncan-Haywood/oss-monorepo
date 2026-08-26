# Owner Operator Cost Per Mile Calculator

A free browser calculator for independent owner-operators. It costs a week of
running — loaded miles, deadhead, fuel, the truck note, insurance, and
per-mile reserves — and shows the all-in cost per mile plus the **loaded rate
that actually covers the empty ones**.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/owner-operator-cpm-calculator -p 8080
# Run the tests
cd ventures/owner-operator-cpm-calculator && node --test
```

## The problem it solves

After using this, you can now see whether a posted loaded rate covers *this
week's* empty miles and settlement, which used to take a spreadsheet that
most operators never finish before they book the load.

Brokers quote dollars per loaded mile. The truck burns diesel on every mile,
and the note is due whether the trailer is full. A $2.00 offer on 1,800
loaded miles with 450 empty miles is $3,600 gross — $1.60 per *total* mile
before factoring. After a 3% factor it is $1.55. If all-in cost is $1.57,
the load that looked 40 cents fat is underwater.

The second thing that sinks a week is treating last month's average CPM as
this week's number. Truck payment and insurance do not shrink when you run
1,600 miles instead of 2,400. Fixed cost per mile goes up; a rate that
covered the long week does not cover the short one.

This is a different job from an LTL *freight-class* estimator (that tool is
for shippers classifying freight). This page is for the person who owns the
truck and has to decide whether to take the load.

## How it works

1. **Total miles.** Loaded + empty. Empty includes deadhead, bobtail, and
   unpaid repositioning.
2. **Fuel.** Total miles ÷ MPG × diesel price. Fuel is incurred on every mile.
3. **Per-mile reserves.** Maintenance, tires, tolls, DEF, and anything else
   that follows miles.
4. **Weekly fixed cost.** Truck/trailer payment, insurance, permits/IFTA/ELD,
   and other monthly overhead, converted with 52/12 weeks — not a flat 4,
   which understates the note by about 8%.
5. **All-in CPM.** Weekly cost ÷ total miles.
6. **Break-even loaded rate.** Weekly cost ÷ loaded miles. That is the number
   that belongs next to a broker's quote.
7. **Optional offer.** Posted loaded rate minus factoring, scored against the
   same cost base. Optional target take-home solves for the loaded rate that
   leaves that much after costs and factoring. The result also shows how many
   loaded miles that offer must pay to cover this week's cost; it uses the
   settled rate after factoring, not the posted rate.
8. **Detention, layover, and lumper.** Same week twice: miles and the note
   only versus those settlement lines. Detention and layover can take the
   same factor as the miles. Unreimbursed lumper is extra weekly cost. On
   the starting week, $2.00 after 3% loses $32.96 miles-only; 6 hours at
   $50 minus a $75 lumper flips the week to +$183.04.

**Copy week summary** turns the result into plain text you can paste into a
note or a message to dispatch.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

[`deadhead-miles.html`](deadhead-miles.html) is the same conversion in
search-query words: how empty miles cut a loaded rate.
[`does-detention-pay-cover-the-wait.html`](does-detention-pay-cover-the-wait.html)
is the detention / lumper comparison.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `owner-operator-cpm-usage` — never miles, fuel prices,
the truck note, or offered rates. It is opt-out from the footer, and it is
skipped automatically when the browser sends Do Not Track or Global Privacy
Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `week_calculated`, `offer_compared`, `summary_copied`,
`accessorials_compared`.

## Limitations

- Single currency and no tax handling; the operator enters their own numbers.
- One week at a time. Multi-stop trips, detention, layover, and lumper fees
  are not modeled as their own lines — fold them into "other" if they matter
  this week.
- Starting figures are a typical solo dry-van week, not a benchmark.
- Factoring is a flat percent of gross. Some factors also charge a fuel-card
  or wire fee; put those in other fixed or other per-mile.

## Disclaimer

This free tool is not legal, tax, financial, or business advice, and it does
not tell anyone what rate to accept or what a lane should pay. Outputs are
arithmetic on the user's own inputs. Verify every figure against real fuel
receipts, insurance, and notes, and against a qualified professional, before
relying on it or booking a load. To the maximum extent permitted by law, the
authors accept no liability for loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
