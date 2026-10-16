# Driving School Profit Calculator

A free browser tool for independent driving-school owners: **enter your lesson, block-lesson and road-test prices, car minutes, fuel and wear, cancellation rate, office rent, the car's cost and insurance, and road-test car hire, and get profit per lesson and per car hour, the price each offer needs for your target margin, break-even lessons per week, what late cancellations cost, and what the same car nets you instructing it yourself, employing an instructor on a share of each lesson, or leasing it to an independent instructor by the week**. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/driving-school-profit-calculator/

After using this, you can now **decide whether to instruct, employ or lease out a driving-school car, and what a lesson has to cost to clear your target margin once insurance, the car and empty hours are counted**, which used to take a spreadsheet and a guess.

## Use

1. Open `index.html`, enter the week's bookings, the car's costs and the instructor-pay and lease options, then click Work out the car.
2. Pure logic is in `calc.mjs` (`plan()`, `serviceLine()`, `carModes()`, `breakEven()`, `fixedCosts()`, `encodeShare()`); tests: `node --test`.

Modelled: three offers with weekly bookings, price, car minutes and fuel and wear, a late-cancellation rate (empty slots earn nothing and load the owner's time onto the lessons that happen), the owner's hourly value, office rent and the car's cost net of resale spread to a weekly fixed cost, road-test car hire margin, a target-margin price per offer (owner-instructed and employed), profit per car hour, break-even lessons per week, cancellation cost per week and year, an employed instructor on a share of each lesson plus payroll extras against a flat weekly car lease with the equal-lease and equal-pay points, a volume table, a share link. Not modelled: tips (ignored on purpose), the owner's pay beyond the hourly figure, state licensing and bond costs, sales tax, card fees, advertising, an instructor who books fewer students, seasonality, whether an instructor can lawfully be treated as independent, income tax.
Not legal, tax or financial advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
