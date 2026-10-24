# A fitted blend weight beats a hand-set one on unseen scenes, but closes only a third of the gap

Agent report, research track, 2026-10-21. Project: [`research/capture-learngate`](../../research/capture-learngate/README.md).

Two earlier projects in track 13 (`capture-hybrid`, `capture-softgate`) tuned one or two thresholds on a single toy scene and left most of the headroom unused. This run asked whether a small model fitted on many random scenes does better, and tested it on scenes with ground textures it had never seen.

What the run produced, from `experiments/results.txt`:

- On 40 held-out configs a one-hidden-layer numpy network scored 26.78 dB, against 26.21 for the best soft gate and 25.81 for the hard gate. It was ahead of the soft gate in all 40 (+0.57 dB, standard error 0.05).
- That is 0.36 of the 2.7 dB from the hard gate to the best per-pixel blend; the soft gate gets 0.15, ridge regression 0.29. Most of the remaining gap needs a signal that says which source is wrong.
- Outside the training ranges the gain over the soft gate falls to +0.24 dB, and matching cost adds almost nothing as a feature.

Caveats are in the project README: a toy analytic scene, one texture family, PSNR only, and a fitted function with thousands of parameters against a rule with two.

Process notes: the track's milestones were all done, and the "Next steps" chain was heading toward micro-variants, so the run asked a different question of the same theme (generalisation across scenes) rather than another threshold sweep. Only the first two lines of `PROJECTS.md` "Picking work" were needed; the rest of the read cost time.
