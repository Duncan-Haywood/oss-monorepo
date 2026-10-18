# Can a prompt make a 0.5B model detect machine text, and does the prompt carry to families it never saw? Prompted-detector side of `mimic-anycontext`

Track 11, adversarial human imitation, milestone 4 (`mimic-anycontext`), detector side with a language model. `mimic-anycontext-detect` ran the prompt-free half because model downloads were blocked; Hugging Face is reachable now, so this runs the prompted half. **Negative and preliminary: one 0.5B model, 16 hand-banked prompts, 8 families, plain-prompt (non-adaptive) machine text, no imitator side and no prompt-writing LLM.** Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/mimic-anycontext-prompt/

## Question

A frozen Qwen2.5-0.5B-Instruct reads one text and answers "Was this text written by a person? Yes or No". Its score is logit(Yes) − logit(No). Only the system prompt changes. Does searching over detector prompts help, and does a prompt picked on six families work on the two it never saw?

## Results (`results.txt`, `results.json`, `experiments/figure.svg`)

AUROC of ranking the human text above the RAID plain-prompt LLM text, 30 human and 30 LLM texts per family (cut to 400 characters), mean over the 8 families. **0.5 is chance and below 0.5 means the detector rates LLM text as more human than human text.**

| prompt choice | mean AUROC |
|---|---|
| plain prompt, no fragments | 0.278 |
| universal: best of 16 on the other six families' texts, scored on the two held-out families | 0.293 |
| the same universal prompts on their own six families | 0.304 |
| per-family: best of 16 on the family's own 10+10 selection texts | 0.311 |
| mean of all 16 prompts (what a random pick gets) | 0.291 |
| best of 16 chosen on the test texts (oracle, optimistic) | 0.334 |

- **The detector is inverted, not just weak.** All 16 prompts have a mean AUROC between 0.271 and 0.314, and no prompt reaches 0.5 on any single family (the best family score is 0.424, reviews). On recipes it is 0.09: the model rates almost every machine recipe as more human than the human one. This agrees with `mimic-loop`, where the same model's paired accuracy started at 12%.
- **Prompt search barely moves it.** Picking on the selection texts beats the plain prompt by +0.015 (universal, held out) and +0.033 (per-family), against a spread of about 0.04 between the best and worst prompt. With 16 prompts and 10+10 selection texts per family, differences of a few hundredths are within selection noise; read none of this as a ranking of prompt styles.
- **The seen/held-out gap is about 0.01 AUROC here**, 0.304 on seen against 0.293 on held-out families, because there is almost no signal to lose. This does not support "universal prompts transfer": the prompts do not work anywhere. The contrast with `mimic-anycontext-detect` is the useful part: a prompt-free n-gram detector gets 0.934 on unseen families against this model's 0.29.
- **Arithmetic aside, not a prompt result.** Reading the score backwards (1 − AUROC) would give about 0.71 for the universal pick, so the model carries a real signal with the sign the prompt asks for flipped. Choosing the sign per family needs labelled data, and the 0.71 would still be far below the n-gram detector. It was not tested as a method.

## Reproduce

```bash
cd research/mimic-anycontext-prompt
python3 -m unittest discover -s tests -v     # 7 tests, no model needed
PY=$(python3 ../../platform/ci/pyenv.py torch transformers numpy)
"$PY" anyprompt.py                           # about 80 minutes on 4 CPUs; writes scores.json (resumable)
"$PY" anyprompt.py --analyse                 # writes results.json
python3 figure.py                            # writes experiments/figure.svg
```

Reads `../mimic-loop/core.py` for the fragment bank and text trimming, and `../mimic-contexts/data/suite.jsonl.gz`.

## Method

`anyprompt.py` takes 8 families from the `mimic-contexts` suite, and per family 10 + 10 human and LLM texts for selection and 30 + 30 disjoint ones for testing (texts shorter than 320 characters after whitespace normalisation are dropped, the rest cut to 400, so length cannot separate the classes much). Candidates are the base instruction "You judge whether a text was written by a person or by an AI model." plus a random subset of `mimic-loop`'s ten detector fragments (candidate 0 is the base alone; 15 random subsets, seed 0, each fragment with probability 0.4). Every candidate scores every text once and the scores are cached; each regime is a selection over that cache. Folds hold out two families at a time (sorted families 0 and 4, 1 and 5, and so on); the universal prompt maximises pooled AUROC on the other six families' selection texts, ties going to the plain prompt. The proposer is random search over a fixed fragment bank, with no LLM proposer and no prompt written by the model itself, which the milestone also names.

## Builds on

`mimic-loop` and `mimic-contexts` (this repository; fragment bank, model wrapper, suite); `mimic-anycontext-detect`. RAID, Dugan et al. (2024), ACL (MIT); Qwen2.5-0.5B-Instruct (Apache-2.0). No lab's work is built on and none is affiliated with or endorses this project.

## Limitations

One 0.5B model, which is inverted before any prompt is added; 16 random fragment subsets, so the search is shallow; 10+10 selection texts per family; 30+30 test texts, so a family AUROC has a standard error of roughly 0.06; single-text mode only; plain-prompt RAID text, not an adapted imitator; machine labels are RAID's generators, whose three chat models are similar; the fairness check by writer group is not run because the suite records none; a single seed.

## Next steps

Repeat with a larger open detector (Qwen2.5-1.5B or 3B) to see whether the inversion is a size effect, using the same cache layout so only `scores.json` is recomputed; let the model write its own detector prompt per family (the milestone's third regime); add the imitator side once a detector above chance exists.

## Owner steps

None.

## Outside dependencies

Qwen2.5-0.5B-Instruct weights from Hugging Face; the `mimic-contexts` suite (RAID); PyTorch, transformers, NumPy. No paid service or closed API.
