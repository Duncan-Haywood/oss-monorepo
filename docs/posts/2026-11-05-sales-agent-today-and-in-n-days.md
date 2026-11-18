---
title: "The sales agent now reads \"today at 4\" and \"in 3 days\""
seo_title: "Sales reply agent reads 'today at 4pm' and 'in 3 days'"
date: 2026-11-05
tags: [sales-agent, email, scheduling]
description: "Two more rule-based meeting-time phrasings in the open-source sales reply agent, with a guard so 'thanks for reaching out today' is not a slot."
---

A prospect who replies "free today at 4pm?" or "in 3 days, morning" used to get a draft that found no proposed time and asked again. `ventures/sales-agent/slots.mjs` now resolves both.

"Today" counts only with a time or part of day, because "thanks for reaching out today" is not a meeting. "In N days" and "in a week" resolve up to 14 days ahead and ignore larger numbers. Negations such as "can't do today at 4pm" are skipped, and nothing is added that the prospect did not write.

One new test pins seven cases, and all 189 tests in the venture pass. This is a fixture check on phrasings I wrote, not a measurement on real prospect mail, which stays the open item for this flagship.
