---
title: "From a framing takeoff to a proposal a customer can read"
date: 2026-11-01
tags: [wall-framing-takeoff, construction, estimating]
description: The framing takeoff can now turn its priced budget into a customer letter with section prices and no visible margin, and it refuses to issue one while any line is unpriced.
---

A takeoff is for the builder. The customer wants a price by section, what is in and what is not, and how long the number holds. `node cli.mjs plan.json --proposal` now writes that from the same budget.

Three choices matter. Tax, contingency, overhead and profit are spread pro rata over the sections, so the customer sees section prices that add to the bid and neither the cost nor the margin. The rows are forced to sum to the cent. And if any line has no typed price the command exits 1 and says which, because a proposal that quietly leaves out scope is the expensive kind of mistake. A `partial` flag issues it anyway with a warning naming the gap.

Inclusions, exclusions, terms, client and validity come from a `proposal` key in the plan file; nothing is shipped as a default price or clause. Checked against hand arithmetic in the tests (a 10% and 10% markup scales each section by the same factor), not against a real builder's proposal. There is no page for it yet.
