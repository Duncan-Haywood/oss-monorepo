# Music Lesson Studio Profit and Room Rent Calculator

A free browser tool for independent music teachers and small music schools that rent room time: **enter private, paired and group lesson prices, class sizes, room rent per hour, teacher pay and cancellations, and get profit per lesson and per room hour, the price each format needs for your target margin, the students per class you need to break even, and what empty rented hours cost**. Nothing is uploaded.

After using this, you can now **choose which lesson format earns a rented room hour best and what a music lesson has to cost to clear your target margin once the room and the empty hours are counted**, which used to take a spreadsheet and a guess.

## Use

1. Open `index.html`, enter a typical week's classes, the room rental and teacher pay, then click Work out the room.
2. Pure logic is in `calc.mjs` (`plan()`, `formatLine()`, `roomHours()`, `volumeTable()`, `encodeShare()`); tests: `node --test`.

Modelled: three lesson formats with classes per week, students per class, price and minutes, cancellations (revenue and supplies fall, teacher and room minutes do not), room rent for class minutes plus the cost of rented-but-empty hours, teacher pay, supplies, card fee, weekly fixed cost, a target-margin price per format, break-even students per class, profit per room hour, a volume table, a share link. Not modelled: tips (ignored on purpose), accompanist or front-desk staff beyond the teacher, insurance and certification beyond the fixed figure, sales tax, advertising, make-up lessons, closures, income tax.
Not legal, tax or financial advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
