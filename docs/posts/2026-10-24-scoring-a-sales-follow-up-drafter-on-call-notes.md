---
title: "Scoring a sales follow-up drafter on call notes: 34 of 40 before the fix"
seo_title: "Scoring a sales follow-up drafter on call notes"
date: 2026-10-24
description: "A sales agent turns call notes into a follow-up email. Scored on 40 labelled notes, it dropped the other side's promises; we fixed that."
tags: [sales, evaluation, ai-agents, open-source]
---

# Scoring a sales follow-up drafter on call notes: 34 of 40 before the fix

The sales agent in this repository writes the post-call follow-up email from your own notes, one point per line. It sorts each line into four buckets: recap, what you promised, what they promised, and the dated next step. The email quotes only what is in your notes.

That only works if the sorting is right. A promise filed as "recap" never makes it into the "what I will do" list, which is the part of the email the prospect holds you to.

We wrote 40 labelled one-line notes (an agent wrote them, which flatters the rules, because the author had read them) and scored the sorter before changing anything: **34 of 40, 85%**.

The misses were all the same kind of thing:

- "He'll loop in the finance lead", "They'll share the current route file", "They are going to send over the contract" and "She said she will get back to us on Monday" were read as recap. The rule knew "she will" but not the contraction, "are going to" or "said she will".
- "Send the sample file by Friday" is a to-do in the rep's own shorthand, filed as recap.
- "Need to send them the pricing" went to the wrong side: the rule took "Need" for a person's name.

After widening the patterns the sorter reads all 40, and a new test covers the cases. Read that as a regression floor, not an accuracy figure: the real test is a rep's actual notes, which we do not have yet.

Run it: `node ventures/sales-agent/eval/followup.mjs`. The data and the method are in the repo under `ventures/sales-agent/eval/`.
