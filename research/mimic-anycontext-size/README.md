# Is the prompted detector's inversion a model-size effect? Qwen2.5 0.5B vs 1.5B as a human-vs-machine text detector

Track 11, adversarial human imitation, follow-up to `mimic-anycontext-prompt`, whose "Next steps" asked for a larger detector to see whether the 0.5B model's inverted AUROC (below 0.5) is a size effect. **Preliminary: two model sizes, four prompts, 30+30 test texts per family, one seed.** Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/mimic-anycontext-size/

## Question

A frozen Qwen2.5 instruct model reads one text and answers "Was this text written by a person? Yes or No". The score is logit(Yes) − logit(No). Does moving from 0.5B to 1.5B parameters, with the prompts unchanged, bring AUROC (human above machine) above chance?

## Results (`results.json`, `experiments/figure.svg`)

Mean over eight RAID-derived families (`mimic-contexts`), 30 human and 30 machine texts each, cut to 400 characters. 0.5 is chance; below 0.5 the model rates machine text as more human.

| model | plain prompt | best of 4 prompts (chosen on test texts, optimistic) | cells below 0.5 (4 prompts × 8 families) | sign-flipped plain |
|---|---|---|---|---|
| Qwen2.5-0.5B-Instruct | 0.278 | 0.296 | 32 of 32 | 0.722 |
| Qwen2.5-1.5B-Instruct | 0.329 | 0.389 | 27 of 32 | 0.671 |

- **Bigger helps on average, but not enough.** The plain prompt gains +0.05 and the best prompt +0.09, yet no mean reaches 0.5. At 1.5B only `news` is near chance (0.504). The gain is uneven: `recipes` rises from 0.09 to 0.36 and `news` from 0.31 to 0.50, but `books` falls from 0.29 to 0.14 and `poetry` from 0.24 to 0.16, so the larger model is more confidently inverted on those two.
- **Prompts matter more at 1.5B.** The spread between the best and worst of the four prompts is 0.09 (1.5B) against 0.02 (0.5B). With only four prompts chosen on the test texts, read this as "prompt choice starts to matter", not a ranking.
- **The 0.5B numbers match the earlier project** (plain 0.278 there and here), as they should: same texts, same prompt.
- **Not shown:** whether 3B or larger crosses 0.5. A 3B pass was started but stopped for time before its first prompt finished, so no 3B number exists; `sizerun.py` lists the 3B model and will fill it in when run.

## Reproduce

```bash
cd research/mimic-anycontext-size
python3 -m unittest discover -s tests -v          # 4 tests, no model needed
PY=$(python3 ../../platform/ci/pyenv.py torch transformers numpy)
"$PY" sizerun.py Qwen/Qwen2.5-0.5B-Instruct Qwen/Qwen2.5-1.5B-Instruct   # 0.5B about 25 min, 1.5B about 2 h on 4 CPUs; resumable
"$PY" sizerun.py --analyse                        # writes results.json
python3 figure.py                                 # writes experiments/figure.svg
```

## Method

`sizerun.py` imports `mimic-anycontext-prompt`'s text loader and candidate generator (same seed, so the first four candidates are the plain instruction plus three random fragment subsets), scores each candidate on each family's 30+30 test texts, and caches scores per model. No selection split is used: the table reports fixed prompts, and "best of 4" is an oracle for the spread.

## Builds on

`mimic-anycontext-prompt`, `mimic-loop`, `mimic-contexts` (this repository); RAID, Dugan et al. (2024), ACL (MIT); Qwen2.5 instruct models (Qwen2.5-0.5B and 1.5B: Apache-2.0). No lab's work is built on and none is affiliated with or endorses this project.

## Limitations

Two sizes of one model family, so "size" is confounded with nothing else but is only a two-point trend; four prompts; family AUROC standard error about 0.06; single-text mode only; plain-prompt RAID machine text, not an adapted imitator; one seed; no per-family prompt selection.

## Next steps

Run 3B (about 1 h per prompt on 4 CPUs) and a non-Qwen family to see whether the trend crosses 0.5; test the sign-flip as a method with labelled calibration data; add the imitator side once a detector above chance exists.

## Owner steps

None.

## Outside dependencies

Hugging Face model downloads (Qwen2.5-0.5B/1.5B-Instruct); PyTorch and transformers.
