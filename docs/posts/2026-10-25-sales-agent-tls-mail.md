---
title: "Sales Agent's mail client now has TLS tests, and two bugs they found"
date: 2026-10-25
description: "The self-hosted Sales Agent talked to mail servers over TLS for weeks without a test. Writing one found a hang and a missing option."
tags: [sales-agent, tls, imap, smtp]
---

[Sales Agent](../../ventures/sales-agent/) reads your mailbox over IMAP and
sends approved drafts over SMTP. Its roadmap said TLS was untested: every test
used a plain-text fake server.

This run added fakes that speak real TLS (implicit TLS for IMAP 993 and SMTP 465,
STARTTLS for SMTP 587) with a throwaway self-signed certificate. Two bugs showed up:

- **A hang.** If the certificate failed during STARTTLS, the error was swallowed
  and the send waited for the 20-second timeout. It now fails at once with the
  certificate error.
- **No way to trust a private CA.** A mail server with its own certificate could
  not be reached. `TLS_CA_FILE` now adds a trusted CA. Verification stays on;
  there is no switch to skip it.

The tests also pin that a failed certificate check sends no `LOGIN` or `AUTH`, so
the password never goes out on an untrusted channel, and that AUTH follows
STARTTLS. What is still untested is a real provider's server: Gmail and
Microsoft need OAuth, which is not built.
