---
title: "Fooling an AI-text detector by being short: a length trap in the imitation game"
seo_title: "Fooling an AI-text detector by being short"
date: 2026-10-21
description: "A tiny model learned prompts that beat a prompted detector. Detectors with no prompt catch every one once text length is matched: 26 of 26."
tags: [research, findings, ai-detection, mimic, prompts, measurement]
---

# Fooling an AI-text detector by being short

*Findings from `research/mimic-looptransfer` in this repository, written by an AI agent with the owner steering. One small model, one seed: a first measurement, not a verdict on AI-text detection.*

The question: if you can only change an LLM's prompt, can you make its writing indistinguishable from people's? The repository's track on this ("adversarial human imitation") sets up a game. A frozen 0.5-billion-parameter model writes forum posts and film reviews; a second copy of it, given a prompt, tries to tell which of two texts a person wrote. Each side rewrites its own prompt between rounds. An earlier project ran the game and the detector's accuracy fell toward chance. Did the imitator learn to write like a person, or only to dodge that one weak detector?

We replayed all 32 imitator prompts the game produced and scored their texts with detectors that use no prompt and were never part of the game: a word and character n-gram classifier fit on human versus chat-model text from the RAID benchmark, and a Binoculars-style score (Hans et al., 2024) from two Qwen models.

**What looked like a win.** Some prompts got very low scores. One reddit prompt scored an AUROC of 0.13 on log-perplexity, meaning the detector thought it was *more* human than people. The n-gram detector fell as low as 0.55.

**What it was.** Those were the shortest texts, under about 70 characters against roughly 400 for people. Short text has a higher per-token perplexity, so a perplexity score reads it as human. Across the 32 prompts the raw scores track mean text length with Spearman correlations of +0.86 to +0.97. A plain character count catches the same texts at AUROC 0.97 to 1.00.

**The check.** Compare only pairs of texts whose lengths are within a factor of 1.5. Twenty-six prompts had enough such pairs (the six that did not are the short reddit ones). Every one is still caught: n-gram AUROC 0.83 to 0.96, Binoculars-style 0.84 to 1.00. And a prompt's accuracy against the game's own detector did not predict its prompt-free score (correlation between -0.19 and +0.16 over all prompts).

**What it means.** A detector's score is only as good as its control for length, and a game where a weak detector is the only judge rewards whatever that detector cannot see. Before believing "the imitator fooled the detector", check whether length-matched pairs still separate. Limits: one run of the game, 24 human texts per family, detectors trained on other models' text, so part of the gap may be generator shift. Numbers: [`results.txt`](https://github.com/duncan-haywood/oss-monorepo/blob/main/research/mimic-looptransfer/results.txt). Nothing here is advice about detecting AI text in practice.
