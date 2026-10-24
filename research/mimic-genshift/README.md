# Does a prompt-free detector carry over to a generator or decoding it never saw?

Track 11 (adversarial human imitation), a no-model slice of milestone 5 (`mimic-transfer`), built on `mimic-contexts` and `mimic-surface`. **Preliminary, stylised: RAID plain-prompt text only, three chat models, one detector type, one split.** Produced with AI assistance (Claude). No LLM was run: the container cannot reach Hugging Face, so this uses only the stored suite. The prompted-detector, larger-model and MAUVE parts of milestone 5 are still open.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/mimic-genshift/

`mimic-contexts` held out whole *families*. The imitation game also changes the *generator*: an imitator prompt, or a different model, produces text the detector was not fit on. The suite records which RAID chat model (llama, mistral, mpt) and which decoding (greedy, sampling) wrote each text, so a leave-one-generator-out check is possible without running anything. This project asks how much of the detector's AUROC survives it, whether a detector that sees a batch of same-source texts does better, and how much less varied the machine texts are.

Numbers come from `results.txt` and `results.json`; the figure is `experiments/figure.svg`.

## Results (what the code produced)

Detector: `mimic-contexts`' TF-IDF character 1-4 and word 1-2 gram logistic regression, here fit on all eight families. Items are split into two halves by a hash of `source_id`; the detector is fit on one half and scored on the other, then the halves are swapped and the scores pooled. Each row's test set is the same for both columns: human texts from the test half plus that generator's (or decoding's) texts from the test half. AUROC with 95% bootstrap interval over texts (200 resamples).

| test on | fit includes it | fit leaves it out |
|---|---|---|
| llama-chat | 0.991 (0.989 to 0.993) | 0.978 (0.974 to 0.982) |
| mistral-chat | 0.983 (0.978 to 0.987) | 0.971 (0.965 to 0.977) |
| mpt-chat | 0.981 (0.974 to 0.987) | 0.959 (0.946 to 0.971) |
| greedy decoding | 0.989 (0.986 to 0.991) | 0.964 (0.957 to 0.970) |
| sampling decoding | 0.984 (0.980 to 0.987) | 0.936 (0.927 to 0.945) |

- **Leaving a generator out costs 0.01 to 0.02 AUROC.** The detector is mostly reading features shared by RAID's three chat models, not one model's habits.
- **Leaving a decoding out costs more, and sampling is the harder one to reach.** A detector that never saw sampled text scores 0.936 on it (0.984 if it did). Held-out wiki is the weak spot: 0.83 on sampling and 0.89 on mistral-chat, against 0.95 to 1.00 for most other cells (`results.txt`, by family).
- **A batch makes the detector much stronger.** Averaging the leave-out score over *k* texts of the same source (random draws, same family, humans and LLM texts compared at equal *k*): AUROC 0.971 at k=1, 0.993 at 2, 0.999 at 4 and 1.000 at 8 and 16. Each draw samples texts independently, so this is an upper-end estimate of what a batch-aware detector gets on this plain-prompt text; a defender needs several texts from one source to use it.
- **Machine text is less varied.** Distinct-*n* of a 100-text batch (mean of 20 draws): on `recipes`, human distinct-2 is 0.589, llama 0.373, mistral 0.399. On `abstracts` human 0.749, llama 0.546, mistral 0.630. On `news` the gap is small (0.784 against 0.724). `mpt-chat` is close to human or above it on the two families where it has 100 or more texts (poetry 0.816 against human 0.796; reddit 0.794 against 0.735), so low diversity is a property of these models and families, not of generated text as such.

What this does not show: that an imitator prompted to evade would behave like these plain chat generations, anything about neural or prompted detectors, or that the detector would hold on text from a model family RAID does not contain.

## Reproduce

```bash
cd research/mimic-genshift
pip install numpy scipy scikit-learn
python3 -m unittest discover -s tests -v   # 5 tests, a few seconds
python3 genshift.py                        # about 4 minutes on 2 CPUs; writes results.json, results.txt
python3 figure.py                          # writes experiments/figure.svg
```

It reads `../mimic-contexts/data/suite.jsonl.gz`.

## Method

`side()` hashes `source_id` to half 0 or 1, so every generation that shares a `source_id` stays on one side (the suite's LLM `source_id`s mostly do not match a human item, so human and LLM items are split independently; this is a limitation, not a check of leakage between them). For each generator (or decoding) *v* and each fit half: the "includes" detector is fit on all items of that half; the "leaves out" detector is fit on the human items plus the LLM items whose generator (decoding) is not *v*. Both score the other half's human items and *v*'s items. Batch AUROC draws, per replicate, a random family, then *k* human scores and *k* LLM scores from the leave-one-generator-out pool and compares their means (2,000 replicates per *k*). Distinct-*n* is unique over total word *n*-grams (lowercased, whitespace-split) of a random 100-text batch within one family and source.

## Builds on

`mimic-contexts` and `mimic-surface` (this repository) and, through them, Dugan et al. (2024), RAID (MIT). Distinct-*n* follows Li et al. (2016). Batch-level detection echoes the question raised in the track brief, `research/PROJECTS.md` milestone 5; no lab's work is built on and none is affiliated.

## Limitations

Three RAID chat models, each present in only some families (mpt-chat has no abstracts, books, news or wiki texts, so its leave-out row covers four families and 48 recipes), so generator and family are partly confounded; decodings are pooled across models; texts are plain-prompt generations, the easy end for a detector; one detector type; one split of two halves; the batch figure assumes independent draws of same-source texts; distinct-*n* batch sizes are fixed at 100, so sources with fewer texts are omitted. Preliminary.

## Next steps

Repeat with the zero-shot Binoculars-style score and a prompted detector once a model is reachable; add a model family outside RAID; extend to MAUVE (an installed dependency, not vendored).

## Owner steps

None.

## Outside dependencies

The `mimic-contexts` suite (from RAID, MIT); NumPy, SciPy, scikit-learn.

## References

- Dugan et al. (2024), RAID: A Shared Benchmark for Robust Evaluation of Machine-Generated Text Detectors, ACL 2024.
- Li, Galley, Brockett, Gao and Dolan (2016), A Diversity-Promoting Objective Function for Neural Conversation Models, NAACL 2016.

MIT.
