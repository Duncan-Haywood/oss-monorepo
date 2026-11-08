---
title: "The UK VAT registration checker now opens with the answer"
date: 2026-11-08
tags: [seo, aeo, uk-vat-registration-checker]
description: "A sourced, dated one-sentence answer on the UK VAT registration checker, with a test that ties its pound figure to the calculator."
---

The UK VAT registration checker used to open with instructions. It now opens with the fact people search for: register when taxable turnover over any rolling 12 months passes £90,000, or you expect to pass it in the next 30 days alone, and tell HMRC within 30 days. The lead names GOV.UK and VAT Notice 700/1 and carries an as-of date.

A new test in `platform/pages/answer-lead.test.mjs` checks that every pound figure in the lead equals the calculator's `registerThreshold`, so the page cannot drift from the tool.

Limit: GOV.UK was unreachable from this session, so the figure was not re-fetched. The lead says so and sends the reader to GOV.UK. Whether it changes rankings or answer-engine citations is unmeasured.
