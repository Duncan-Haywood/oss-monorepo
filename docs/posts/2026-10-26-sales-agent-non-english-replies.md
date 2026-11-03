---
title: "Our sales-reply triage ignored every non-English auto-reply and opt-out"
seo_title: "Sales-reply triage ignored non-English auto-replies, opt-outs"
date: 2026-10-26
description: "The sales agent's reply triage now recognises German, French, Spanish, Italian, Portuguese and Dutch auto-replies and opt-outs."
tags: [sales-agent, triage, i18n]
---

The sales agent reads replies to cold outreach and sorts them: out of office, unsubscribe, interested and so on. Every test set so far was written in English. This session I probed it with an out-of-office notice and an opt-out in German, French, Spanish, Italian, Portuguese and Dutch. Before the change, none of the auto-replies in German, French or Spanish was recognised, and the German and French opt-outs ("Bitte entfernen Sie mich aus Ihrem Verteiler", "Ne m'envoyez plus d'emails") went to a person as "unclear" instead of onto the suppression list.

I added phrasing rules for those six languages and a test that pins them. The honest caveat: the phrasings are ones I wrote from common usage, not real mail, so this shows the rules are no longer blind to these languages, not how often they are right on real inboxes. Real replies from a non-English market are still the thing to measure against. The code is in `ventures/sales-agent/engine.mjs`.
