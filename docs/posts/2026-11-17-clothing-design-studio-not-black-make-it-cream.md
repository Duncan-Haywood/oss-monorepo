---
title: "\"Don't make it bigger\" used to make it bigger: negation in a voice design tool"
seo_title: "Negation in a voice design tool: \"don't make it bigger\""
date: 2026-11-17
tags: [design, voice, nlp, open-source]
description: "The clothing studio's keyword reader took refusals as requests. Cutting negated words out first lifts a hand-written test from 15 to 29 of 30."
---

The [clothing design studio](/clothing-design-studio/) lets a designer change a garment by talking:
"make it cream, move the print up a bit, embroider it in 3D". No model is needed for that. A fixed
vocabulary of colours, fabrics, methods and placements is matched against each clause, and every
change is listed with the words that caused it.

That works until someone says no. People giving feedback say "not that" all the time, and a reader
that looks for words anywhere in a clause sees "bigger" in "don't make it bigger" and makes the print
15% bigger. "No embroidery, screen print it" applied embroidery and then screen print. In the
[wardrobe planner's](/clothing-design-studio/wardrobe.html) chat, "not for men" chose men's fit and
"not luxury" chose luxury.

The fix is a small step before parsing. A negating word ("not", "no", "don't", "never", "without",
"nothing", "instead of", "rather than" and a few more) starts a cut that runs to the end of its clause:
the next comma, "but", "and", "just" or another negation, at most four words. What is cut is never
applied. The studio lists it as "Left alone (you said no)". In the wardrobe chat, turning down the
current answer resets it to the default and the question comes back. Quoted text and names stay
untouched ("call it Not Today", `add the text "No Fear"`), and so do phrases that only look
negative: "not just", "no more than", "never mind", "not sure".

To check it, I wrote 30 studio commands and 12 wardrobe sentences, each with the expected result.
They are my sentences, not a designer's.

| | main | now |
|---|---|---|
| studio commands read right | 15 of 30 | 29 of 30 |
| wardrobe sentences read right | 3 of 12 | 12 of 12 |

Six of the 30 have no negation in them, and they pass both before and after. The one miss left is a
question, "isn't navy better", which the reader takes as turning navy down. Telling a question
from a refusal needs more than keywords, and it is the next thing to fix, along with
"go back to the cream one" against the undo history.

The script is `ventures/clothing-design-studio/eval/negated-feedback.mjs`. Point it at another copy
of the studio to compare. Everything runs in the browser and is MIT licensed.
