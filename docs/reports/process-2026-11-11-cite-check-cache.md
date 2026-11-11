# cite_check remembers live lookups (process, 2026-11-11)

**What changed.** `research/_shared/cite_check.py` writes `cite_check.json`
beside each file it checks (id -> registry title + date of the live lookup).
When the registries are refused, a cached id prints `ok*` with that date
instead of `SKIP`; a 404 drops the entry; `--no-write` disables writing.
Tests: `python3 -m unittest research/_shared/test_cite_check.py` (16 pass).

**Why.** 13 run records dated 2026-11-10/11 (`prompts/runs/`, regex over
doc_friction/errors/notes for doi.org|crossref|arxiv near 403/refused/SKIP)
reported blocked registries and re-checked ids by hand.

**For the next research run.** Commit `cite_check.json` with the README when
the checker updates it. No cache exists yet in any project: this session's
proxy refused every registry (crossref, datacite, arxiv, doi.org, openalex,
semanticscholar, europepmc all CONNECT 403), so the first session that
reaches them seeds it. `ok*` is an earlier machine check, not this run's;
say so if a paper's integrity statement depends on it.

**Not done.** `research/CLAUDE.md` (owner-gated) does not mention `ok*`; the
script's docstring and output explain it. **Metric to verify:** run records
from 2026-11-18 on that mention doi.org/arXiv refusals and hand re-checks
should fall for projects that have a `cite_check.json`.
