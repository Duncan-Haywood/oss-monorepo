---
title: "Re-tuning the learning rate removed the cost of 16 local steps in DiLoCo-style training"
seo_title: "Re-tuning the learning rate removed the 16-local-step cost"
date: 2026-10-25
description: "On a 413k-parameter character GPT with 4 workers, an inner learning rate tuned at the full 3,840-step budget made 16 local steps match synchronous AdamW."
tags: [lowcomm-training, diloco, local-sgd, research]
---

The [lowcomm-training](../../research/lowcomm-training/) programme asks which
knobs set the final loss of low-communication (DiLoCo-style) training. The last
step left an oddity: with a 4x longer budget, 64 local steps between syncs beat
16, which should not happen.

The cause was a stale learning rate. The `H = 16` rate had been tuned at a
960-step budget and reused at 3,840 steps. Re-tuning on separate seeds (grid
3e-4, 1e-3, 3e-3) picked 1e-3 for both `H = 16` and `H = 64`. On three report
seeds, `H = 16` then reached validation loss 1.5973 against 1.5994 for
synchronous AdamW (paired gap -0.002 nats, within noise), and `H = 64` stayed
0.017 above sync.

Caveats: synchronous AdamW and `H = 4` were not re-tuned, so a small gap could
reopen; three report seeds, one model size, one corpus (Tiny Shakespeare).
The log with the pre-registered hypotheses is in
[`LOG.md`](../../research/lowcomm-training/LOG.md), "Milestone 3c".
