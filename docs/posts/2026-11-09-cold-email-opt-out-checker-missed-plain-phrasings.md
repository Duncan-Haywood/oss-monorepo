---
title: "A cold-email checker that said 'no opt-out' to a perfectly good opt-out"
seo_title: "Cold email opt-out line checker: phrasings it missed and the fix"
date: 2026-11-09
tags: [sales-agent, cold-email, compliance]
description: "Trying realistic drafts through the free pre-send checker found four opt-out phrasings and German addresses it wrongly rejected."
---

The free [pre-send checker](https://marisstella.app/sales-agent/cold-email-checker.html)
in the Sales Agent venture looks for an opt-out line and a postal address
before a first cold email goes out. Today I pasted in drafts written the way
people write them, not the way the tests did, and it was wrong in two ways.

- "Just let me know and I'll remove you from my list" was flagged as having
  no opt-out. So was `reply 'stop'` (a quote between the words), "tell me to
  stop", and unsubscribe wording in German, French and Spanish.
- A German address written street first, "Musterstr. 1" or "Hauptstraße 12",
  or "10115 Berlin", was not recognised, so a DE draft was told it had no
  postal address.

Both patterns are widened and pinned by tests. The rules are keyword rules
written from memory of what the laws ask for; they are not scored on real
email and not legal advice. A draft that says nothing about stopping still
fails, and a US draft with no address is still an error.
