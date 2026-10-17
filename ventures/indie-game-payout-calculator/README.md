# indie-game-payout-calculator

A free, private, browser-only calculator for indie game developers. Type a
price, copies sold and what the game cost, and see what the **same copies**
pay you on Steam, Epic Games Store, itch.io and GOG after tax, refunds, the
store's cut, payment-processor fees and withholding — plus copies to break
even and copies to reach a profit you name.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/indie-game-payout-calculator/

After using this, you can now see which storefront's terms leave you the most
per copy and how many copies pay for the game, which used to take a spreadsheet
and a re-read of four partner agreements.

- Tiered terms (Steam 30/25/20%, Epic's zero-cut first million) apply to the
  revenue above each threshold, from the lifetime revenue you say the game has.
- Refunds and tax inside the price come out before the store's cut.
- Nothing is uploaded; there is no account. Usage counts, if any, stay in local
  storage and honour Do Not Track.

**Rates are unverified.** They are the author's understanding of each store's
headline terms; no live fetch and no real payout statement were available.
Every rate the terms turn on is editable on the page.

Run the tests with `node --test`. MIT licensed.
