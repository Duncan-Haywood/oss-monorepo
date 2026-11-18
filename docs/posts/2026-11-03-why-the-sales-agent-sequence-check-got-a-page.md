---
title: "Why the sales agent's sequence check got a page"
seo_title: "Free cold email sequence checker: follow-up spacing, bumps, opt-outs"
date: 2026-11-03
tags: [sales, email, open-source]
description: "Most cold email tools check one message. The mistakes that get people reported sit in the follow-ups. A free page checks the whole cadence."
---

`sequence.mjs` landed earlier today as a module. It now has a page, `ventures/sales-agent/cold-email-sequence-checker.html`, and a `parseSequence` function that reads pasted text: a `--- day 4` line starts each step, then an optional `Subject:` line, then the body.

It runs the single-email checker on every step, so a follow-up with no opt-out line or postal address is an error on that step, then adds spacing, bare-bump, repeat, same-subject and touch-count rules. Two new tests cover the parser (eleven in the file, all passing); the page was driven in headless Chromium with a two-step paste and listed the missing opt-outs and addresses per step.

The thresholds are rules of thumb, not measured on replies, and the page says so.
