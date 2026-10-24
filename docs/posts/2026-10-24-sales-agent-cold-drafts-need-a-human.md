---
title: "Cold-email drafts go through the same approval queue as replies"
date: 2026-10-24
description: "The self-hosted Sales Agent now takes first-touch drafts from a CRM export into its approval queue, with the same gates as reply drafts."
tags: [sales-agent, email, self-hosting, compliance]
---

# Cold-email drafts go through the same approval queue as replies

The self-hosted Sales Agent already read your inbox and queued reply drafts for a
person to approve. Its research agent already ranked a CRM export and wrote
first-touch drafts, but those lived in CSV files, outside the queue and outside the
audit log.

They now go in the same queue. `POST /api/research` with the export's CSV text
adds one outbound item per ranked account. What the queue does with them:

- Suppressed addresses, opted-out rows and consent-region rows (Canada, Germany,
  Austria) never enter it.
- A second upload of the same export adds nothing.
- A draft still holding `[placeholders]` cannot be approved until they are filled.
- Nothing sends without an approval and a click on Send. The message goes out
  without a `Re:` prefix and with the List-Unsubscribe header every send carries.
- Every queued draft is written to the append-only audit log.

Tested against fake SMTP and IMAP servers and a hand-built HubSpot-style export,
not a real mailbox or a real export. That is still the next step.
