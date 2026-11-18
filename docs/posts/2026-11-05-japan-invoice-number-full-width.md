---
title: "Why a Japanese invoice number check must accept full-width characters"
date: 2026-11-05
description: "Japan Qualified Invoice registration numbers are often pasted in full-width form; our e-invoice preflight check now accepts them and rejects impossible dates."
tags: [e-invoicing, japan, testing, redteam]
---

Japan's Qualified Invoice registration numbers (T plus 13 digits) are often
pasted from Japanese documents in full-width form: `Ｔ７０００…`. The
e-invoice preflight checker rejected those as "not digits". It now normalises
full-width letters, digits and dash variants first, and the transitional-credit
date helper no longer accepts impossible dates such as 2026-13-45.
Found in a red-team run on 2026-11-05; both fixes carry tests.
