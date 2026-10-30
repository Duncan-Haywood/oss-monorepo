---
title: "A backup-sitter network for babysitters, with the family's OK on record"
date: 2026-10-30
tags: [babysitting-business-kit, consent]
description: "Pass on work you can't take to sitters you trust: ranked backups, drafted messages, recorded consent, a sick-day list and a signed server-to-server handoff."
---

A one-person babysitting business turns work away every week: a Friday already booked, a baby younger than the sitter takes, a sick day. Each "sorry, I can't" is a family that goes back to a marketplace. The [Babysitting Business Kit](https://duncan-haywood.github.io/oss-monorepo/babysitting-business-kit/) now has a **Network** tab so that work goes to someone the sitter trusts instead.

**Backup sitters.** Each one has the ages they take ("6 months-12", "5+", "infants to 8"), how many kids at once, their area, when they are usually free ("Mon-Fri 15-22"), notes, and whether the sitter has seen their CPR card. For an inquiry the sitter can't take, the app ranks backups on a 0 to 100 score: +15 when every child is inside their ages, +20 when the requested time is inside their usual hours, +10 for a seen CPR card, -40 for a child outside their ages, -30 for too many kids. Each suggestion shows why and what to check. A family's beliefs are not an input; a test checks that a lead asking for bedtime prayers ranks the backups exactly as one that does not.

**Consent before contact.** The app drafts two messages. To the family: "I'm already booked, but my friend Beth is wonderful... Would you like me to pass on your first name, the kids' ages and the time? I'll only give Beth your number if you say so." To the backup: the first name, ages and time, and the family's phone or email **only** after the sitter records that the family said yes to that, with the time and how (text, email, call, in person). "They changed their mind" withdraws it.

**Sick day.** Pick N days and the tab lists every booked sit in that window, including each date of a weekly repeat, with a backup offer if one scores 50 or more, or a cancellation message that says there is no fee. One click skips that date of the repeat, or marks a single sit cancelled with a $0 fee.

**Referrals both ways.** Families passed on and how many booked, per backup; leads backup sitters sent in (by server handoff, or a "How did you hear" that names them); and families who referred families, reusing the referral codes the Print tab already puts on cards.

**Two servers, one signed request.** If both sitters self-host the kit, the sending server POSTs to `/network/handoff` on the other one: a JSON body of first name, kids' ages, requested time and the time the family agreed, signed with HMAC-SHA256 over `timestamp.body` with a secret each pair sets in `NETWORK_PEERS`. The receiver refuses unknown peers (404), bad signatures and timestamps more than 5 minutes off (401), bodies over 4 KB, and more than 50 a day per peer; the same handoff sent twice makes one lead. The sender refuses to send without a recorded OK (409). It is off until `NETWORK_ID` and `NETWORK_PEERS` are set.

Ten new tests cover the age parser, the ranking, the consent gating, the sick-day list, the referral counts, and two in-process kit servers handing a lead from one to the other, where the test asserts no surname, phone number or notes crossed over.

The kit is free and MIT. Message drafts are a starting point; you know your families and your friends better than any score.
