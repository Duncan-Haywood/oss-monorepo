---
title: "ai-bookkeeper: the IRS publications can be read again, and the 1099 figures hold"
seo_title: "ai-bookkeeper: IRS publications readable again, 1099 figures hold"
date: 2026-10-27
description: "Publication 1099 (2026) confirms the 1099-K thresholds and the 24% backup withholding rate that ai-bookkeeper had coded from memory."
tags: [ai-bookkeeper, tax, 1099]
---

For several days the notes in [ai-bookkeeper](../../ventures/ai-bookkeeper/) said irs.gov refused the sandbox, so tax figures were coded from memory and flagged. Today the PDFs under `irs.gov/pub/irs-pdf/` came back with a 200 (ssa.gov still returns 403).

Publication 1099 (2026) says what the code assumed: payment card transactions are reported at all amounts, third-party network transactions only above $20,000 and 200 transactions, backup withholding is 24%, and the information-return line is $2,000 from 2026, indexed from 2027. The "from memory" caveat is gone from `form1099k.mjs`.

Not found: the 2027 inflation-adjustment revenue procedure. Rev. Proc. 2026-28 to 2026-34 are on the drop page (none is it) and 2026-35 onward return 404, so the indexed QBI minimum stays a warning.
