# Music Teacher Studio Profit Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/music-teacher-studio-profit-calculator/>

A free browser tool for independent private music teachers (piano, guitar, voice, strings): **enter your lesson prices, lesson and prep minutes, cancellation policy, weeks taught and weeks billed, rent, instruments, recital costs and in-home travel, and get your effective hourly rate, the price each kind of lesson needs for your target hourly, break-even students, what cancellations cost a year, and what the same teaching nets privately, for a music school at a percentage split, or in a room rented by the hour**. Nothing is uploaded.

After using this, you can now **see what a lesson really pays per hour once prep, admin, travel, cancellations and unbilled holiday weeks are counted, and whether teaching for a school or renting a room would pay better**, which used to take a spreadsheet and a guess.

## Use

1. Open `index.html`, enter a typical teaching week and the studio's costs, then click Work out the studio.
2. Pure logic is in `calc.mjs` (`plan()`, `studioModes()`, `serviceLine()`, `policy()`, `breakEven()`, `fixedCosts()`, `encodeShare()`); tests: `node --test`.

Modelled: three lesson kinds with weekly bookings, price, minutes, unpaid prep and materials; a late-cancel and no-show rate split into charged, made-up and lost; tuition earned over weeks billed against hours worked over weeks taught; admin hours; in-home share with travel time and mileage; rent, instruments spread over their years, other fixed cost, recital cost net of recital fees; an effective hourly rate against a target, the price per lesson kind for that target, break-even lessons per week, the cost of cancellations and of unbilled teaching weeks, teaching privately against a music school split (with the equal-split point) against a rented room (with the equal-room-rate point), a volume table, a share link. Not modelled: income and self-employment tax, sales tax, card fees, licensing and publisher fees, a school's own rules, travel to a rented room, student churn.
Not legal, tax or financial advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
