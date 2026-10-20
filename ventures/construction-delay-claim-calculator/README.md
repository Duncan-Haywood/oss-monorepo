# Construction Delay Claim Calculator

A free browser tool for subcontractors, general contractors and owners' reps: **list the delay events and who caused them, and see the time extension earned, the compensable days, a field plus Eichleay home-office overhead claim, and the liquidated damages left**, netted into one position. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/construction-delay-claim-calculator/

After using this, you can now **size a delay claim against the liquidated damages it offsets and see which days are worth proving**, which used to be a spreadsheet built from scratch the week the owner's withholding letter arrived.

## Use

1. Open `index.html`, enter the contract, one delay event per line (`name, days, owner|contractor|weather|other, concurrent yes|no`) and the overhead figures, click Calculate.
2. Pure logic is in `calc.mjs` (`plan()`, `eichleay()`, `sensitivity()`); tests: `node --test`.

Modelled: time extension for owner and neutral delay, money only for owner delay with no concurrent contractor delay, the Eichleay daily rate, field overhead, profit, liquidated damages with an optional cap, and a table of net position as compensable days change. Not modelled: notice and waiver clauses, no-damages-for-delay clauses, critical path analysis, acceleration, lost productivity, interest, state or public-owner rules.
Not legal advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
