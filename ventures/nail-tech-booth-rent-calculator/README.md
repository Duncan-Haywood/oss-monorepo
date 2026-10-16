# Nail Tech Booth Rent Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/nail-tech-booth-rent-calculator/>

**Compare booth or chair rent, a commission split and an hourly job by take-home per hour worked, not per hour booked, and audit which arrangement has actually paid you.** Enter a typical week: hours at the salon, clients, ticket, chair minutes, unpaid admin hours, tips, retail and supplies, then the rent, split or wage you are weighing. Get take-home per week and per hour worked after idle chair time, supplies, card fees, insurance and a self-employment tax estimate, the break-even clients per week and where booth rent overtakes the others. Paste past weeks and see take-home per hour worked by arrangement. Browser page or zero-dependency CLI, for nail techs and other independent beauty professionals.

After using this, you can now tell whether a chair at $275 a week beats a 55 percent split at the number of clients you really book, which used to take a napkin and a guess about slow weeks.

```
node cli.mjs compare --clients 24 --ticket 60 --rent 275 --split 55 --wage 15
node cli.mjs history fixtures/weeks.csv --target 25
cat weeks.csv | node cli.mjs history - --json
```

Week rows: `week,model,pay,tips,expenses,hours[,booked_hours]`. See `fixtures/weeks.csv`.

## Your numbers, not market rates or tax advice

Every price, rent, percentage and tax rate is a number you type. The tool knows no going rents or splits, looks up no tax tables and predicts nothing. Defaults are placeholders: replace them with your own tracked figures.

## How it computes

Booked hours = clients x minutes / 60; idle = hours at the salon less booked. Hours worked = max(hours at salon, booked) + unpaid admin hours (employee: no admin hours). Booth net = services + tips + retail margin - rent - card fees - supplies - insurance and fixed costs. Commission net = split x services + tips + retail commission - your supplies share - insurance and fixed costs. Employee income = wage x paid hours + tips + retail commission. Self-employment tax = rate x 92.35% x net; income reserve = percent x (net - half of self-employment tax); employees pay the employee payroll share instead. Take-home per hour worked = (net - both set-asides) / hours worked. Break-even clients and the booth crossover are found by scanning client counts in steps of 0.05 up to 150.

## What it is not

Not tax, legal or financial advice, not a survey of rents or splits, and no warranty. The tax figures are rough set-asides, not a return: they ignore brackets, deductions, state taxes and the Social Security wage base. Your lease or employment terms come first.

## Privacy

No network call, no account, no analytics vendor. The browser page works on typed or pasted values locally and never uploads them. Anonymous feature counts (`compare_run`, `history_run`, `example_loaded`) live in local storage only and can be switched off on the page; Do Not Track and Global Privacy Control are honoured.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
