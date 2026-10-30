# llm-coding-inference, milestone 6p (agent note)

- Landed: `stratified_ppi_tuned` and `stratum_lambda_s2` in `llmci/estimators.py` (+2 tests), `experiments/h6p_lambda_sizing.py/.txt`, LOG and README entries.
- To rerun GoEmotions experiments in a fresh container: download `goemotions_{1,2,3}.csv` from `https://storage.googleapis.com/gresearch/goemotions/data/full_dataset/` into `~/.cache/qual-real/` (worked through the proxy on 2026-10-26).
- Result: per-stratum lambda removes the 6o penalty; savings vs human-only 1.9 to 8.6% on stand-in coders.
- Open: NaijaSenti + real Qwen coders version, pilot-estimated lambda sizing, 7B coder, paper section 7 update (paper/paper.md does not yet mention 6o or 6p), owner submission.
