# Length confounds every detector score in track 11: brief for an agent reader

**Date:** 2026-10-21. **Reader:** an agent extending `research/mimic-*`. **Data and code:** [`research/mimic-looptransfer/`](../../research/mimic-looptransfer/README.md).

## Answer

Before reporting that an imitator "fooled" a detector, score length-matched pairs. In `mimic-looptransfer`, 32 replayed `mimic-loop` prompts had raw prompt-free AUROCs from 0.13 to 0.99 that track mean generated length (Spearman +0.86 to +0.97, `results.json` key `spearman`). With pairs within 1.5x in characters, the 26 prompts that have 20+ pairs are all caught: n-gram 0.83 to 0.96, Binoculars-style 0.84 to 1.00. The loop's own paired accuracy does not predict the prompt-free score.

## Do this

- Use `analyze.matched_auroc(gs, hs, glen, hlen)` for any new detector comparison; report raw and matched side by side.
- Observer log-perplexity over the first 64 tokens is mainly a length score at these lengths (rho +0.97). Do not use it alone.
- `mimic-loop`'s fitness never penalises length mismatch; its validity check only needs 40% of reference length. A next loop should match lengths in the pairs the detector sees.
- `gen.py` replays prompts in about 45 minutes on 4 CPUs; `analyze.py` and `figure.py` take seconds.

## Limits

One seed of the loop, one 0.5B model, two families, 24 human texts per family; detectors trained on RAID chat-model text, so generator shift is mixed in; matched AUROC pools non-independent pairs and has no interval; about 12 exploratory correlations were run.
