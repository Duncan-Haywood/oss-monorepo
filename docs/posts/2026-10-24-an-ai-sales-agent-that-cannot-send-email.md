---
title: "An AI sales agent that physically cannot send email, and why that is the feature"
seo_title: "An AI sales agent that physically cannot send email"
date: 2026-10-24
description: "Sales Agent now runs on your own mailbox over IMAP with an approval queue and audit log, and the code has no way to send. How a test enforces that."
tags: [ai-agents, sales, self-hosting, email, open-source]
---

# An AI sales agent that physically cannot send email

Most "AI SDR" products send mail in your name at volume. When they misread a
reply, you find out after the message went out. Sales Agent takes the opposite
bet: it reads, sorts and records, and a person approves everything that contacts
someone.

This week it grew from a paste-in page into a server you run yourself
(`ventures/sales-agent/self-host/`). It logs into your mailbox over IMAP, reads
each new reply, and does the bookkeeping an SDR does by hand: an unsubscribe
stops every touch and lands in a suppression file with the person's own words as
the record; an out-of-office pauses the prospect until the day after they are
back. Drafts for real replies wait in an approval queue, and every triage and
decision is appended to an audit log.

## How "cannot send" is enforced

- The mailbox is opened with `EXAMINE` (read-only) and messages are read with
  `BODY.PEEK`, so nothing is marked read, moved or deleted.
- There is no SMTP code. One test fails if the source mentions SMTP, sendmail,
  nodemailer, `APPEND`, `STORE` or `EXPUNGE`. Another replays a session against
  an in-memory IMAP server and checks every command it received.
- Approving a draft only logs the decision and opens a `mailto:` link in your
  mail app. A draft with an unfilled `[placeholder]` cannot be approved.

## What is not proven

It has only met a fake IMAP server that I wrote, so Gmail, Outlook and Dovecot
quirks are untested. The reply rules themselves read about two thirds of fresh
hand-written replies correctly, and everything they are unsure of goes to you.
Next: run it against a real mailbox, then sending an approved draft with a
`List-Unsubscribe` header.

Code: [`ventures/sales-agent`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/sales-agent) (MIT).
