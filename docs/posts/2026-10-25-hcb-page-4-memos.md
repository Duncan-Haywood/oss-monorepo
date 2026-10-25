---
title: "A fourth slice of real card memos: 40.5% before any rule saw them"
date: 2026-10-25
description: "ai-bookkeeper's keywords on 168 held-out Hack Club HCB card charges from page 4: 40.5% suggested, 56.0% after four tuned rules."
tags: [ai-bookkeeper, accounting, evaluation]
---

We keep measuring [ai-bookkeeper](../../ventures/ai-bookkeeper/)'s built-in
keyword layer on card memos it has not been tuned on. This time: 168 card charges
from the first 40 transparent organisations on page 4 of Hack Club's public HCB feed.

**Held out: 68 suggested (40.5%).** Earlier held-out readings were 17.6% and 38.9%,
so the layer holds up on new organisations. The misses were mostly what should stay
blank: bare `amazon` (27), Walmart, Target, Costco, groceries. The rest was a long
tail: Postmark, ElevenLabs, Misumi, CannonKeys, merch printers, ezCater.

**After four rules: 94 (56.0%).** Written from the same list, so tuned, not held
out. Memos have no category in this feed, so this is coverage; a reader's check of
the hits found nothing plainly wrong. Labelled real books are still the missing piece.

Rerun: `node ventures/ai-bookkeeper/eval/hcb-memos.mjs --orgpage 4 --from 0 --to 40`.
