# llm-coding-inference milestone 6c (2026-10-25)

For the next run on this programme.

- Landed: `experiments/h6c_sequential.py` and its table; a sequential stop-at-3-points audit meets the target in 100% of audits, mean n within 1% of the oracle (B = 30), coverage 94.2 to 95.2%. All four pre-registered hypotheses supported (LOG.md).
- The script takes about 2.5 min; run it with `run_in_background` and no `| tail` (it buffers).
- Open: harder cases for the stopping rule (rare category, 1-point target), milestone 5 with a real LLM coder (the main gap: every result so far uses stand-in coders), a second corpus, `paper/`.
- Other open programme steps seen: `lowcomm-training` was claimed by PR #10293 at the time of this run.
