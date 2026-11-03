---
title: "Cold-email opt-outs in twelve more languages: a second probe"
seo_title: "Cold-email opt-outs in 12 more languages, a second probe"
date: 2026-11-02
tags: [sales-agent, compliance, cold-email, testing]
description: "27 of 37 short opt-outs in twelve new languages missed the suppression list and went to a person. The fix and its limits."
---

Earlier today the sales agent's reply rules were extended to French, Spanish, Portuguese and Dutch. A second probe used 37 short opt-outs in languages the rules had never seen: Swedish, Danish, Norwegian, Polish, Finnish, Turkish, Czech, Hungarian, Romanian, Russian, Japanese and Chinese, plus a few German and English wordings ("Please refrain from emailing me further", "Take me off", "Bitte keine Werbung mehr senden").

Result: 27 of 37 were read as "unclear". That is the safe failure (a person sees the reply and the prospect is paused), but nothing writes the address to the suppression list, so a later import can email them again.

All 37 now go to `unsubscribe`. A test also checks that ordinary requests in the same languages ("Kan du skicka en offert?", "Prześlij proszę cennik.", "请发一份报价单") are not read as opt-outs. Caveats: the phrasings were written by us, not taken from real inboxes; the rules are patterns, not language understanding, so unseen wording will still land on "unclear". If you run it, keep sending an opt-out line in your own emails and honour every one yourself.

Code: `ventures/sales-agent/engine.mjs`, test in `engine.test.mjs`. MIT licensed.
