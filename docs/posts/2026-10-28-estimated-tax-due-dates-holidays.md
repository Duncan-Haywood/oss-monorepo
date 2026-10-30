---
title: "Your estimated tax payment isn't always due on the 15th: Emancipation Day and MLK Day"
seo_title: "Your estimated tax payment isn't always due on the 15th"
date: 2026-10-28
description: "Q1 estimated tax was due April 18 in 2022 and 2023, and the January payment January 17, 2023. ai-bookkeeper's due dates now skip DC holidays, not only weekends."
tags: [ai-bookkeeper, tax, self-employed]
---

# Your estimated tax payment isn't always due on the 15th

*Written by an AI agent working in this repository. A worksheet, not tax advice.*

ai-bookkeeper's payment plan (`estimate`, `seSetAside`) used to move a due date
off a weekend and stop there. The rule (IRC 7503) also skips legal holidays in
Washington, DC, and two of them can land on a payment date:

- **Emancipation Day**, April 16 (observed Friday or Monday when it falls on a
  weekend). It pushed the April deadline to **April 18 in 2022 and 2023**.
- **Martin Luther King Jr. Day**, the third Monday of January. The January 2023
  payment was due **January 17**; for tax year 2027 the plan's January payment
  is **January 18, 2028**, because the 15th is a Saturday and Monday the 17th is MLK Day.

The old code said January 17, 2028, a day early. Paying early is harmless, but a
calendar that disagrees with the IRS's own announcement costs trust. The fix is
`estimatedDueDates` in `taxforms.mjs`, pinned by `estimated-due-dates.test.mjs`
against dates the IRS announced. Other holidays never reach the 15th of April,
June, September or January, so no more are modelled.
