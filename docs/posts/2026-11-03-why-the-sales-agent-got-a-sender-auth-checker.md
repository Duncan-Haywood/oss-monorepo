---
title: "Why the sales agent got an SPF, DKIM and DMARC checker"
seo_title: "Free SPF, DKIM and DMARC record checker for cold email"
date: 2026-11-03
tags: [sales, email, deliverability, open-source]
description: "Good copy and a slow ramp still land in spam if the domain does not authenticate. A free checker reads pasted SPF, DMARC and DKIM records and lists what to fix."
---

The sales agent already had a message checker and a warm-up planner. The third common cause of cold email in spam is the domain itself: no DMARC record, two SPF records, a `+all`, an SPF chain over the 10-lookup limit, or a DKIM key that was revoked or is only 1024 bits.

`authcheck.mjs` takes the three TXT records a person pasted and returns errors, warnings and notes, each tagged with the record it came from. It makes no DNS lookup, so the page runs in the browser and nothing leaves it. Eight tests cover each rule and the combined result.

Limits, stated on the page: the rules come from memory of RFC 7208, 7489 and 6376, not from the texts; the lookup count covers the pasted record only, not what each include adds; the DKIM key size is estimated from the key's length. It has not been run on real domains. Page: `ventures/sales-agent/sender-auth-checker.html`.
