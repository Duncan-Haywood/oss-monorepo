# Storage Auction Max Bid Calculator

Storage-unit lien-auction bidders — the "storage wars" resale hobbyists and small-business flippers who buy an abandoned unit's contents sight-mostly-unseen — can use this free browser-local calculator to price a bid from the real cost stack instead of a flat rule of thumb. **After using this, you can walk into an auction knowing the exact hammer bid your target margin supports, instead of guessing at a percentage of what the contents might be worth.**

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/storage-auction-max-bid-calculator/

Open `index.html` directly, or serve this directory with `python3 -m http.server`. The deterministic calculation works with no account, API key, upload, or paid dependency.

## Three things the "bid X% of what it's worth" rule gets wrong

- **The winning bid is not the purchase price.** Every major lien-auction platform (StorageTreasures, Lockerfox, and most in-person auctioneers) charges a buyer's premium on top of the hammer price — commonly 10-15%. A bidder who treats their walk-away number as "what I'll pay" is quietly bidding past it every time. On this calculator's worked example, a $50 hammer bid at a 12% premium is a $56 purchase.
- **"What it's worth" and "what it nets you" are different numbers, twice over.** A flat percentage is usually applied to an eyeballed retail value. Liquidating a stranger's unit on a deadline realizes a fraction of that as used goods with no provenance, and whatever it does fetch is then cut again by the resale channel's own fees. On the default $4,000 retail estimate, a realistic 35% recovery and 15% blended resale fees net $1,190 — not $4,000, and not even the $1,400 before fees.
- **Cleanout has its own cash cost, and it does not scale with the contents' value.** Dump loads, a truck, labor hours, and months of holding cost to resell through are the same rough size whether the unit holds antiques or a sofa nobody wants. A percentage-of-value rule has no room for a fixed cost stack at all — which is exactly backwards on a small or hard-to-sell unit, the outcome you cannot rule out sight-unseen. On the worked example that stack is $650, more than half of the $1,190 net resale revenue before a single dollar is bid.

Put together, the default worked example's flat 20%-of-value rule says bid up to $800 — well past the unit's own $482.14 break-even bid, a guaranteed loss before cleanout even starts. The real math supports a $57.14 hammer bid at a 40% target margin.

## What it reports

- **The max bid at your target margin** — the headline figure, and the one this tool exists to replace a flat percentage with.
- **The break-even bid**, separately: the absolute ceiling past which every extra dollar bid is a loss, regardless of how thin the deal gets above your target margin.
- **The rule-of-thumb bid**, priced for comparison, and the gap against it — showing directly whether the flat percentage overshoots break-even or leaves real money on the table.
- **Total out-of-pocket, profit, and margin at your actual planned bid**, including the buyer's premium on top of the hammer price.
- **Cleanout wall-clock time**, dividing total labor person-hours by crew size and checking it against the facility's own removal window, so a deposit-forfeiture risk is a number you see before you bid.
- **Five flags**: no profitable bid exists at these numbers, the naive rule exceeds break-even, a planned bid that guarantees a loss, one that merely misses the target margin, and a cleanout that will not fit the facility's window.

## Sharing a worksheet

Seventeen figures is more than anyone reads down a phone, so *Copy shareable link* puts the whole worksheet in the page's URL fragment. A fragment is never sent in a request line or a `Referer` header. Opening a link replaces *every* field, including the ones the link did not carry — see `share.mjs` for why that is the supported way in.

## Privacy

Everything runs in the browser. There is no account, no upload, and nothing is saved when the tab closes. Usage counting tallies anonymous local feature events only (`bid-calculated`, `overbid-warning-shown`, `link_copied`, `sponsor_link_clicked`), records no values, bids, or unit details, and is turned off automatically by Do Not Track or Global Privacy Control — or by the button on the page.

## Tests

```
node --test ventures/storage-auction-max-bid-calculator/*.test.mjs
```

`calc.test.mjs` covers the arithmetic, including the break-even vs. target-margin split, the buyer's-premium add-on, the naive-rule comparison in both directions (overshoot and undershoot), and the cleanout-window deposit risk. `page.test.mjs` checks that the page and the arithmetic have not drifted apart — every field, every default, every FAQ answer, and the accessible name on each input. `usage.test.mjs` covers the opt-in/opt-out usage counter and scans every module for a network primitive, since "nothing leaves your device" is a claim about the source, not just the prose.

## Limitations

This is planning arithmetic, not an appraisal or a guarantee of resale. It cannot see inside the unit — the recovery rate, dump loads, and cleanout hours are all your own estimate from the doorway, and the tool is only as good as that estimate. It does not know a given facility's or state's own lien-sale terms, removal window, or deposit policy, which vary by operator and by law; verify those directly before you bid. It does not add sales tax, income tax, or the time spent researching and listing items beyond the hourly labor rate you enter, and it does not place a bid for you.
