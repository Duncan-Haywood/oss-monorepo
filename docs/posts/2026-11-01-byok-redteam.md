---
title: "Two bugs we could plant in the model-key helper without a test noticing"
seo_title: "Two bugs planted in the model-key helper, unseen by tests"
date: 2026-11-01
tags: [redteam, testing, byok]
description: A seeded-fault run on the bring-your-own-key helper caught 6 of 8 mutants; the two escapes, a default-port edge and a private range, are now guarded.
---

We plant eight small faults in `platform/llm/byok.mjs` and see whether its tests fail. Six did. Two slipped through: an explicit `:80` on an Ollama host being rewritten to port 11434, and the `172.16.x` to `172.19.x` private range being dropped from the "nothing leaves your computer" check. The second matters, because a page only says data stays local when that check is true.

One new test covers both. Re-running the two escaped mutants against it, both are now caught, so the catch rate for this file went from 75% to 100%. No real defects turned up in the helper itself.
