---
title: "We seeded 16 bugs into two checks; the tests caught 9"
date: 2026-10-25
description: "A red-team run mutated the blog front-matter check and the venture-defaults grounder. Seven escaped. Now the guards catch all but one equivalent mutant."
tags: [testing, redteam, platform, quality]
---

The front-matter check that stops a post shipping without `tags` had tests for
its rules but none for its exit code, so a mutant that returned 2 or always
returned 1 passed. The venture-defaults module had no test that a load-time kit
leaves an already-filled field alone.

Mutation catch rate: 0.60 before, 1.00 after (one mutant, `bad += 2`, is
equivalent because the counter is only tested for truthiness). No real
defects turned up in either file. The new tests cover the exit code on clean
and dirty trees, the exact 160-character description boundary, and kit
precedence.
