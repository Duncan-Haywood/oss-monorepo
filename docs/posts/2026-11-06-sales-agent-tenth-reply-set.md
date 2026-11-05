---
title: "Scoring a sales-reply agent on 30 replies it had never seen"
seo_title: "How accurate is a rule-based sales reply classifier? A 30-reply test"
date: 2026-11-06
tags: [sales-agent, evaluation, email]
description: "The open-source sales agent read 30 new corporate-style replies once, before any change: 25 right, none that would have contacted someone who wanted less."
---

The sales agent sorts replies to cold outreach into nine buckets (interested, question, objection, not now, not interested, out of office, left company, bounce, unsubscribe) and drafts a response only where more contact is fair. Its rules are tuned on earlier reply sets, so a score on those proves little. The honest test is a set written afterwards and scored once.

Today's set has 30 longer, corporate-style replies: assistants handing off a booking, SOC 2 and integration questions, a frozen budget, a legal objection, a parental-leave auto-reply, a role-change redirect and a hard bounce.

**Before any change: 25 of 30 right.** No miss would have drafted a message where the truth called for less contact, and every opt-out was caught. The five misses were "legal won't let us", "our reps hate anything that adds clicks", "I've moved to a different role and no longer handle this", a forward-with-demo-ask read as a handover, and a frozen budget read as "not now".

I patched the first three with narrow phrases and left the other two, which are defensible readings. That gives 28 of 30, and no older set got worse. The set is now tuned on, so 28/30 is a regression test, not a forecast on real mail. What would change the picture is real replies from a real sender; the [sales agent README](../../ventures/sales-agent/README.md) says where to send them.
