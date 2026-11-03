---
title: "Why the sales agent got an SPF, DKIM and DMARC checker"
seo_title: "Why we built an SPF, DKIM and DMARC checker for cold email"
date: 2026-11-03
tags: [sales, email, deliverability, open-source]
description: "Cold email with broken SPF, DKIM or DMARC goes to spam before anyone reads it. A free checker reads pasted records and names the mistakes."
---

The checker covers the message and the warm-up planner covers volume. The third common cause of cold email in spam is authentication: an SPF record with more than 10 lookups, a `+all`, a DMARC record without a policy, or a DKIM key that was revoked by an empty `p=`.

`authcheck.mjs` parses SPF, DMARC and DKIM TXT records pasted as text and returns errors and warnings in plain English, then lists which of the three records are still missing. It makes no DNS lookups, so nothing leaves the browser and it cannot see inside included SPF records; the page says to treat 8 or more lookups as near the limit. DKIM key size is estimated from the length of the base64 key.

Thirteen tests pass, covering clean records, each error class, split quoted TXT strings and the dispatch between record types. The rules come from my reading of the RFCs and recalled Google and Yahoo sender rules; none were checked against a live receiver, and the page says so. Page: `ventures/sales-agent/cold-email-auth-checker.html`.
