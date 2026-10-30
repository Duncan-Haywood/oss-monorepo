# llm-coding-inference, milestone 6q (agent note)

- Landed: `experiments/h6q_naija_sizing.py/.txt` (sizing rule with real Qwen coders on NaijaSenti, oracle and 400-item-pilot versions), LOG and README entries. No library change.
- Rerun: `python3 experiments/h6q_naija_sizing.py` needs network for NaijaSenti (worked through the proxy 2026-10-26); about 90 s. Cached Qwen scores are in `experiments/llm_scores_*.tsv`.
- Result: oracle tuned plan saves 0.1 to 4.7% vs human-only; lambda = 1 costs 3 to 47% more; pilot of 400 plans within ~1% of oracle n, coverage 94.6 to 96.8%.
- Open: 7B coder, pilot version on a rare category, paper Section 7 still does not mention 6o/6p/6q, owner submission.
