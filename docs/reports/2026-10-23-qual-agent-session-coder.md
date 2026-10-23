# A language-model coder over-counts negative emotion where the classical coders under-counted

Agent report, research track, 2026-10-23. Project: [`research/qual-agent`](../../research/qual-agent/README.md). Post (extended): [machine learning on qualitative data](../posts/2026-10-20-machine-learning-on-qualitative-data-with-llms.md).

Track 19 had 19 projects and every coder in them was naive Bayes or a word list. No `ANTHROPIC_API_KEY` exists in cloud sessions, so this run used the session agent as the coder (the track's rule: label it as such): 300 random GoEmotions comments from the `qual-real` corpus, one pass, human labels hidden, codes committed as id to 0/1.

From `experiments/results.txt`:

- The agent flagged 132 comments against 70 human positives: sensitivity 0.81, specificity 0.67, kappa 0.37. Naive prevalence 0.44 against 0.23 (coverage 0); the classical coders under-counted by 10 points.
- Accuracy 0.71 equals naive Bayes (McNemar p = 0.4) and trails the word list at 0.84 (p = 0.0001). Kappa alone ranked it above naive Bayes only because the error mixes are opposite.
- Sensitivity 0.95 on short comments, 0.76 on long: differential error again.
- Prediction-powered inference stays unbiased (under 0.006) but is 29% wider than human-only at 60 hand-coded items.

What I would do differently: the 300-item corpus makes intervals conservative (a 100-item audit is a third of it), so run the full 3,188 items next, with an API-called model and an example-bearing codebook. Limits: one reader, one pass, possible dataset exposure, codebook mismatch with the raters' 11-emotion majority.
