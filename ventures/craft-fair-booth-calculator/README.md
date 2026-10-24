# Craft Fair Booth Calculator

Makers who sell at craft fairs, farmers markets, art festivals, and holiday markets can use this free browser-local calculator to decide whether one booth is worth taking — what the day has to sell to break even, what share of the table that represents, what the weekend actually pays per hour once prep, travel, setup and teardown are counted, and the most a booth could cost and still clear the rate they want for their own time. **After using this, you can answer an open application with arithmetic instead of a feeling, which used to take a gut check that counted the booth fee and nothing else.**

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/craft-fair-booth-calculator/

Open `index.html` directly, or serve this directory with `python3 -m http.server`. The deterministic calculation works with no account, API key, upload, or paid dependency.

## Why the booth fee is the wrong break-even

A $1,500 day at a $250 booth is not $1,250. Three things sit between gross sales and what covers the booth, and a gut check misses all three:

- **Materials are already spent on every dollar you take.** Sell at 30% materials and only 70c of each dollar can go toward anything else.
- **The card reader takes a percentage *and* a fixed fee.** The percentage is easy to remember; the fixed fee only becomes a rate once you divide it by your average order value. Ten cents on a $6 sticker sale is 1.7% of it and on an $80 print it is 0.1%, so two tables with identical processor rates keep very different shares.
- **Booth fee, jury fee, mileage, lodging, and a share of the tent were all paid before a single sale.** They are fixed cost for the day, and what covers them is the contribution left after the two lines above — not gross sales.

So $370 of fixed cost at 68c kept per dollar needs about $547 of sales, not $370. And breaking even means the day paid for itself and paid you nothing: with 26 committed hours at $25, the bar moves to about $1,507. Both figures are worth seeing, because they answer different questions — *did I lose money* and *should I have gone*.

## The part that makes this different from a catering or food-service quote

**Unsold stock is not a cost of the event.** A caterer who over-preps throws food away; a maker who brings 60 candles and sells 22 drives home with 38 candles and sells them at the next market or online. So the materials that belong in one event's break-even are the materials in what actually *sold*, which is why this calculator takes materials as a percentage of retail rather than as a lump sum.

The stock figure you enter is used for one thing only: expressing the break-even as a **sell-through percentage**, so you can see what share of the table has to move. If that comes out above 100%, the event cannot cover its booth even on a sellout — the calculator says so rather than printing a number that looks fine.

This is the correction makers most often report needing. Charging a whole table's materials against one weekend is how a perfectly reasonable market gets written off as a bad one.

## What it reports

- **Break-even sales**, in dollars and in orders at your average, plus the sell-through that represents.
- **Break-even with your own time paid**, at whatever you decide an hour of yours is worth. Set the rate to 0 to see the pure cash answer.
- **What the day leaves** at the sales you expect: materials, card processing, cash after the fixed cost, the effective hourly rate across every committed hour, and what is left after paying yourself.
- **The most a booth could cost** and still clear your target rate — the number an open application actually turns on. If it comes out negative, the expected sales cannot clear your rate even at a free stall, and the calculator says that plainly rather than printing a negative fee.

## Sharing an event

*Copy shareable link* puts all twenty figures into the page's URL fragment so a partner, a studio-mate, or your own phone in the van can open the same event. The fragment is never sent in a request line or a `Referer` header, so the numbers reach only the person you hand the link to. Anyone holding that link can read them, so send it the way you would send the numbers themselves.

A shared link replaces **every** field, including ones it did not carry. That is deliberate: leaving the recipient's own leftover values in the gaps would have them compare a stranger's booth fee against their own expected sales while believing they were looking at one coherent event.

## Privacy and usage

Everything runs in your browser. Your booth fees, sales, costs, and hours are never uploaded, there is no account, and nothing is saved when you close the tab — every field resets on refresh by design. We count anonymous local feature events only (`event-priced`, `booth-fee-tested`, `link_copied`), with a visible opt-out. Do Not Track and Global Privacy Control disable counting automatically. No fees, sales, costs, or hours are recorded. The counter is not sent to the maintainers.

## Related tools in this portfolio

- [Etsy profit calculator](../etsy-profit-calculator/) — one listing after Etsy's own fees, for the stock that comes home.
- [Where-to-sell calculator](../where-to-sell-calculator/) — the same item through every channel at once.
- [Food truck event margin calculator](../food-truck-event-margin-calculator/) — the same event shape where unsold prep genuinely *is* a loss.

## Tests

```
node --test ventures/craft-fair-booth-calculator/*.test.mjs
```

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not tax, financial, or business advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

This calculator produces arithmetic observations from numbers you supply. It does not audit your books, predict how an event will actually go, read a booth contract, determine your sales-tax or vendor-permit obligations, or replace your own accountant. Sales tax you collect from a buyer and remit is not revenue — keep it out of the sales figure you enter.

MIT licensed. See `LICENSE`. [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and never changes what the tool does.
