# Do sibling research projects ask different questions? Wording overlap within slug families (preliminary)

Pure Python standard library. A free-form follow-up in track 10 (the software-engineering loop), prompted by the rule in `PROJECTS.md` that a track whose chain has "gone to micro-variants of one result" should be skipped. Nothing measured whether that has happened. Produced with AI assistance (Claude). No lab's work is built on. **Preliminary:** word overlap is a crude proxy for novelty, and it says nothing about whether the results differ.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/swe-siblings/

## Question

The portfolio has hundreds of projects, and many share a slug prefix (`simdesign-*`, `garment-*`, `chip-*`). Do projects in the same family ask noticeably more similar questions than projects in different families, and which sibling pairs are close enough to be worth a human look for consolidation?

## Reproduce

```
python3 experiments/run.py > experiments/results.txt
python3 -m unittest discover tests
```

## Method

`src/swe_siblings/analyse.py`. For each `research/<slug>/README.md`, take the title line plus the `## Question` section, lower-case it, drop code spans, links, numbers and a short stop-word list, and keep the set of words of three or more letters. The score for a pair of projects is the Jaccard index of those sets. A family is the slug's text before its first hyphen; only families with at least five projects are summarised. Projects without a `## Question` section are scored on the title alone.

## Results

All numbers are from `experiments/results.txt`.

- **Siblings do overlap more, by about ten times.** Across families the mean pair Jaccard is 0.008 (213,181 pairs); within the 14 families of five or more projects it is 0.078 (7,552 pairs). Part of that is shared vocabulary that a family legitimately has (a `chip-*` project says "systolic" and "array"); the measure cannot separate that from repetition.
- **Overlap differs by family.** The highest means are `twin` (0.142), `eda` (0.135) and `accel` (0.109); the lowest are `swe` (0.036), `osrobot` (0.051) and `free` (0.055), which is the free-choice prefix and so expected to vary.
- **The closest pairs are candidates for a human look, not verdicts.** `mimic-mmd` and `mimic-mmdmujoco` score 0.917, `chip-systolic-hidewide` and `chip-systolic-p32` 0.667, `chip-systolic-batch` and `chip-systolic-fanin` 0.647, `simdesign-gaugepockets` and `simdesign-pocketmesh` 0.615, `accel-surrogate` and `accel-surrogate2d` 0.611. Several of these are deliberate follow-ups that change one condition (a different simulator, a 2-D case), which is the legitimate shape of a next step. The full top 15 is in the results file.

## Limitations

- **Word overlap is not result overlap.** Two projects can ask near-identical questions and find different things, and the reverse. This run did not compare findings or numbers.
- **Question wording is inherited on purpose.** Follow-ups reuse the parent's phrasing so a reader can see the lineage; high overlap there is a feature.
- **Slug prefix is a crude family.** Some prefixes group unrelated work (`twin`, `free`); some real families span prefixes.
- A snapshot of one checkout; no timeline, so it cannot say whether overlap is rising.
- No threshold for "too similar" was validated; none is proposed.

## Next steps

Add creation order from git history (needs an unshallow clone) to ask whether overlap rises with a family's size; compare the numbers in each pair's `results.txt` to test whether high wording overlap predicts a repeated finding; hand-read the top 15 pairs and label each as follow-up, variant or duplicate.

## Owner steps

None.

## Builds on

The `PROJECTS.md` rule on micro-variants, and the Jaccard index (Jaccard, 1901, "Distribution de la flore alpine dans le bassin des Dranses et dans quelques régions voisines", *Bulletin de la Société Vaudoise des Sciences Naturelles* 37: 241&ndash;272). No lab's work is built on.

## Outside dependencies

None.
