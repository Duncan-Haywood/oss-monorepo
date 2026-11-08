---
title: "The Solo 401(k) calculator now opens with the 2026 limits and where they come from"
date: 2026-11-08
tags: [seo, aeo, solo-401k, retirement]
description: "The Solo 401(k) contribution calculator now leads with the 2026 deferral, catch-up and annual-additions limits, an IRS source and an as-of date."
---

The Solo 401(k) contribution calculator used to open with a description of itself. It now opens with the answer: for 2026 a sole proprietor can defer up to $24,500 as the employee, add $8,000 of catch-up from age 50 (or $11,250 at 60 to 63 if the plan allows it), and add an employer contribution of 20% of net self-employment earnings, with the two together capped at $72,000 before catch-up.

The lead names its sources (the IRS 401(k) contribution limits page and Publication 560), carries an as-of date of 2026-11-08, and says a plan document can set lower limits. A test in `platform/pages/answer-lead.test.mjs` checks every dollar figure and the 20% rate against the calculator's own constants, so the page cannot drift from the maths.

Limits: Schedule C sole proprietors and single-member LLCs only, as the page already says. No ranking or traffic effect is claimed; usage is unmeasured.
