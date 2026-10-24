# Catering Quote Calculator

What should this catering job cost per guest, and how few guests can you take before it loses money? Paste a cost
sheet (name, basis, quantity, unit cost) and see the per-guest price that delivers your margin, food and labor as
a share of the quote, the deposit, a price-by-headcount table and the break-even guest count for a price you name.
Browser page or zero-dependency CLI.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/catering-quote-calculator/

```
node cli.mjs quote event.csv --guests 60
cat event.csv | node cli.mjs quote - --guests 60 --margin 30
node cli.mjs quote event.csv --guests 60 --price 28 --json --fail-on error   # script: refuse to send a losing quote
```

Input: rows of `name,basis,qty,unit`. `guest` = cost per person (waste allowance added), `flat` = cost for the whole
event, `staff-hour` = total staff hours x hourly rate (payroll burden added). A header row is read by name.

## What is arithmetic and what is a rule of thumb

Arithmetic: totals, price = cost / (1 - margin - overhead), margin at a price you name, break-even guests =
fixed cost / (price after overhead - cost per guest).

Rule of thumb: the 30% margin, 10% overhead, 5% waste, 12% burden defaults and the 35% food / 35% labor warning
levels. Change them with the flags. Sales tax and gratuity are shown separately; supplier price changes and venue
rules are not modelled.
