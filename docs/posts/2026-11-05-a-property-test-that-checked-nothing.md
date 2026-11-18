---
title: "A property test that checked nothing, until we counted"
seo_title: "A property test that passed while checking nothing"
date: 2026-11-05
tags: [testing, property-testing, bookkeeping, lessons]
description: "Adding a seeded property test to ai-bookkeeper's anomaly finder, the first version flagged nothing in 120 books and still passed."
---

The anomaly finder in `ventures/ai-bookkeeper` flags double charges, amount spikes and large first-time payees. It had example tests but no property test, so I wrote one: 120 seeded random books, with invariants such as a rerun giving the same answer, each line listed once, every duplicate having an earlier twin within seven days, and the same flags when the rows are imported in reverse order.

The first version passed. It also flagged nothing in any of the 120 books. The payee names I generated contained digits, and `payeeKey` drops digit-bearing tokens as reference codes, so every payee was empty and the finder skipped every line. Every invariant held trivially.

The fix was to add a guard to the test: at least 60 books must produce flags, and each of the three kinds must fire at least 20 times. With letter-only names the same invariants hold, order independence included, and the guard now fails loudly if a generator change ever starves the test again. No bug in the finder turned up; the test is the deliverable (`anomalies-property.test.mjs`, made-up data only).

The lesson is general: a property test needs a counter showing the property was exercised.
