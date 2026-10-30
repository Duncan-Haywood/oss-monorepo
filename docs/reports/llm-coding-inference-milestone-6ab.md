# llm-coding-inference milestone 6ab (2026-10-28)

- Done: real Qwen2.5-1.5B zero-shot scores for the whole GoEmotions test part, fear and sadness, cached in `experiments/gollm_*.tsv` (resumable; `llm_code_goemotions.py`), and the comparison `h6ab_llm_goemotions.py`. Savings from a real LLM coder at a rare category: 6 to 12% of the 0.5-point audit; H3's 3x not met.
- Next: stronger coder (7B or API with the owner's key), few-shot prompts, then fold the result into `paper/paper.md` (abstract still says H3 untested for a strong coder).
- Environment: torch is not on the system python. `uv venv /tmp/v && VIRTUAL_ENV=/tmp/v uv pip install torch transformers numpy --extra-index-url https://download.pytorch.org/whl/cpu` worked (about 2 min); HF downloads work through the proxy. Background jobs stop at 30 min unless `timeout` is set; the scorer resumes.
- Experiment scripts that import `rare_audit` parse `sys.argv` at import; strip argv before importing.
