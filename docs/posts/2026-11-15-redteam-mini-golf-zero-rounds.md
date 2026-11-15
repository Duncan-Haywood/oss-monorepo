---
title: "Zero rounds, zero dollars: red-teaming the mini-golf profit calculator"
seo_title: "Break-even with no rounds planned: a mini-golf calculator edge case"
date: 2026-11-15
tags: [testing, mutation-testing, small-business, redteam]
description: "18 faults seeded into the mini-golf profit calculator, 15 caught. By hand: zero planned rounds read as loss-making, and free rounds put staff at 0% of sales."
---

Today's red-team run aimed at
[the mini-golf course profit calculator](https://marisstella.app/mini-golf-course-profit-calculator/),
which takes a course build cost, three seasons of rounds and prices, parties,
concessions, staff and a loan, and works out cash after the loan payment, debt
coverage, payback and a break-even number of rounds per open day.

## Seeded faults

`redteam.py campaign` seeded 8 faults into the page's on-device usage counter
(`usage.mjs`) and 10 into the maths (`calc.mjs`), applying each one, running
the suite and restoring the file.

The maths suite caught all 10. The counter's own suite caught 5 of 8. The three
that got through are the same shape a 2026-11-11 and a 2026-11-14 run saw in
other copies: the suite never stores a JSON value that is not an object (`[]`
or `5`), and never hands the counter a store whose reads throw. The repository
already runs every venture's counter against those inputs
(`platform/ci/usage_contract.mjs`), so these would have failed CI; this copy's
suite now tries them too, and all three are caught.

## Two wrong statements, found by hand

The faults a tool seeds are only half of it. Typing odd but honest inputs
found two places where the page said something untrue.

**Zero planned rounds.** Someone sketching a course before they have any
attendance estimate, or checking a parties-only plan, can leave rounds per
day at 0 in every season. The page then said:

- "Each extra round loses money once card fees and concession costs are
  counted", with prices of $8 to $11 a round and $4 of concessions;
- "Each round brings in about $0.00 ... ($0.00 average price ...)";
- "Break-even: not reachable at these prices".

All three come from scaling the planned attendance: with nothing planned,
every multiple of it is still nothing, so a round looked worthless. The
calculator now uses one round per open day in every season as the shape when
nothing is planned. With the sample's other figures, break-even comes out at a
finite number of rounds per day, and a test puts that number back in as the
plan and checks cash after the loan is zero.

**Free rounds.** A restaurant or bar with a free course still has concession
and party sales. With every price at $0 the staff line read "0% of sales",
because the percentage was gated on the share of sales from rounds rather than
on sales. With the sample it is about 98%. It now divides by sales whenever
there are any.

## Numbers

| | Seeded | Caught | Caught after the new tests |
|---|---|---|---|
| `usage.mjs` | 8 | 5 | 8 |
| `calc.mjs` | 10 | 10 | 10 |

Two real defects found, two patched, each with a test that failed first.

The calculator is a planning aid built on your own figures, not financial
advice.
