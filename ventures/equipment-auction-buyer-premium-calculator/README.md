# Equipment Auction Buyer's Premium Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/equipment-auction-buyer-premium-calculator/>

A free calculator for a farm, construction, or heavy-equipment auction
bidder. It turns a hammer price into the true out-the-door total — a
**buyer's premium** (capped per lot if the auction caps it), an
**online-bidding premium**, a **card surcharge**, **sales tax** on the full
purchase price (or an exemption), and a flat doc/title fee — and can solve
backward from a target all-in budget to the highest hammer price that stays
inside it. Entirely client-side; nothing is uploaded.

After using this, you can now **know the real cost of winning a lot before
you raise a paddle**, instead of mentally adding a flat percentage and
finding out afterward that the premium was capped, the online-bidding fee
stacked on top, or the tax applied to more than the hammer price.

## Why this exists

A bidder who adds "10%" in their head to a hammer price is usually wrong in
a specific, measurable direction: auction houses commonly cap the buyer's
premium per lot (so a flat percentage overstates the cost on an expensive
lot once the cap binds), charge a separate 2-3% premium for bidding through
their online platform instead of the floor, add a further card-processing
surcharge on the whole invoice, and — under most published terms — tax the
full purchase price including the premium, not the hammer price alone.
Missing any one of these moves the real total by real money.

## Try it

Open [`index.html`](index.html), enter the hammer price and the auction's
own published terms, then click **Calculate my total cost**. Enter a target
budget to also see the highest hammer price you can bid and stay inside it.
Use **Copy a shareable link** to send the scenario to a partner without
uploading anything — the numbers travel inside the link itself.

## What it calculates

All in [`calc.mjs`](calc.mjs), pure functions with no dependencies:

- **`analyzeAuction`** — stacks the buyer's premium (capped if a cap
  applies), the online-bidding premium, sales tax on the resulting purchase
  price (unless exempt), a card surcharge on the resulting invoice, and a
  flat doc/title fee, for a given hammer price. Returns dated, disclosed
  findings for every assumption the arithmetic makes (the cap binding, the
  online and card fees applying, which base sales tax is charged on, an
  unverified exemption).
- **Max-bid solve** — given a target all-in budget, solves in closed form
  (not by search) for the highest hammer price whose full cost stack does
  not exceed it, correctly handling the case where the premium cap binds at
  that price.

Every output is a **planning estimate to confirm against the specific
auction's own printed terms before you bid**, never a determination of what
a particular auction house, state, or lender actually charges.

## Disclaimers

This is not legal, tax, or financial advice, and it does not replace
confirming the exact terms with the auction house. Verify its output before
relying on it, the same as any free, best-effort tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy

Everything runs in your browser. The numbers you enter are **never
uploaded** — there is no server component at all. Anonymous feature events
(`auction_analyzed`, `example_loaded`, `link_copied`) are counted in
`localStorage` only, never transmitted, never tied to your identity. Do Not
Track and Global Privacy Control are honoured, and a button on the page
turns counting off entirely.

## Development

```sh
node --test
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The premium/fee/tax
stack and the max-bid solve are done and tested; no external user contact
has happened yet — see `kill_criteria` in `VENTURE.yaml`.
