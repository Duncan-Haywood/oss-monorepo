# Moving Company Bid Calculator

A free browser calculator for local moving companies. It prices a job the way
the trade actually keeps a Saturday from losing money — inventory hours for a
first-floor short carry, then the extra trips stairs and a long carry create —
and shows the margin before the quote goes out.

**After using this, you can now see whether a cheap “3-bedroom for $800” quote
covers a third-floor walk-up**, which used to take a guess and a lost Saturday.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

Search page: [`how-much-to-charge.html`](how-much-to-charge.html).

```bash
# Serve it locally
npx http-server ventures/moving-bid-calculator -p 8080
# Run the tests
cd ventures/moving-bid-calculator && node --test
```

## The problem it solves

Local movers are told to bid by bedroom count. That rule cannot see the walk.
A 1,100 cu ft 3-bedroom on the first floor with a 20-foot carry is a different
job from the same furniture on a third-floor walk-up with an 80-foot carry:
the extra trips are hours, and hours are most of the cost. Matching a
bedroom-count quote on the wrong one is a Saturday the crew works at a loss.

The second thing that sinks these bids is treating stairs as a flat surcharge.
A studio on three flights is a few extra trips. A packed 3-bedroom on the same
stairs is many more. Pricing access from cubic feet — minutes per flight per
200 cu ft — is what makes the walk show up in the number.

## How it works

1. **Inventory hours.** Each row is a room or specialty item with cubic feet
   and clock hours for a first-floor, short-carry load and unload. Hours are
   crew clock time, not one-person hours.
2. **Access hours.** Stairs and long carry scale with cubic feet (more cubes,
   more trips). Elevator wait is flat: the crew sits through it together.
3. **Packing and drive.** Extra clock hours to pack, plus truck hours for the
   loaded run and any deadhead.
4. **Loaded labor.** Clock hours × crew size × wage × (1 + payroll burden %).
5. **Other direct cost.** Truck, fuel and tolls, materials, anything else.
6. **Overhead.** A percentage markup on that direct cost. It is not applied to
   itself or to profit.
7. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a share
   of price, not a markup on cost.

It then reports the numbers a mover sanity-checks a bid against: price per
cubic foot, effective hourly per mover, the share of the day that is access,
and the **walk-away price** — total job cost, below which the Saturday makes
nothing. Entering a bedroom-count quote already on the table scores it against
the same cost base and says plainly whether it is under water. **Copy bid
summary** turns the result into a plain-text draft ready to paste into a
proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency, so it is testable and auditable on its own. See
[`calc.test.mjs`](calc.test.mjs).

## Starting hours

The room and specialty-item types ship with common ballpark hours and cubic
feet as a starting point. **They are not an industry standard, a tariff, or a
guarantee.** Real times depend on the crew, the house, how packed it is, and
how much wrapping you actually do. Every hour and cube is editable, and
picking a type never overwrites a figure the mover has already changed — a
time from their own crew is worth more than any published figure.

## Privacy

Everything runs in your browser. Your data is never uploaded, and we don't
have accounts, tracking cookies, or an analytics vendor. We count anonymous
events (which features get used, nothing about who used them) — see
[Usage](#usage) to turn it off.

The only thing stored is an anonymous local tally of which features were used
and the current date, in `localStorage` under `moving-bid-usage` — never the
address, inventory, wages, costs, or prices. It is opt-out from the footer,
and it is skipped automatically when the browser sends Do Not Track or Global
Privacy Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

### Usage

Events counted: `bid_calculated`, `item_added`, `item_removed`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax handling; the mover enters their own numbers.
- One local-job model. Long-distance, interstate tariffs, and storage-in-transit
  are not priced separately yet.
- "Other room or item" rows are labelled `Item N` rather than a custom name.
- Hourly-vs-flat customer presentation is the mover's; this prices the job
  from hours, then reports one number.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, financial, or business
advice, and it does not replace a qualified professional. **You are
responsible for reviewing and verifying its output before relying on it**,
and for meeting any obligation it helps you prepare for. To the maximum
extent permitted by law, the authors accept no liability for any loss or
damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
