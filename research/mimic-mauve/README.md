# Does MAUVE, a distribution-level score, rank human-vs-machine gaps the way a text detector does?

Track 11 (adversarial human imitation), a no-LLM slice of milestone 5 (`mimic-transfer`), built on `mimic-contexts` and `mimic-genshift`. **Preliminary, stylised: RAID plain-prompt text only, three chat models, a TF-IDF/SVD embedding instead of MAUVE's usual GPT-2 features, 5 draws per cell.** Produced with AI assistance (Claude). No LLM was run (the container cannot reach Hugging Face), so MAUVE's published feature extractor is **not** used and these values are not comparable with MAUVE numbers in the literature.

**Live page:** https://marisstella.app/research/mimic-mauve/

Milestone 5 asks whether imitator and human text differ as *distributions*, because a detector that sees a batch can catch an imitator whose texts are each plausible but too alike. `mimic-genshift` looked at distinct-*n*. This project adds MAUVE (Pillutla et al., 2021), installed as a dependency (`pip install mauve-text`, GPL-3.0, not vendored), and asks whether it agrees with the per-text detector on which human-vs-machine gaps are large.

Numbers come from `results.txt` and `results.json`; the figure is `experiments/figure.svg`.

## Results (what the code produced)

20 cells (family × RAID chat model, at least 40 texts each). In each cell, 5 draws of *n* human and *n* model texts (*n* = 100, or the model's count if smaller, 48 to 100); MAUVE on a 32-dimensional TF-IDF word 1-2 gram SVD embedding (pooled draw, no labels); a human-vs-human null on two disjoint human draws; and a 2-fold cross-fit character n-gram logistic regression AUROC on the same texts.

- **Every cell is far from its null.** Human-vs-human MAUVE is 0.92 to 0.99 (mean 0.964); the highest human-vs-model MAUVE is 0.83 (wiki/mistral-chat, mean over draws). So, on the mean over draws, the embedding separates machine text from human text in all 20 cells, as the detector does. Per draw it does not quite: in wiki/mistral-chat two draws (0.918, 0.901) sit level with their own nulls (0.919, 0.902), and in recipes/mpt-chat one draw (0.978) is above 4 of its 5 null draws; no per-cell test is run (correction 2026-11-19, from the quality audit `portfolio/quality/audits/2026-11-19-mimic-mauve.json`; per-draw values are not yet saved in `results.json`).
- **The two scores agree on the ranking, loosely.** Spearman correlation of MAUVE with AUROC across cells is −0.60 (p = 0.005): low MAUVE goes with high AUROC. The hardest cell for the detector, wiki/mistral-chat (AUROC 0.832), is also the one MAUVE puts closest to human (0.830); books and reviews are AUROC 0.99 to 1.00 with MAUVE 0.01 to 0.03.
- **They disagree where it is interesting.** Recipes with llama or mistral have AUROC 0.999 but MAUVE 0.32; news with llama has AUROC 0.97 and MAUVE 0.75. A near-perfect per-text detector does not imply a far-apart distribution in this embedding. (No cell shows the reverse, a low AUROC with a low MAUVE; an earlier wording claimed it.) The disagreeing cells sit within the draw-to-draw noise below (news/llama-chat has sd 0.16), so treat them as leads, not findings.
- **Distinct-2 is a poor stand-in for MAUVE.** Spearman of MAUVE with the machine/human distinct-2 ratio is 0.24 (p = 0.31), not distinguishable from zero with 20 cells. `mpt-chat` has *more* distinct bigrams than human on poetry (0.839 against 0.829) and reddit (0.804 against 0.747) yet MAUVE is 0.12 and 0.25, so it is far from human on content, not on variety.
- **MAUVE is noisy at this sample size.** Standard deviations across the 5 draws run 0.004 to 0.21; the recipes/mpt-chat cell (*n* = 48) has the largest. Use the ranking, not the third decimal.

What this does not show: MAUVE values on GPT-2 features, anything about imitators prompted to evade, or whether MAUVE would help a defender (it needs a batch from one source).

## Reproduce

```bash
cd research/mimic-mauve
pip install numpy scipy scikit-learn mauve-text   # mauve-text is GPL-3.0; installed, not vendored
python3 -m unittest discover -s tests -v          # 4 tests, a few seconds
python3 mauvecheck.py                             # about 2 minutes on 2 CPUs; writes results.json, results.txt
python3 figure.py                                 # writes experiments/figure.svg
```

It reads `../mimic-contexts/data/suite.jsonl.gz`.

## Method

Per cell and per draw: shuffle the family's human texts and the model's texts, take *n* of each (plus a second, disjoint *n* humans for the null). Embed the pooled texts (TF-IDF word 1-2 grams, `min_df=2`, truncated SVD to 32 dimensions, rows normalised); call `mauve.compute_mauve` on the two groups' features (`num_buckets="auto"`, i.e. *n*/10 k-means clusters). The AUROC is a 2-fold stratified cross-fit of TF-IDF character 1-4 gram logistic regression on the same 2*n* texts. Distinct-2 is unique word bigrams over total bigrams.

## Builds on

`mimic-contexts`, `mimic-genshift` (this repository); Pillutla et al. (2021), "MAUVE: Measuring the gap between neural text and human text using divergence frontiers", NeurIPS; Dugan et al. (2024), RAID (MIT). Closest prior work, not yet compared against: Pillutla et al. (2023), "MAUVE scores for generative models: theory and practice", JMLR, which studies MAUVE's estimation error at small sample sizes and quantisation choices, and Pimentel, Meister and Cotterell (2023), "On the usefulness of embeddings, clusters and strings for text generator evaluation", ICLR, which asks what MAUVE's embedding-and-cluster pipeline actually measures. No lab's work is built on and none is affiliated.

## Limitations

The embedding is lexical, so MAUVE here measures vocabulary-and-topic distance, not what GPT-2 features capture. The k-means quantisation depends on *n*, which differs across cells (48 to 100). Five draws per cell, a single seed stream, overlapping draws from the same pool. The Spearman p-values treat the 20 cells as independent, but they share 7 human pools, so they are optimistic. The test and the null use different SVD embeddings (each fitted on its own pooled draw). Generator and family are partly confounded (see `mimic-genshift`). RAID plain-prompt text is the easy end for detection.

## Next steps

Rerun with GPT-2 features once a model is reachable, so values are comparable with the literature; add imitator-prompted text from `mimic-loop`; compare MAUVE as a fidelity score on the MuJoCo twins of `mimic-mujocotwin`.

## Owner steps

None.

## Outside dependencies

`mauve-text` (GPL-3.0, installed from PyPI, not vendored) and its `faiss-cpu`; RAID text via `mimic-contexts`. The GPT-2 feature extractor MAUVE normally uses could not be downloaded here.
