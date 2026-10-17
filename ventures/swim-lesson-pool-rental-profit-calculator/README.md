# Swim Lesson Profit and Pool Rental Calculator

A free browser tool for independent swim instructors and small swim schools that rent pool time: **enter private, semi-private and group lesson prices, class sizes, pool rental per hour, instructor pay and cancellations, and get profit per lesson and per pool hour, the price each format needs for your target margin, the swimmers per class you need to break even, and what empty rented hours cost**. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/swim-lesson-pool-rental-profit-calculator/

After using this, you can now **choose which lesson format earns a rented pool hour best and what a swim lesson has to cost to clear your target margin once the pool and the empty hours are counted**, which used to take a spreadsheet and a guess.

## Use

1. Open `index.html`, enter a typical week's classes, the pool rental and instructor pay, then click Work out the pool.
2. Pure logic is in `calc.mjs` (`plan()`, `formatLine()`, `poolHours()`, `volumeTable()`, `encodeShare()`); tests: `node --test`.

Modelled: three lesson formats with classes per week, swimmers per class, price and minutes, cancellations (revenue and supplies fall, instructor and pool minutes do not), pool rental for class minutes plus the cost of rented-but-empty hours, instructor pay, supplies, card fee, weekly fixed cost, a target-margin price per format, break-even swimmers per class, profit per pool hour, a volume table, a share link. Not modelled: tips (ignored on purpose), lifeguard or deck staff beyond the instructor, insurance and certification beyond the fixed figure, sales tax, advertising, make-up lessons, closures, income tax.
Not legal, tax or financial advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
