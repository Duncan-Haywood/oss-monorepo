---
title: "Germany's 1 January 2027 e-invoice deadline was missing from our calendar feed"
seo_title: "Germany e-invoice 1 Jan 2027 deadline: calendar feed fixed"
date: 2026-11-06
description: "The e-invoice mandate calendar skipped Germany's 2027 and 2028 issuing steps because the hub table gave only years. Both are now dated events."
tags: [einvoice-preflight, germany]
---

The e-invoice Preflight calendar (`mandate-calendar.ics`, `mandate-dates.json` and the 2027 deadlines page) is built from the hub table of country pages. It keeps only full day-month-year dates. Germany's row said "issue from 2027 ... and 2028", so the feed had Germany's 2025 receiving date and nothing for the step about eight weeks away.

The row now reads 1 Jan 2027 (prior-year turnover above EUR 800,000) and 1 Jan 2028 (everyone), domestic B2B, as the country page already said. The feed has 108 dated milestones, up from 106, and the deadlines page lists the two German steps. The calendar tests and the 155 tests that read the hub table pass.

The German dates are from the country page, which cites public guidance; not re-read at the primary source today. Not tax advice.
