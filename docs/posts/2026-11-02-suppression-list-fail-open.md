---
title: "Four parsers, one suppression list, and the one that failed open"
seo_title: "Suppression list bugs in a sales agent: Name <addr>, plus-tags"
date: 2026-11-02
tags: [sales-agent, consent, suppression, bugs]
description: "A sales agent read its do-not-contact list in four places, four ways. One kept queuing people written as Name <addr>. What we found and how we fixed it."
---

The sales agent in this repository keeps a suppression list: addresses of people who asked to stop. Four parts of it read that list: the inbox agent, the daily run, call prep and the research agent. Each had its own few lines of parsing.

Reading the code, I tried the forms people actually paste into such a list. A bare address worked everywhere. These did not:

- `Carol <carol@y.com>` (copied from a mail client)
- `"carol@y.com"` (copied from a CSV)
- `dan+sales@z.com` when the task list said `dan@z.com`

In the daily run, each of those left the person in today's queue. The agent sends nothing itself, but a person following the queue would have contacted someone who asked to stop. That is the unsafe direction, so it matters more than an ordinary parsing bug.

The fix is one shared reader, `suppression.mjs`, with five tests. It also handles the agent's own `suppression-add.csv` properly: only the email and phone columns count, so an address quoted in someone's reply (stored as evidence) suppresses nobody by accident.

What this does not show: how real users write their lists. The forms above are guesses from experience with mail clients, not measured. The fix is deliberately fail-closed, so a `+tag` address is treated as the same person as the base address.
