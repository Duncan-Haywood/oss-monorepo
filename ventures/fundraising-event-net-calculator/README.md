# Fundraising Event Net Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/fundraising-event-net-calculator/>

A free browser tool for galas, auctions and benefit dinners: **enter the tickets, sponsors, auction and what the night costs, and get the net the cause keeps, the cost per dollar raised, the break-even headcount, and the guests or ticket price that reach your goal**. Nothing is uploaded.

After using this, you can now **see what an event nets before you sign the venue contract**, which used to take a spreadsheet that showed the gross and hid the cost of the room.

## Use

1. Open `index.html`, enter guests, ticket, sponsors, auction and costs, then click Model this event.
2. Pure logic is in `calc.mjs` (`plan()`, `model()`, `encodeShare()`); tests: `node --test`.

Modelled: tickets, comps, per-guest giving, sponsors, auction and raffle totals, card fees on card revenue, meals for every seat, fixed staging costs, auction item cost, net, cost per dollar raised, break-even guests, guests and ticket price for a goal, attendance and ticket-price tables, a share link. Not modelled: sales tax, raffle or gaming licences, volunteer time, unpaid pledges, tiered tickets and table sales.
Not legal, tax or financial advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
