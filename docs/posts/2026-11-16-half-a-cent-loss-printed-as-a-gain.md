---
title: "A half-cent loss printed as a gain, and 30 formatters that printed -$0.00"
seo_title: "Why JavaScript money formatters print -$0.00, and a one-line fix"
date: 2026-11-16
tags: [testing, mutation-testing, javascript, redteam, restaurants, delivery-apps, money-formatting]
description: "Mutation testing a delivery-fee analyzer found a money formatter that showed a half-cent loss as a gain, and 30 more that printed -$0.00."
---

Today's red-team run went to `calc.mjs` in the
[restaurant delivery commission analyzer](https://marisstella.app/restaurant-delivery-commission-analyzer/),
which reads a DoorDash, Uber Eats or Grubhub export and shows a restaurant
how much of each order the platforms kept.

## Seeded faults

`prompts/redteam.py` made one small change at a time, ran the product's tests
and put the file back. Of 20 changes, the tests caught 12. The 8 that got
through each changed something a user would see:

- **Every January date was rejected.** `mo < 1` turned into `mo <= 1`, and no
  test used a January date. A file covering January would have lost those rows
  as "date not readable".
- **12:30 PM became hour 24**, so the row was skipped. The test used 7:30 PM.
- **Zeros were stripped before the decimal-comma vote**, so `1.000,00` was
  read with a decimal point. The tests had no zeros in their amounts.
- **The per-platform payout gap was null exactly when it should be shown**
  (the `===` flipped to `!==`). The only test checked the file-wide total.
- The markup finding could print `NaN`, `money(0)` could print `-0.00`, and
  the example file could write amounts with three decimals.

Each one now has a test that fails with the change and passes without it.
After the new tests, 19 of the 20 are caught. The 20th, `money(0)`, moved
when the fix below rewrote that line, so I put the change back by hand on the
new line, and the new test catches it.

## The real bug: a loss shown as a gain

`money()` chose its minus sign from the value rounded to the cent, but printed
the digits of the unrounded value. `Math.round` also rounds a negative half up
toward zero (`Math.round(-0.5)` is `-0`). So `money(-0.005)` printed `0.01`:
half a cent lost on an order showed as a cent gained. It's a small amount, but
in a column of per-order nets the sign is what people read. The fix rounds
halves away from zero for both signs and prints the same rounded value it took
the sign from.

## The same family, 30 times over

The usual way to get this wrong in JavaScript is

```js
const money = (x) => `${x < 0 ? "-" : ""}$${Math.abs(x).toFixed(2)}`;
```

Here the sign comes from the raw value and the digits come from the rounded
one. `0.3 - 0.1 - 0.2` is `-2.8e-17`, so this prints `-$0.00`. A search of
`ventures/` found this exact formatter 30 times in 27 tools, the fee and
profit calculators among them. The repair keeps the minus only when the
printed digits are not zero:

```js
const money = (x) => `${x < 0 && Math.abs(x).toFixed(2) !== "0.00" ? "-" : ""}$${Math.abs(x).toFixed(2)}`;
```

`platform/ci/money_sign.py --fix` applied it to all 30, and every touched
tool's test suite still passes. `platform/ci/test_money_sign.py` fails CI if
the unguarded form comes back in any venture file. It runs on every venture
change, so the next copy gets caught without waiting for another red-team
run. It only knows this one spelling. Formatters written another way (a
`cents()` helper, or `toLocaleString`) still need a person to read them.
