# llm-coding-inference milestone 6b (2026-10-25)

Pilot-based audit sizing is done: `research/llm-coding-inference/experiments/h6b_pilot.py`
(30 s, stdlib, needs the NaijaSenti tsv cache), results in `h6b_pilot.txt`, log and
README updated. All four pre-registered hypotheses held. Open next: a sequential
stopping rule and its coverage; milestone 5 with a real LLM coder (needs a key or
local model); a second corpus. `h5_plugin.py` is imported by `h6b_pilot.py` (for
`neyman_total`), so keep its function names.
