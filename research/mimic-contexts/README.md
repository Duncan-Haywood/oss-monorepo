# How well do prompt-free detectors tell people from a plainly prompted LLM, and do they carry over to unseen kinds of text?

Milestone 1 (`mimic-contexts`) of track 11, adversarial human imitation. The track will let two frozen LLMs play an imitation game by rewriting only their own prompts. Before any game, it needs a context suite and detectors that use no prompt, to anchor every later number. This project builds both. **It does not run the game, and it does not generate text with a local imitator.** The "plain-prompt imitators" here are chat-model generations already in RAID.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/mimic-contexts/

Numbers come from `results.txt` and `artifacts.txt`.

- **Suite.** 8 families (abstracts, books, news, poetry, recipes, reddit, reviews, wiki), 300 human and 300 LLM texts each (4,800), up to 1,500 characters, in `data/suite.jsonl.gz`. The LLM texts are plain-prompt generations from RAID's chat models (llama-chat, mistral-chat, mpt-chat, no adversarial attack). Train on 5 families and hold out poetry, reviews and wiki whole.
- **N-gram logistic regression** (character 1-4 and word 1-2 grams): held-out AUROC 0.927 (95% bootstrap interval 0.913 to 0.939), accuracy 0.81, paired accuracy 0.94. The training AUROC of 1.000 is in-sample and means nothing. Leave-one-family-out AUROC runs from 0.87 (recipes) to 0.99 (books). Wiki is the hardest held-out family (0.89).
- **Zero-shot, Binoculars-style** (Qwen2.5-0.5B and its Instruct variant, first 64 tokens, 120 texts per family and label): perplexity alone gets held-out AUROC 0.760 (0.719 to 0.791); the perplexity/cross-perplexity ratio gets 0.802 (0.767 to 0.834). On the same subset the n-gram detector scores 0.926.
- **Not a length artefact.** A length-only detector is at chance on held-out families (0.515), although its per-family AUROC swings from 0.15 (wiki) to 0.89 (poetry), so length is family-specific and must be controlled in the game.
- **Not a chat-preamble artefact.** Only 147 of 2,400 LLM texts start with "Sure" or "Here is" style lines; stripping them changes held-out AUROC by less than 0.001. The strongest n-gram weights are content words (instructions, ingredients, "your", "such as", "significant", "challenges").
- **Detectors differ by generator.** On held-out families, the zero-shot detectors find mpt-chat hard (bino 0.65, perplexity 0.59) while n-grams do not (0.95). Detection depends on which model wrote the text.

```bash
cd research/mimic-contexts
pip install numpy scipy scikit-learn            # tests and evaluate.py
python3 -m unittest discover -s tests -v        # 10 tests
python3 evaluate.py && python3 artifacts.py     # about 1 minute
# rebuild from scratch (network): python3 build_suite.py ; pip install torch transformers ; python3 zeroshot.py  (about 25 min on 4 CPUs)
```

## Motivation

The track asks whether prompts alone can make an LLM indistinguishable from people. "Indistinguishable" always means to some detector, so the first step is detectors that need no prompt and a suite whose splits are by family, so later milestones can test carry-over to families never seen. A detector's accuracy is also a fidelity score for a simulated writer, which ties to the portfolio's digital-twin theme.

## Builds on

Dugan et al. (2024), RAID (MIT), the source of all text. Hans et al. (2024), Binoculars, for the zero-shot score (here with Qwen2.5-0.5B and 0.5B-Instruct as the related pair, a small-model adaptation, not their models). Lopez-Paz and Oquab (2017) for the idea of a classifier as a two-sample test. No lab's work is built on, and no lab is affiliated with or endorses this project.

## Method

`build_suite.py` reads RAID's 11.8 GB `train.csv` by HTTP range requests. The file is sorted by domain and each domain starts with its human rows, followed by non-attacked model blocks, so it finds each domain by bisection and reads a few MB. Texts are shuffled with a fixed seed and capped at 300 per cell. `evaluate.py` fits every weight and threshold on the training families only. Paired accuracy is the share of random same-family (human, LLM) pairs where the LLM text scores higher. Intervals are percentile bootstrap over texts (300 resamples). `zeroshot.py` computes log-perplexity under the observer and the cross-perplexity with the performer. `artifacts.py` checks what the n-gram model keys on.

## Limitations

The "imitator" is only RAID's chat models, from RAID's own prompts (title plus genre), not a prompted or optimised imitator, so these detectors are the easy end of the game. All text is truncated to 1,500 characters (64 tokens for zero-shot), and the zero-shot subset is 1,920 texts with wide intervals. Human text comes from RAID's sources, so licences of the underlying corpora vary even though RAID is MIT; texts are kept only in this repository, labelled generated or human in `data/suite.jsonl.gz`, and never posted anywhere. Chat-model rows with no attack are drawn from the early part of each domain, and block order may correlate with model mix, so family and model are partly confounded. Only three chat models appear. Fairness: RAID records no author group, so false-positive rates by native language or other group cannot be reported; this is a gap the track's fairness guardrail needs a corpus for. Five families vs three held-out is one split; leave-one-family-out for n-grams shows the spread.

## Next steps

Milestone 2, `mimic-loop`: generate with a local small instruct model under a plain prompt, then optimise imitator and detector prompts against each other and compare proposers at equal call budgets. Add a corpus with author-group labels and HC3/M4 families with checked licences. Add a longer zero-shot window.

## Owner steps

None.

## Outside dependencies

RAID data (downloaded by range request), Qwen2.5-0.5B and Qwen2.5-0.5B-Instruct weights (Apache-2.0), PyTorch, transformers, scikit-learn. Produced with AI assistance (Claude). No LLM proposer was used and no text was written by the session agent.

MIT.
