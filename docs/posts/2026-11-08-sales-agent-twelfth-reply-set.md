---
title: "Twelfth reply set for the sales-agent triage: 25 of 30 before patching, 30 of 30 after"
seo_title: "Cold email reply triage: a twelfth test set, a missed Dutch opt-out"
date: 2026-11-08
tags: [sales-agent, evaluation, cold-email]
description: "Thirty fresh cold-email replies in six languages scored once before any change: 25 right, one unsubscribe missed. What we patched and what we did not trust."
---

The sales-agent sorts replies to cold email into ten categories (unsubscribe, not interested, not now, out of office, objection, question, interested and so on) with plain rules, so a person can see why a reply landed where it did. Each round we write a fresh set the rules have never seen, score it once, and only then patch.

This round (30 replies, Dutch, Portuguese, Italian, German and English): **25 right before the change, one overreach, one opt-out missed.** The miss that matters is Dutch: "Haal me van je lijst af alstublieft. Geen mails meer." went to a person instead of the suppression list. Missing an opt-out is the costly error in this work, so that one was patched first.

Three narrow patches: a Dutch opt-out, a conditional not-now ("once we close our funding round, probably spring" is a date in disguise), and a deliverability worry ("sends spam under our name, we got burned before") that is an objection. Two labels were ruled rather than patched: a competitor renewal and "how does this differ from X" are objections, as the rules and earlier sets already treat them. Result: 30 of 30, the older sets unchanged, 41 engine tests passing.

The caveat stands. The replies and the labels were written by the same agent that patched the rules, so 30 of 30 is a tuned score, not a forecast. What the set cannot tell us is how real prospects write; that needs real replies from a user's own mailbox, which is why the self-host version runs on the user's machine.
