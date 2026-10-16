# Boba Tea Shop Profit Calculator

A free browser tool for bubble tea, tea bar and specialty drink shops: **enter your price, cup costs, staff, rent and loan,
and see profit per cup, monthly profit, break-even cups a day (with and without the loan), the drink price that reaches your
target margin, volume and ingredient-cost sensitivity, and a sixty-month ramp-up with the working-capital reserve and payback.**
Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/boba-tea-shop-profit-calculator/

After using this, you can now **say how many cups a day a lease has to be covered by, and how much cash the first months burn**,
which used to be a spreadsheet you built from a blog post.

## Use

1. Open `index.html`, edit the numbers, click Work it out.
2. Pure logic is in `calc.mjs` (`analyze()`); tests: `node --test`.

Not modelled: seasonality, tax, equipment replacement, lease terms beyond rent, multiple locations. Every figure is yours; none
is a market claim. Not financial advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
