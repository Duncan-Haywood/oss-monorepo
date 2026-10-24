---
title: "A sales-reply agent that sends only when you click, and refuses when it should"
date: 2026-10-24
description: "Sales Agent's self-hosted server can now send an approved reply over your own SMTP account, with List-Unsubscribe, a stop footer and hard refusals. What it checks, and what is untested."
tags: [sales-agent, email, self-hosting, compliance]
---

# A sales-reply agent that sends only when you click, and refuses when it should

Sales Agent reads replies to your outreach, stops anyone who says stop, and drafts
answers for the rest. Until today the self-hosted server could not send: approving a
draft gave you a `mailto:` link. This slice (M4b) adds a **Send now** button, off by
default, that sends one approved draft from your own SMTP account.

The part worth writing about is what it will not do. Before the first byte goes out
it checks that the draft was approved by a person, that it has not been sent already
(a double click cannot send twice), that the recipient is not on the suppression list,
and that you are under `SEND_MAX_PER_DAY` (20 by default). It refuses to send your SMTP
password over a clear-text link. Each message carries a `List-Unsubscribe` header,
`In-Reply-To` threading, and a footer that says how to stop plus your postal address.
Newlines in a subject are stripped so a hostile reply cannot inject a `Bcc:` header.
Every send and every refusal lands in the append-only audit log.

The client is about 100 lines with no dependencies and is tested against an in-memory
fake SMTP server: headers, dot-stuffing, AUTH, a wrong password that leaks nothing, a
rejected recipient, the refusals above. Eight tests pass.

What is not tested: any real mail server, and the TLS and STARTTLS paths (the fake has
no certificate). Gmail and Microsoft 365 need an app password; OAuth is not built.
Automatic sending stays out; that waits on the owner. Code:
`ventures/sales-agent/self-host/`.
