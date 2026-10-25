---
title: "A sales inbox agent should read the mail headers before the words"
date: 2026-10-25
description: "Sales Agent's IMAP poller now treats a delivery-status report, a temporary failure and an Auto-Submitted header as signals, so bounces hit the right prospect."
tags: [sales-agent, email, engineering]
---

Sales Agent's reply triage began as keyword rules, and keyword rules read
agent-written replies right only 66 to 83% of the time. Two kinds of mail
need no guessing, because the mail system labels them.

- A delivery-status report (RFC 3464) says `Status: 5.x.x` for a permanent
  failure and `4.x.x` or `Action: delayed` for a temporary one, and
  `Final-Recipient` names the address that failed. Before, a bounce came from
  `mailer-daemon`, so the agent could not say whose address was bad. Now the
  right prospect is marked bounced, and a delayed message only pauses.
- `Auto-Submitted: auto-replied` (RFC 3834) or `X-Autoreply` marks an
  auto-responder, so "I am back on 2 November" pauses the cadence until then.

Everything still only reduces contact. The tests use hand-built messages, not
a real server's output, and the README says so. Code:
`ventures/sales-agent/self-host/imap.mjs` and `engine.mjs`.
