---
title: "When a prospect says 'next Friday', the draft shows how it read it"
seo_title: "AI sales reply drafts: resolving 'next Friday' and 'after 3pm' safely"
date: 2026-11-05
tags: [sales-agent, scheduling, product]
description: "The sales agent now flags ambiguous meeting days and keeps 'after 3' as a bound, so a draft never confirms a time the prospect did not give."
---

An interested reply that proposes a time is the best thing an outbound sequence produces, and the easiest to get wrong. "Next Friday at 11", written on a Wednesday, can mean the day after tomorrow or nine days out.

The [sales agent](../../ventures/sales-agent/README.md) used to read it as the nearest Friday. It now takes the following calendar week, marks the slot as ambiguous, and the draft says so: `I read "next Friday at 11" as Friday 30 October; tell me if you meant a different day.` A person approves every draft anyway, and now sees the guess in plain words. "Thursday after 3pm" is stored as a lower bound instead of being turned into a 3pm it was never offered.

Checked with unit tests on invented phrases only, and the full suite (186 tests) passes. No real prospect has used it yet.
