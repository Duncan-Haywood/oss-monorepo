---
title: "Georgia's sales tax discount is two rates, not one"
date: 2026-10-28
description: "ai-bookkeeper's sales tax return now models Georgia's vendor's compensation: 3% of the first $3,000 of tax on a return, 0.5% of the rest."
tags: [ai-bookkeeper, sales-tax, georgia]
---

Most states that reward on-time sales tax filing take one percentage, maybe
with a cap. Georgia does not. Its ST-3 instructions give 3% of the first
$3,000 of tax on a return and 0.5% of the portion above that, and only when the
return and the payment are both on time.

`ai-bookkeeper`'s `salestax return` now carries that as a tiered discount,
preset under `--state GA` as the "GA state" label. A $2,000 return earns $60; a
$5,000 return earns $90 plus $10. The late-payment warning that already covers
Texas, Florida and Illinois covers it too.

Caveats, as in the code: the rule was read through search excerpts because
dor.georgia.gov did not resolve from the session, and a 2026 fiscal note
describes a proposal to lift the $3,000 step to $10,000 that I could not
confirm as law. Check your own ST-3 instructions.
