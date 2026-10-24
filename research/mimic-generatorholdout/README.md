# Does a human-vs-machine text detector still work on a language model it never saw, or on a decoding setting it never saw?

Track 11, adversarial human imitation. `mimic-featuretransfer` held out context families; this holds out the **generator** (mistral-chat, llama-chat, mpt-chat) and the **decoding** (greedy or sampling) of the machine text, on the same RAID-derived `mimic-contexts` suite. **Headline:** an n-gram detector keeps AUROC 0.97 to 0.98 on a held-out chat model (0.99 when none is held out) but falls to 0.94 when it is trained only on greedy-decoded text and tested on sampled text. A function-word-only detector degrades far more (0.78 to 0.85 on held-out generators, 0.69 on the decoding shift). **Preliminary:** three generators, one classifier, five folds; no LLM is run.

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/mimic-generatorholdout/

## Results (`results.txt`, `results.json`)

Mean AUROC ± standard deviation over 5 folds (folds split by `source_id`, so a human and a machine text from the same prompt are never on opposite sides). Training: every other generator's machine text plus the human text of the other folds; test: the held-out machine text plus the human text of the fold. Suite: 2,400 human, 1,047 mistral-chat, 1,017 llama-chat, 336 mpt-chat texts, eight context families.

| condition | func | word | char | char+word |
|---|---|---|---|---|
| none held out | 0.878 ± 0.011 | 0.989 ± 0.002 | 0.981 ± 0.004 | 0.990 ± 0.003 |
| hold out mistral-chat | 0.849 ± 0.010 | 0.979 ± 0.008 | 0.962 ± 0.012 | 0.977 ± 0.009 |
| hold out llama-chat | 0.848 ± 0.018 | 0.978 ± 0.003 | 0.973 ± 0.006 | 0.984 ± 0.003 |
| hold out mpt-chat | 0.779 ± 0.065 | 0.966 ± 0.013 | 0.950 ± 0.013 | 0.970 ± 0.010 |
| train greedy only, test sampling | 0.693 ± 0.011 | 0.939 ± 0.010 | 0.925 ± 0.007 | 0.941 ± 0.008 |
| train sampling only, test greedy | 0.761 ± 0.018 | 0.972 ± 0.004 | 0.953 ± 0.009 | 0.969 ± 0.006 |

- **Content-word and character n-grams barely notice an unseen generator.** Holding out a chat model costs 0.006 to 0.013 AUROC for char+word against the none-held-out reference; mpt-chat, the smallest and most different set, costs most (0.970).
- **Function-word frequencies transfer worse and less steadily.** 0.78 to 0.85 held out, and the spread across folds is largest on mpt-chat (sd 0.065), so what the stop-word cue captures is partly generator-specific. This answers the open question in `mimic-featuretransfer` ("leave-one-generator-out per feature set").
- **Decoding shift hurts more than generator shift.** Train-greedy/test-sampling is the weakest n-gram result (0.94) and costs the function-word set 0.19. Caveat: these two conditions also train on about half as much machine text as the others, so size and shift are confounded; not separated here.
- **Absolute levels are higher than `mimic-featuretransfer`'s** (0.94 for held-out families) because here every context family is seen in training; the shift is only in the generator.

## What this does and does not say

Within one benchmark's three open chat models, a prompt-free n-gram detector is robust to which model wrote the text. It says nothing about newer or larger generators, instruction-tuned imitators prompted to sound human, or adversarial text (`mimic-evade`, `mimic-whitebox`).

## Reproduce

```bash
cd research/mimic-generatorholdout
python3 -m pip install numpy scipy scikit-learn
python3 -m unittest discover -s tests -v   # 4 tests
python3 generatorholdout.py                # about 14 minutes on 4 CPUs; writes results.json, results.txt
```

Reads `../mimic-contexts/data/suite.jsonl.gz` and reuses the featurisers of `../mimic-featuretransfer`.

## Method

For each condition and feature set (definitions as in `mimic-featuretransfer`; logistic regression, vectorisers fitted on training text only), 5 folds over `crc32(source_id) mod 5`. A condition picks which machine items may train and which may be tested; human items are always in play. AUROC per fold, then mean and sample standard deviation over folds (training-set variation between folds only; no bootstrap over test items).

## Builds on

`mimic-contexts` and `mimic-featuretransfer` (this repository); Dugan et al. (2024), "RAID: A Shared Benchmark for Robust Evaluation of Machine-Generated Text Detectors", ACL (MIT licence). No lab's work is built on and none endorses this project.

## Limitations

Three generators, so "held-out generator" means held out of three; mpt-chat has 336 texts. Greedy/sampling conditions shrink the training set (confounded, above). One classifier and one feature recipe per set. Plain-prompt, non-adversarial machine text. Folds share context families, so this does not test family shift.

## Next steps

Equalise training size in the decoding conditions; combine generator and family holdout; test a prompted LLM detector once a model is downloadable (`mimic-anycontext`).

## Owner steps

None.

## Outside dependencies

The `mimic-contexts` suite (from RAID); NumPy, SciPy, scikit-learn.
