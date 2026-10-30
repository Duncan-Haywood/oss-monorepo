---
title: "A bounce that named five dead addresses stopped only one"
date: 2026-10-24
description: "Scoring real delivery-failure reports from the mail gem's test fixtures found a bug in the sales agent's bounce reader."
tags: [sales-agent, testing, real-data]
---

The sales agent's bounce reader had been checked on 117 real bounces from
flufl.bounce. This run scored five more, taken from the `mail` gem's fixtures (MIT).
All five were classified correctly. The bug showed up one step later.

Two of the files are delivery reports for a message sent to five addresses, all
rejected. The parser read the first `Final-Recipient` line and stopped, so one
address was marked bounced and four stayed in the cadence. A sender who keeps
mailing dead addresses hurts their own reputation.

The fix collects every recipient whose group says `Action: failed` with a 5.x.x
status, and emits one block per address. A test runs the real file and checks
that exactly those five prospects end up bounced and an unrelated one does not.

Limits: five files is a small sample, and fixtures are not a live inbox. The
sales agent has still not read a real mailbox.
