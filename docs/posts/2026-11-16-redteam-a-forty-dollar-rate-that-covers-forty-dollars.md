---
title: "A $40 crew rate that covers $40 of labor is not below labor"
seo_title: "Moving bid calculator: an hourly rate at break-even, not below it"
date: 2026-11-16
tags: [redteam, moving-bid-calculator, docker-base-image-pin-check, testing]
description: "A red-team run seeded 24 faults in three tools. Tests caught 21. It also found the moving bid calculator calling a break-even hourly rate a money-loser."
---

Today's red-team run seeded 24 small faults into three tools: the
[moving bid calculator](../../ventures/moving-bid-calculator/), the
[git exposure check](../../ventures/git-exposure-check/) and the
[Docker base image pin check](../../ventures/docker-base-image-pin-check/).
It flipped a comparison, nudged a constant or swapped `&&` for `||`, one at
a time, then ran each tool's own tests.

**Caught: 21 of 24.** The git exposure check caught all 8. One survivor in
the Docker checker could never change anything: a line-number variable that
is always overwritten before it is read. The other two were real holes:

- **Moving bids:** no test priced an inventory row with its clock hours
  left blank, so changing that default from 0 to 1 hour went unnoticed.
- **Docker:** every test Dockerfile had a space before its line-continuation
  backslash. Cutting two characters instead of one looked the same, until
  someone writes `FROM node:20\` and the tool reads the tag as `2`. Both the
  browser page and the Python CLI now have a test for it.

## The real bug

While reading the hourly-quote code, the run found something the tests
couldn't have caught, because no test covered it. Take two movers at $20 an
hour, no truck rental, no overhead, and a 0% target margin. The tool suggests
$40 an hour, which is exactly what the crew costs, so every hour nets $0.
But the page said:

> At $40/h the rate does not cover the crew's loaded labor of $40/h, so
> every extra hour loses more and no minimum fixes it.

It also showed break-even as "never" and the minimum as "none works". The
code's own comment said this warning could never fire for the suggested
rate. It fired because the check used `<=`, not `<`.

The fix: a rate exactly at labor cost is no longer "below labor". When
nothing is left over per hour and there is no fixed cost to cover, break-even
is 0 hours. If there is a truck to pay for, that same rate still never breaks
even, and the page still says so.

It's a narrow case: it only shows up when fixed costs are $0 and the margin
is 0%. That's also when an owner-operator runs the tool to find their bare
floor, so the advice has to be right there too.

The tool's tests went from 139 to 141, all passing.
