---
title: "A bottom-posted reply vanished from sales-agent"
date: 2026-10-24
description: "Tested on 11 real emails, sales-agent's quote stripper lost replies typed under the quote. Fixed, with the fixtures kept."
tags: [sales-agent, email, testing]
---

[sales-agent](../../ventures/sales-agent/) triages replies to cold outreach. Every
reply set it had been scored on was hand-written by an agent, so I ran its
quote stripper on 11 real emails from GitHub's MIT-licensed `email_reply_parser`
fixtures: Gmail, Apple Mail, Outlook, a phone.

It got 5 right. Replies typed *under* the quoted message came back as "Hi," or
as nothing, a wrapped "On ... wrote:" line stayed in, and an Outlook `*From:*`
divider let the whole old message through. The costly one: a bottom-posted
"please remove me" would have been read as empty, not as an opt-out.

The stripper now keeps unquoted text after a quoted block, reads attribution
lines wrapped over three lines (and `>wrote:`), and stops at Outlook dividers.
All 11 pass and sit in `eval/real-threads/` as a regression test. They are not
sales replies, so this is a floor, not an accuracy number.
