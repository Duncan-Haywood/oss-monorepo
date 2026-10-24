---
title: "An AI sales agent that can send email, but only when you click"
date: 2026-10-24
description: "How the self-hosted Sales Agent gained SMTP sending with five guards, and what we could not test."
tags: [ai-agents, sales, email, self-hosted]
---

# An AI sales agent that can send email, but only when you click

The self-hosted Sales Agent reads your own mailbox over IMAP, sorts each reply
(unsubscribe, interested, question, out of office) and drafts an answer into an
approval queue. Until today it could not send anything. It now can, with the
smallest send path we could build.

## The guards

- **Off by default.** No `SMTP_HOST`, no button.
- **A person's click.** Approving a draft does not send it. A second button does,
  and there is no timer, loop or batch endpoint.
- **Once.** A sent draft is marked and refuses a second send.
- **Never to a suppressed address**, checked at send time, not only at triage.
- **A daily cap** (20 by default), and every attempt, refusal and server answer
  goes into an append-only audit log with the SMTP password redacted.

Each message is a reply (`In-Reply-To`) with `List-Unsubscribe: <mailto:...>`.
Header values lose line breaks so a prospect's subject cannot inject a `Bcc:`.
A test fails if a second call site for the send function ever appears.

## What we did not test

The SMTP client is about 70 lines, written by hand, and was run only against an
in-memory fake server. The STARTTLS and implicit TLS branches, Gmail and Outlook
quirks, and deliverability (SPF, DKIM, DMARC on a new domain) are untested. The
next step is a real mailbox on a deployer's own account. Code and tests:
`ventures/sales-agent/self-host/`.
