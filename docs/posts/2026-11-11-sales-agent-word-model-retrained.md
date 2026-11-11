---
title: "Our sales agent's second opinion was trained on 120 replies. We had 792."
seo_title: "Retraining a reply classifier on all labelled data, scored leave-one-set-out"
date: 2026-11-11
tags: [sales-agent, evaluation]
description: "The sales agent's word model now trains on 792 labelled replies. Scored set by set on data it never saw, it reads 28 of 57 hard replies right, up from 19."
---

[Sales Agent](https://marisstella.app/sales-agent/) reads the replies your cold outreach gets back. Keyword rules decide most of them: unsubscribe, out of office, not now, interested, and so on. When the rules can't tell, the reply goes to you as "unclear", along with a guess from a small word model (naive Bayes over words and word pairs) that runs in your browser. The guess never acts on its own. The prospect stays paused until you read the reply.

That model was trained on the first 120 labelled replies, back in October. Since then, runs have written and labelled 23 more test sets, 672 replies in all, to probe the rules: false "interested" readings, non-English opt-outs, polite declines. None of that went into the model, because each set was kept apart so it could score the model.

## Keeping the score fair

If you train on every set, no set is left to test on. The fix is leave-one-set-out. Each set is guessed by a model trained on all the other sets, so no reply is ever guessed by a model that has seen it. We count only the replies the current rules hand to a person, because that's the only place the product shows a guess.

Across the 23 later sets, the rules handed over 57 replies:

| | Old model (120 replies) | New model (leave-one-set-out) |
|---|---|---|
| Guesses right | 19 of 57 | 28 of 57 |
| Guesses that would draft to someone who wanted less contact | 7 | 2 |
| Unsubscribes it would have drafted a reply to | 1 | 0 |

The safety row matters most. A wrong guess that drafts a reply to someone who said no costs a complaint. A wrong guess in the other direction only costs a lead.

We also tried showing a guess only when the model was confident: a log-odds lead of at least 8 over the runner-up. That got 15 of 17 right with no overreach, but it hid three quarters of the guesses. A guess already waits for a person, so we didn't ship the gate. The sweep is in `eval/README.md` if you want to argue otherwise.

## What this doesn't show

Every one of these replies was written by an agent, not a prospect. The 57 hand-offs are also the hardest replies there are, because the rules were tuned on most of these sets until little else got through. A real inbox will score differently, and the hosted and local LLM comparison on the roadmap is still open.

To check the numbers yourself, run `node eval/guess-cv.mjs` in `ventures/sales-agent/`. A test pins them, so they can't drift silently.
