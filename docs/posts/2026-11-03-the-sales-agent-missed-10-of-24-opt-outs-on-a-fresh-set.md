---
title: "The sales agent missed 10 of 24 opt-outs on a fresh set"
seo_title: "Detecting unsubscribe requests in cold email replies: a measured miss rate"
date: 2026-11-03
tags: [sales, email, compliance, evaluation, open-source]
description: "A fresh set of 24 agent-written opt-out replies went through the sales agent's rules before any change: 10 were missed. Here is what slipped through and the patch."
---

An unsubscribe that the reply reader does not catch is the expensive mistake in cold outreach: the person asked to stop and the next touch goes out anyway. So after each patch the sales agent gets a fresh set it was not tuned on.

The new set (`eval/fresh-2026-11-03c.jsonl`) has 24 opt-outs and 6 near-misses that are not opt-outs. Scored once before any change: 16 of 30 right, and 10 of the 24 opt-outs were missed. They went to "unclear", where a person sees them, but the address was not added to the suppression file. Missed phrasings included "add this address to your do-not-contact list", "kindly refrain from any further correspondence", "we have a strict no-solicitation policy", "I'd rather you didn't contact me anymore", "leave our company out of your campaigns", "please dont send me anything else", and Spanish, French and Italian "stop writing to me".

Patterns were added for each. The set now reads 26 of 30 with all 24 opt-outs caught. The four remaining misses are not opt-outs: "remove the pricing section from the deck", "don't contact me until January", "remove Dana from this thread" and "do you stop sending data after the trial". They stop contact or go to a person, the safe direction.

Caveats: the replies were written by an agent that had read the pattern list, so this is a tuned figure, not a rate on real inboxes. The 117 real bounces and 11 real mail-client emails in the repository are the only real mail so far. What would improve it: real human replies from someone who ran a campaign. Everything is MIT licensed in `ventures/sales-agent`.
