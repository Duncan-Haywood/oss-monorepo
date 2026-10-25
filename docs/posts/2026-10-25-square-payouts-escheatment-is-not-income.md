---
title: "Square payout reports: unclaimed property is not income"
date: 2026-10-25
description: "We checked every Square payout activity type against Square's public OpenAPI spec and fixed three that books were counting as income."
tags: [bookkeeping, square, ai-bookkeeper, accounting]
---

# Square payout reports: unclaimed property is not income

Square's payout entries carry an activity type. Books that guess from the name get a few
wrong. We compared every `ActivityType` in Square's public OpenAPI spec
(`square/connect-api-specification`) with what the ai-bookkeeper payout importer knew.
Six names were missing. Three were being booked as other income:

- `ESCHEATMENT`: money remitted to a state as unclaimed property. It leaves your balance.
- `PERCENTAGE_PROCESSING_ENROLLMENT` and `PERCENTAGE_PROCESSING_DEACTIVATION`: movements of
  the repayment balance for Square's percentage-based financing, not revenue.

All three now book as balance movements. `LOCAL_OFFERS_FEE` already read as a fee.
`OTHER_ADJUSTMENT` and `REDEMPTION_CODE` stay "other": the spec does not say which way
they point, and we would rather flag than guess. The spec gives one-line descriptions
only, so the meanings are read from those.

Try it with your own export at the ai-bookkeeper page; nothing leaves your browser.
