# Multi-verifier audit: reward splitting and the volunteer's dilemma

Stdlib-only Python. Extends [`verification-game`](../verification-game) and [`audit-dynamics`](../audit-dynamics)
from one verifier to m. See `paper/whitepaper.md`.

**Live page:** https://marisstella.app/research/multi-verifier-audit/

```bash
cd research/multi-verifier-audit
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 11 tests
PYTHONPATH=src python3 experiments/run.py                  # ~12 s
```
Results: aggregate detection is pinned at `s/(s+S)` for any m while equilibrium cheating *rises* with m under split rewards;
the symmetric equilibrium is a saddle for m ≥ 2 (volunteer's dilemma), Hedge concentrates the audit burden on a single verifier and detection still cycles
(corrected 2026-11-22: an earlier "committee keeps detection" result came from a tied start; see paper result 4);
bandit learners without an exploration floor are absorbed at "no cheating, no auditing" for m ≥ 2 (m=1 overshoots). Stylised; limitations in the paper. MIT.

**Known gaps** (quality round 98, [`audit`](../../portfolio/quality/audits/2026-11-22-multi-verifier-audit.json)):
`experiments/run.py` section 2 still prints the tied-start table; it needs a random-start sweep with spread, and the
older concentration test still uses the tied start. `bandit_run` has no test. Multi-inspector inspection games, the
verifier's dilemma and Truebit are not yet engaged in the paper.
