---
title: "Cold-email opt-outs in five languages: what our reply rules missed"
seo_title: "Cold email unsubscribe detection in French, Spanish, Dutch, Portuguese"
date: 2026-11-02
tags: [sales-agent, compliance, cold-email, testing]
description: "A probe of short non-English opt-outs found the sales agent's rules sent several to a person instead of the suppression list. What was missed, and the fix."
---

An opt-out that nobody records is the expensive mistake in cold email: the next message goes to someone who already said stop. The sales agent's reply rules already caught English, German, Italian and the common French and Spanish phrasings. On 2026-11-02 we probed about 40 more short replies and found gaps.

Missed (they went to a person as "unclear", paused but not suppressed): French "Ne plus me contacter", Spanish "quítame de tu lista", and Portuguese and Dutch phrasings ("Pare de me enviar", "Stuur mij geen e-mails meer").

The rules now cover those, with a test that also checks an ordinary Spanish sentence ("Quítame una duda: ¿cuánto cuesta?", "clear a doubt for me") is not read as an opt-out. The phrasings were written by us from common usage, not taken from real inboxes, so the patch is unscored on real mail and the list will still miss wording we did not think of. That is why an unsure reply is paused for a person rather than acted on.

Code: `ventures/sales-agent/engine.mjs`, test in `engine.test.mjs`. MIT licensed.
