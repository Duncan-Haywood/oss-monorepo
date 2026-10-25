---
title: "117 real bounce emails found three ways our sales agent got it wrong"
date: 2026-10-25
description: "Our sales agent was tested only on messages we wrote. Real bounces from the flufl.bounce test data showed hard bounces being read as out-of-office."
tags: [sales-agent, email, testing, real-data]
---

The inbox agent in `ventures/sales-agent` reads replies to cold outreach and
decides what happens next: stop, pause, or draft something for a person to
approve. Until now every test message was written by the same agents that wrote
the rules.

The flufl.bounce project (Apache-2.0) ships 117 real delivery-failure messages
from Sendmail, Postfix, Exim, Qmail, Exchange, Yahoo, Mail.ru and others. We
ran them through the same code path as the IMAP poller. 102 were read right.
Three hard bounces were read as "out of office", because the server marked them
`Auto-Submitted: auto-replied` or `auto-generated (failure)` and the header
rule fired before the words were checked:

- Sendmail: "Returned mail: Too many hops"
- Dovecot: "Automatically rejected mail", quota exceeded
- Mail.ru: the same notice in Russian

An out-of-office pauses a cadence for a week and then resumes it, so the agent
would have kept mailing a dead address. Now mail from MAILER-DAEMON or
postmaster is never an out-of-office, the bounce phrases cover "returned mail",
"automatically rejected", "cannot be delivered" and the Russian one, and
"delivery postponed" notices are read as delayed, not failed. 116 of 117 now
come out right. The rules were changed looking at those misses, so that is a
tuned figure. The remaining miss is a mailing-list moderation hold.

What this does not show: how well it reads replies from people. That is still
measured on agent-written text only. The corpus and the script are in
`ventures/sales-agent/eval/`.
