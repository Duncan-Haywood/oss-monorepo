# Challenge windows against censorship

Stdlib-only Python. Optimistic-verification challenge windows when block proposers can be bribed to censor the challenge; exact attacker value and window. See `paper/whitepaper.md`.

**Live page:** https://marisstella.app/research/challenge-window/

```bash
cd research/challenge-window
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                  # seconds; output in experiments/results.txt
```
Results: closed-form window matches the exact recursion (0/5000 mismatches) and Monte Carlo; luck-only analysis underestimates by 100–170×; with an exogenous bribe price stake does not shorten the window (63 blocks for S=10…1600); bounty-funded priority fees give `S·w ≈ G/((1−ρ)θ)`. Stylised single-attacker model; MIT.

## Known gaps (quality audit, 2026-11-23)

From [`portfolio/quality/audits/2026-11-23-challenge-window.json`](../../portfolio/quality/audits/2026-11-23-challenge-window.json):

- **Prior work is not cited or positioned.** The closest is Berger, Felten, Mamageishvili and
  Sudakov, "Economic Censorship Games in Fraud Proofs" (arXiv:2502.20334, 2025), which models the
  same bribe-to-censor problem with a defender that raises inclusion tips in response; see also
  Winzer, Herd and Faust (2019) on censorship of time-locked payment channels, MAD-HTLC (2021) and
  Fox, Pai and Resnick (2023) on censorship-resistant auctions. Results (ii) and (iii) follow in one
  line from the bribe-every-block bound `w = G/((1−ρ)b)` with `b = θS`; the paper should present
  them as corollaries and say what is new against that work.
- **Fixed bribe price and no defender response.** `b` and `ρ` are constants; the prior work above
  lets the defender respond, which is the case a deployed rollup faces.
- The one result that does not follow from the pure limits, that the adaptive policy can need a
  longer window than both limits and the prefix plan when `b > S` (36 against 29 blocks at
  `G=100, S=5, ρ=.9, b=40`), is now stated in the paper and pinned by a test; it deserves its own
  experiment.
