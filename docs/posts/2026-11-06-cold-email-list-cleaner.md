---
title: "Clean your cold email list before the first send"
seo_title: "Free cold email list cleaner: invalid, disposable, role and duplicate addresses"
date: 2026-11-06
tags: [sales-agent, cold-email, deliverability]
description: "A free, offline checker that sorts a prospect list into send, review and drop before you email anyone."
---

Bounces are the quickest way to damage a new sending domain, and most of them are avoidable by reading the list once.

The new list cleaner in the open-source Sales Agent takes pasted addresses (or a CSV with an `email` column) and marks each one send, review or drop. Drop: invalid syntax, disposable-mail domains, duplicates (case and `+tag` folded, so `dana+sales@` is the same person as `dana@`) and anything on your own suppression list. Review: mistyped domains such as `gmial.com` (with the fix suggested), role accounts such as `info@`, and free-mail domains in a B2B list.

It runs in the browser and contacts no mail server, so it cannot say whether a mailbox exists; that is stated on the page. It sits beside the pre-send, sequence, authentication and warm-up checkers, and the unit tests use invented addresses only. One bug turned up in testing: a header detector took the line `not-an-email` for a CSV header and silently skipped it.

Page: `ventures/sales-agent/cold-email-list-checker.html`, code in `listcheck.mjs`.
