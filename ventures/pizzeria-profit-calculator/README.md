# Pizzeria Profit Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/pizzeria-profit-calculator/>

A free browser tool for pizzerias, slice shops and pizza takeout and delivery stores: **enter your ticket, food cost, delivery mix,
staff, rent and loan, and see profit per order, monthly profit, break-even orders a day (with and without the loan), the average
ticket that reaches your target margin, what delivery apps and your own drivers cost per order, volume and food-cost sensitivity,
and a sixty-month ramp-up with the working-capital reserve and payback.** Nothing is uploaded.

After using this, you can now **say how many orders a day a lease and a loan have to be covered by, and how much cash the first
months burn**, which used to be a spreadsheet built from a blog post.

## Use

1. Open `index.html`, edit the numbers, click Work it out.
2. Pure logic is in `calc.mjs` (`analyze()`); tests: `node --test`.

Not modelled: seasonality, tax, equipment replacement, catering, alcohol, multiple locations. Every figure is yours; none is a
market claim. Not financial advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
