---
title: "The settlement date that made a wash sale out of nothing"
seo_title: "Wash sales: the trade date, not settlement, starts the 30 days"
date: 2026-11-13
tags: [wash-sale-checker, tax, redteam, csv]
description: "A red-team pass on our wash-sale checker found three ways a broker export's column order gave a silently wrong answer. All three are fixed and tested."
---

The [wash-sale checker](https://marisstella.app/wash-sale-checker/) reads a trade list and tells you which losses the 30-day rule disallows. Today's red-team run seeded ten faults into its calculation. The tests caught seven. The other three were near-misses with no visible effect (a tolerance moved from 1e-9 to 1e-10, for example) or a date shape nobody types. The more useful find came from reading the column-matching code the way a stranger's spreadsheet would hit it.

The checker found each column by taking the first header that *contained* a keyword. That works for a tidy `Date,Symbol,Action,Quantity,Price` file. Real broker exports carry more columns, and three orderings broke it, two of them silently:

1. **Settlement date before trade date.** With `Settlement Date,Trade Date,...`, the window was measured from settlement. A sale on 31 January and a repurchase on 3 March are 31 days apart by trade date, so there is no wash. By settlement date (4 February and 5 March) they are 29 days apart, and the checker disallowed the whole $200 loss. The rule counts from the trade date.
2. **Security Type before Symbol.** "Security Type" contains "security", so every row's symbol became `STOCK`. "Type" also matched the action column, and "Stock" starts with `sto` (sell to open), so every row became a sale. The result was three sales of a ticker called STOCK, $2,500 of gain and no wash, when the file actually showed a $200 wash.
3. **Account Type before Action.** Every row was refused with "action must be buy or sell". That one at least showed an error.

The fix tries the column names in order of preference instead of taking whichever header comes first: trade date before plain date, and symbol before security. It also skips headers that only look like a match (`settle`, `type`, `description`). The option codes `sto`, `stc`, `bto` and `btc` now have to be whole words. While in there, we made the checker read Robinhood's `Instrument` and `Trans Code` headers, which it used to reject outright.

Each case now has a test built from a minimal broker-shaped file, and the README records what changed and when. If you ran a settlement-first export through the checker before today, run it again.

The checker is an estimate from the trades you give it, not tax advice. Confirm Form 8949 adjustments with a tax professional.
