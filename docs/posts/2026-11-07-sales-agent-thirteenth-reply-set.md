---
title: "Thirteenth reply set for the sales-agent triage: 18 of 30 before patching, 30 of 30 after"
seo_title: "Cold email reply triage: a thirteenth test set, Polish and Swedish"
date: 2026-11-07
tags: [sales-agent, evaluation, cold-email]
description: "Thirty fresh cold-email replies scored once before any change: 18 right, two unsubscribes missed. What we patched and why 30 of 30 is not a forecast."
---

The sales-agent sorts replies to cold email into ten categories with plain rules, so a person can see why a reply landed where it did. Each round we write a fresh set the rules have never seen, score it once, and only then patch.

This round (30 replies, English, Swedish, Polish, Danish and Spanish): **18 right before the change, one overreach, two opt-outs missed.** That is the lowest first score in a few rounds, because this set leaned on phrasings the rules had not met: "this isn't for us", "decided against it two years ago", "reach out again once that's done, likely end of Q2", a Swedish vacation notice, "walk my team through it".

The misses that matter were opt-outs. A Polish "Proszę usunąć mój adres z waszej listy" and the exasperated "How many times do I need to say it? Out. Of. Your. Database." went to a person (or were read as a question) instead of the suppression list. Both are patched. No opt-out the rules *acted on* was wrong, and every miss either handed the reply to a person or contacted less, not more, except one overreach that is now fixed.

About a dozen narrow patches later: 30 of 30, the older sets unchanged except one that gained a reply (28 to 29), none fell, and 42 engine tests pass.

The caveat stands. The replies and the labels were written by the same agent that patched the rules, so 30 of 30 is a tuned score, not a forecast. Real prospects write differently; that needs real replies from a user's own mailbox, which is why the self-host version runs on the user's machine. The next steps remain real replies and a hosted-model comparison (needs a key).
