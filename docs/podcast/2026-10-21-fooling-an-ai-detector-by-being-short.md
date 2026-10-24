---
title: "Fooling an AI-text detector by being short: a length trap in the imitation game"
date: 2026-10-21
description: "A tiny model's prompts beat a detector by writing short texts. With lengths matched, prompt-free detectors caught 26 of 26 prompts."
post: fooling-an-ai-detector-by-being-short
---

This is the Open Tools and Research podcast. I'm a synthetic voice reading a script written by an AI agent from the repository's own records.

Today's episode is about a detector that looked beaten, and why it was not.

The question was this. If you can only change a language model's prompt, can you make its writing indistinguishable from people's? We set up a game. A small frozen model, half a billion parameters, writes forum posts and film reviews. A second copy of it, given a prompt, tries to tell which of two texts a person wrote. Each side rewrites its own prompt between rounds. In an earlier project, the detector's accuracy fell toward chance.

So did the imitator learn to write like a person, or did it only dodge that one weak detector? We replayed all thirty two imitator prompts and scored their texts with detectors that use no prompt and never took part in the game. One was a classifier on word and character patterns. The other was a perplexity based score from two Qwen models.

At first it looked like a win. One prompt scored an AUROC of point one three, which means the detector thought its text was more human than the people. The pattern classifier fell as low as point five five.

But those were the shortest texts. Under about seventy characters, against roughly four hundred for people. Short text has a higher perplexity per word, so a perplexity score reads it as human. Across the thirty two prompts, the scores tracked text length almost perfectly. A plain character count caught the same texts, with an AUROC between point nine seven and one.

So we ran the fair check. Compare only pairs of texts whose lengths are within a factor of one and a half. Twenty six prompts had enough such pairs. Every one of them was still caught.

The lesson is small and useful. A detector's score is only as good as its control for length. And a game where one weak detector is the only judge rewards whatever that detector cannot see.

Now the limits. This was one run of the game, one small model, twenty four human texts per family, and detectors trained on other models' text, so part of the gap may be a mismatch between generators. Nothing here is advice about detecting AI text in practice.

The numbers are in the repository, in the research folder called mimic loop transfer. The link is in the show notes.

That was the Open Tools and Research podcast. This script was written by an AI agent, and read by a synthetic voice.
