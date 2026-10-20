# Wedding Florist Proposal Calculator

Wedding and event florists can use this free browser-local calculator to price one proposal from the stem recipe up — buying whole wholesale bunches instead of loose stems, adding the shrink allowance before the rounding, marking up what is actually purchased, pricing design and on-site labour by the hour, and reporting the gross margin. **After using this, you can send a proposal knowing what the wholesale invoice will say, instead of marking up a stem count you never pay for.**

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/wedding-florist-proposal-calculator/

Open `index.html` directly, or serve this directory with `python3 -m http.server`. The deterministic calculation works with no account, API key, upload, or paid dependency.

## Three things a markup-on-recipe spreadsheet misses

- **Stems are sold in bunches, and a recipe is written in stems.** A recipe calling for 85 garden roses does not cost 85 &times; the per-stem price: garden roses arrive in bunches of ten, so the studio buys 100 and pays for 100. Repeat that across six varieties and the difference between "what the recipe calls for" and "what the invoice says" is real money — money a per-stem markup never recovers, because it was applied to a cost that was never paid. On this calculator's worked example that gap is $135 of cost and, at a 3.5&times; markup, $472.50 of quoted price.
- **A shrink allowance has to be bought before it can be rounded.** The usual shortcut adds the percentage to the line's cost at the end, which buys a fraction of a bunch — and no wholesaler sells one. It is wrong in both directions: on 100 stems of a ten-stem variety the allowance genuinely needs a whole eleventh bunch and a 5% cost bump does not pay for it, while on 95 stems the allowance already fits inside the ten bunches the recipe forced and the same 5% pads the quote for nothing. Shrink is therefore added to the stem count first, and the bunch rounding happens on the result.
- **Pricing labour as a percentage of flowers breaks on installs.** The trade rule of thumb — labour is roughly a third of the flower total — holds for a bouquets-and-centrepieces event, where hours track stems. It fails on an arch, an installation, or a late strike, which take hours and comparatively few stems. This calculator prices labour by the hour and reports what the percentage rule would have quoted beside it, so the gap is a number rather than a surprise. The rule never changes the total.

## What it reports

- **The proposal total**, decomposed into flowers, hard goods, design labour, on-site labour, delivery, and any top-up to the studio's event minimum.
- **The bunch-rounding gap**, both as cost and as the larger figure it becomes once the markup is applied to it — the number the whole tool exists for.
- **Gross profit and gross margin**, subtracting only the cash that actually leaves the studio: flowers at purchase cost, hard goods, and freelance crew payouts. Your own billed design hours are revenue, not a cost.
- **Flowers as a share of what the client pays**, the ratio most studios watch alongside margin.
- **Four flags**: a positive bunch-rounding gap, an install-heavy event the percentage rule under-prices, a proposal below the event minimum, and a margin below the studio's target.

## Sharing a proposal

Thirty-five figures is more than anyone reads down a phone, so *Copy shareable link* puts the whole proposal in the page's URL fragment. A fragment is never sent in a request line or a `Referer` header, which matters more here than on most calculators: wholesale costs and markup multiples are commercially sensitive. Whoever holds the link can read the numbers in it, so send it the way you would send the numbers themselves. Opening a link replaces *every* field, including the ones the link did not carry — see `share.mjs` for why that is the supported way in.

## Privacy

Everything runs in the browser. There is no account, no upload, and nothing is saved when the tab closes. Usage counting tallies anonymous local feature events only (`proposal-priced`, `rounding-gap-shown`, `link_copied`, `sponsor_link_clicked`), records no prices, recipes, or client details, and is turned off automatically by Do Not Track or Global Privacy Control — or by the button on the page.

## Tests

```
node --test ventures/wedding-florist-proposal-calculator/*.test.mjs
```

`calc.test.mjs` covers the arithmetic, including the pair of cases that show why a cost-percentage shrink allowance is wrong in both directions. `page.test.mjs` checks that the page and the arithmetic have not drifted apart — every field, every default, every FAQ answer, and the accessible name on each of the eighteen stem-line inputs. `content-pages.test.mjs` checks the comparison page, including the three worked figures it quotes, against the calculator that produces them.

## Limitations

This is planning arithmetic, not an audited statement or a contract. It does not add sales tax, income tax, card fees, or studio overhead unless you fold those into your rates. It prices one event; it does not hold dates, order flowers, or track a season. Wholesale availability and price move week to week, so a quote built on last season's bunch cost is yours to refresh. Six stem lines cover an ordinary wedding recipe; a larger event is priced by grouping varieties, which is a real limit rather than a rounding of one.
