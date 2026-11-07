---
kind: milestone
subjects: [llm-coding-inference]
tagged: auto
---
# llm-coding-inference milestone 7x (for the next run)

- Result: with the cached Qwen2.5-1.5B coder, the shipped `audit_design` default (`neg_guard = 3`, tau 0.3, guard 20) covers 93.8 to 95.2% (fear 1.15%, sadness 2.30%, admiration 8.1%) but gains width only at admiration (-20% vs pooled). At 1 to 2% the tau screen routes ~all draws to pooled. `neg_guard=3` alone (tau 0, guard 0) is -7% / -14% at 97.0% coverage.
- Open: decide whether to drop the tau screen (needs a second LLM or held-out category); Wilson-type pooled interval under 0.5%.
- Script `research/llm-coding-inference/experiments/h7x_llm_coder.py <category> <reps>`; needs numpy (`python3 platform/ci/pyenv.py pytest numpy`; the bare python3 here lacked it, the printed path worked).
