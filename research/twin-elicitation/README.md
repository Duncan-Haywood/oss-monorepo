# Twin elicitation: what to pay a digital-twin provider for

Pure Python, no dependencies. Companion to `twin-transfer` and `randomized-twin`. A provider with a posterior over a plant's input gain `b` is paid either by Brier score on the parameter (elicits the mean) or by the negative deployed control cost (elicits the Bayes gain, equivalently the decision-equivalent parameter `b_dec`). Results: the two elicit different twins (cost-paid gain 0.778 vs certainty-equivalent 0.823 at posterior sd 0.3), certainty equivalence costs a quartic in spread, equal-Brier reports have regret ratios of 1.3–24×, a payment cap makes the elicited gain jump at a closed-form threshold `M*`, and Brier mispays probing by a 15× spread in decision value per unit variance. See `paper/whitepaper.md`.

```bash
cd research/twin-elicitation
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, ~2 s
PYTHONPATH=src python3 experiments/run.py                 # output in experiments/results.txt
```
Stylised scalar LQ, one uncertain parameter, one risk-neutral provider; MIT.
