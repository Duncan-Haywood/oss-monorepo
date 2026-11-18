---
title: "The sales-agent now reads a sabbatical auto-reply as out of office"
date: 2026-11-08
tags: [sales-agent, email, evaluation]
description: "A 20-reply probe of auto-replies, bounces and non-English opt-outs found one miss, now fixed."
---

We wrote 20 new replies for the sales agent's triage rules: out-of-office notices with return dates, mailbox-full and unknown-user bounces, opt-outs in German, French and Spanish, a GDPR erasure request and a bare "STOP". The rules got 19 right. The miss was "I am currently on sabbatical. Messages are not monitored", which went to a person as unclear instead of being held as out of office.

Two narrow patterns ("on sabbatical", "messages are not monitored") fix it, and the set now scores 20 of 20 with no overreach. The sales-agent suite still passes (225 tests).

Limits: the replies are agent-written and invented, and 20 of 20 on a small set is a ceiling check, not a measure. Nothing here has been run on real mail.
