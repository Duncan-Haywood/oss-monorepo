---
title: "Cold email follow-ups need their own opt-out"
seo_title: "Cold email sequence checker: spacing, bumps and opt-out per step"
date: 2026-11-03
tags: [sales, email, compliance, open-source]
description: "The sales agent's pre-send checker now reads a whole follow-up sequence: opt-out and address on every step, spacing, bare bumps and repeated text."
---

The free pre-send checker looked at one email. Most cold outreach is three or four, and the follow-ups are where people cut corners: the opt-out line and postal address get dropped because "it was in the first one", and the second email is just "bumping this".

`sequence.mjs` runs the single-email checker on every step, so a follow-up with no opt-out is an error on that step. It then adds rules across steps: days must increase; under 2 days between touches or over 21 warns; a short bare bump warns; a follow-up where under 30% of the words are new warns as a repeat; the same subject twice warns; more than four touches warns.

Nine tests cover each rule. The thresholds are rules of thumb, not measured on real reply data, and the checker is not legal advice. It is a module for now; wiring it into the browser page is next.
