---
title: "\"Go back to the cream\": questions and history in a voice design tool"
seo_title: "Questions and undo by name in a voice design tool"
date: 2026-11-17
tags: [design, voice, nlp, open-source]
description: "A voice design tool read questions as orders and \"go back\" as one undo. Sorting questions and resolving history: 12 to 19 of 20 held-out sentences."
---

The [clothing design studio](/clothing-design-studio/) lets a designer change a garment by talking
to it. Earlier today it learned to leave refusals alone ("not black, make it cream"). The one
sentence that fix still got wrong was a question: "isn't navy better?" was read as turning navy down.

Questions turned out to be a bigger hole than that one sentence. A keyword reader looks for words
anywhere in a clause, so it treats every clause as an order:

- "Is embroidery more expensive?" switched the print to embroidery.
- "Does fleece work with embroidery?" changed both the fabric and the method.
- "Which is cheaper, dtg or screen print?" chose DTG.

People also point back at what they saw a minute ago, and the reader had no memory of it. "Go back to
the cream" ran one undo, so if the last change was the print method, the method went back and the
garment stayed navy. "Undo the last two", "the previous colour" and "start over" were not
understood at all.

## Three kinds of question

A new step sorts each clause before the parser sees it:

1. **A question for information** changes nothing. The studio answers it in the log. Cost questions
   are answered from the designer's own supplier sheet: each alternative the question names is
   applied to a copy of the design and costed the same way as the costing panel. "Which is cheaper,
   dtg or screen print?" gives both landed costs and names the cheaper one. Fabric and method
   questions get the method's note and the things to check with the maker for that pairing.
2. **A suggestion asked as a question** ("isn't navy better?", "what about a crewneck", "why not
   embroider it", "what if we made it bigger") is tried. Every change is undoable, and someone who
   asks "what about navy?" wants to see navy. The log marks it "Trying it (you asked)".
3. **A polite order** ("can you make it cream", "could you move it up a bit") is still an order.

Voice input has no question marks, so the sorting uses the words that open the clause. A typed "?"
helps: "maybe olive?" is a suggestion, "navy?" on its own is a question.

## References to earlier versions

The command box now gets the session's history, oldest version first, and resolves what a sentence
points at:

- "Go back to the cream" or "the hoodie looked better" restores that value only, keeps everything
  done since, and says how many changes ago it was seen.
- "The previous colour", "the original size", "the old position" and "the other one" find the last
  version where that attribute was different (or the first one) and restore just that attribute.
- "Undo the last two" and "go back three steps" undo that many steps. "Back to the original" and
  "start over" return to the first version, and one undo brings the current one back.

## How it was checked

I wrote 41 sentences while building this, each with the design it should leave behind after a
scripted session (a black tee, then cream, a hoodie, a moved and enlarged halo, navy, screen print).
The code on `main` got 17 right. The new code gets 41, which is expected for sentences written
alongside it. So after freezing the code I wrote 20 more. `main` got 12 of those and the new code got
19. The miss was "what if we did it in white", read as a question. That pattern was added afterwards,
so those 20 are no longer held out.

The cost answers are checked against the costing function itself: an answer equals the landed cost
of the design with that change applied. Like the costing panel, they are only as good as the
supplier sheet behind them.

None of these sentences came from a real designer, and browser speech recognition adds its own
mistakes. Recorded feedback from a designer working on a real garment is still the test that
matters. The script and full results are in the venture's
[`eval/history-questions-2026-11-17.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/clothing-design-studio/eval/history-questions-2026-11-17.md).
