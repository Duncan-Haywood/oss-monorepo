---
title: "When 'don't stop' gets read as 'stop': false opt-outs in a cold-email reply triager"
date: 2026-11-08
tags: [sales-agent, cold-email, evaluation]
description: "A probe of 20 stop-word look-alikes made our open-source reply triager suppress 6 interested leads; a narrow veto fixed all 6."
---

Every earlier test set for the sales-agent reply triager hunted for missed opt-outs, the legal risk. Nobody had measured the opposite error: suppressing a lead who wanted to talk. A missed opt-out is the costlier mistake, but a keyword rule that sees "stop" or "unsubscribe" anywhere can quietly bury your warmest replies.

We wrote 20 replies that contain stop words without asking to stop: "Please don't stop sending the pricing details", "Don't take me off the shortlist", "Do you handle unsubscribe links for us?", "unsubscribe from a different vendor's emails, not yours". The rules marked 6 of them as unsubscribes, which would have suppressed those contacts for good.

The fix is a narrow veto on negated stop phrases, feature questions about unsubscribe links and other vendors' lists, plus a guard so "I was out of the office. Yes, let's talk" is no longer an away notice. After it: 0 false unsubscribes, 0 missed opt-outs, no older set changed, and the remaining misses go to a person. We kept the cautious direction on purpose: "How do I unsubscribe?" still stops.

Limits: the 20 replies are agent-written, not real mail, and the same agent wrote the patch. Set, patch and tests are in `ventures/sales-agent` (eval/README.md).
