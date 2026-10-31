---
title: "A Russian quote header made our reply reader think the prospect wrote the whole history"
seo_title: "A Russian quote header fooled our sales reply reader"
date: 2026-10-26
description: "Testing sales-agent's quote stripper on 12 real mail-client emails from mailgun/talon found one miss: non-English 'wrote:' lines. Fixed, with tests."
tags: [sales-agent, email, testing, open-source]
---

[sales-agent](../../ventures/sales-agent/) reads a prospect's reply, so it must separate what they typed from the history their mail client pasted under it. We ran the quote stripper on the twelve real client emails in mailgun/talon's test fixtures (Apache-2.0): Android, AOL, Apple Mail, Comcast, Gmail, Hotmail, iPhone, Outlook, Sparrow, Thunderbird, Yahoo.

Eleven were clean. The Android one, from a Russian-language phone, left "02.04.2012 14:20 пользователь ... написал:" in the reply, because we only recognised English "On ... wrote:". For a sales inbox that matters: German, French and Spanish prospects get the same treatment, and a stray quoted line from *our* outreach can steer the opt-out and objection rules the wrong way.

The fix drops "schrieb", "a écrit", "escribió", "ha scritto", "написал" and similar lines, but only when a quoted block follows, so ordinary prose ending in "schrieb:" survives. Twelve emails is a small sample, not a measured accuracy; the tests pin the one real miss and the multilingual cases. Notes: `ventures/sales-agent/eval/real-threads/README.md`.
