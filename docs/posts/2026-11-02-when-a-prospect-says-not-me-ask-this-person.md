---
title: "When a prospect replies 'not me, ask Priya', the agent should say so"
seo_title: "Handling wrong-person replies to cold email in six languages"
date: 2026-11-02
tags: [sales-agent, cold-email, replies, evaluation]
description: "A probe of 14 wrong-person replies found 10 the sales agent filed as unclear. Now 13 route correctly. What changed, the cost, and what is unmeasured."
---

Cold outreach gets a lot of "I'm not the right person." The reply is useful: it often names who is. The open-source [sales agent](../../ventures/sales-agent/README.md) already had a `left_company` category for it, with a referral address pulled from the text.

I wrote 14 invented replies in the many ways people actually refer you on ("direct all inquiries to...", "my replacement is...", "this goes to Dave in finance", "who runs this", plus Spanish, French and German "wrong person") and ran them through the classifier. **Ten were filed as `unclear` or, worse, as `interested`.** "Looping in Sam who owns this" was read as a positive reply.

Changes (`ventures/sales-agent/engine.mjs`):

- Wrong-person phrasings added for English ("I left X", "who owns/runs this", "passed your note on to", "this goes to") and for Spanish, French, German, Italian, Portuguese and Dutch.
- The referral extractor now recognises more verbs, so the named address reaches the owner's task list ("X pointed you to Y; add them yourself").

Result on the probes: 13 of 14 route correctly. The one left, "forwarded your email to the right team", has no named person and stays `unclear` on purpose. On the agent's existing labelled sets, two more replies were right (one on each of two sets) and none got worse.

Caveats, plainly: the probes are invented by the same author as the rules, so 13/14 is a floor on coverage of my own imagination, not a measured accuracy. Wanted: real human replies. The agent still never starts a cadence for the referred person; it hands the address to its owner.
