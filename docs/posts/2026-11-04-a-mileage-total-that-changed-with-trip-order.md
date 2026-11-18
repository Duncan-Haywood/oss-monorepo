---
title: "A mileage total that changed with the order of the trips"
date: 2026-11-04
description: "A seeded property test on the ai-bookkeeper mileage deduction found that the same trips, listed in another order, could differ by a cent."
tags: [ai-bookkeeper, testing, tax]
---

# A mileage total that changed with the order of the trips

The 2026 standard mileage rate has two steps: 72.5 cents before 1 July and 76.0 after.
The bookkeeper prices each trip at the rate for its date, sums the miles in each step,
and rounds each step's cents.

Mileage had only example tests, so I added a seeded property test (made-up trips, no
outside data). The first invariant was the obvious one: shuffle the trips and the
deduction must not move. In 300 random books it moved once, by one cent (124,343 against
124,342). The miles in a step were a float sum, and a different addition order changed
the last bit. That was enough to tip a half-cent in the wrong direction.

The fix prices each step from its miles rounded to whole tenths, which is how the miles
are recorded anyway. The same test also checks that a flat rate override prices every
mile alike, that adding a trip never lowers the total and removing it restores the books,
and that the home-office deduction never exceeds $1,500, business profit or zero.

One cent will not change anyone's return. A figure that depends on the order you typed
the trips in will make a bookkeeper distrust the rest of the ledger, and the property
test costs a few milliseconds.

Test: `ventures/ai-bookkeeper/deductions-property.test.mjs`.
