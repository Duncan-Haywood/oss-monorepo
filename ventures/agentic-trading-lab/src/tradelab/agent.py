"""The research agent: propose, backtest, keep score honestly, gate.

An agent that searches strategy space will always find a backtest that looks
good. The defence here is bookkeeping, not cleverness:

1. Every proposal is backtested on the **in-sample** period only and logged
   as a trial, whether it looks good or not.
2. The best in-sample trial is judged with the Deflated Sharpe Ratio, which
   charges for the number of trials and their dispersion, and with the
   Probability of Backtest Overfitting (CSCV) over all trials.
3. Only then is the winner run, once, on the **held-out** period, which no
   proposal ever saw.
4. A strategy is `promotable` to paper trading only if it clears the gates in
   `Gate`. Nothing in this module can place an order.

Proposers:

* `GridProposer` (default): walks the bounded search space in
  `strategies.SEARCH_SPACE`. Deterministic, no network, no key.
* `ClaudeProposer` (off unless ANTHROPIC_API_KEY is set by whoever runs it):
  asks a Claude model for the next configurations given the trial log so far.
  Its proposals are validated against the same search space, so it can only
  reorder the search, never add an unbounded number of hidden trials.
"""
from __future__ import annotations

import json
import os
import urllib.request
from dataclasses import dataclass, field

import numpy as np

from . import backtest, stats
from .data import Panel
from .strategies import REGISTRY, SEARCH_SPACE, StrategySpec, grid


@dataclass
class Gate:
    """Thresholds a strategy must clear before it may be paper traded."""

    min_dsr: float = 0.95            # P(true Sharpe > expected max of the trials)
    max_pbo: float = 0.5             # CSCV probability the IS winner is below median OOS
    min_holdout_sharpe: float = 0.0  # annualised, net of costs
    min_holdout_psr: float = 0.90    # P(holdout Sharpe > 0)


@dataclass
class Trial:
    spec: StrategySpec
    is_sharpe: float          # annualised, net, in-sample
    is_sharpe_pp: float       # per period, for the DSR
    turnover: float
    proposer: str


@dataclass
class Study:
    panel_source: str
    in_sample: tuple[str, str]
    holdout: tuple[str, str]
    cost_bps: float
    trials: list[Trial] = field(default_factory=list)
    report: dict = field(default_factory=dict)


class GridProposer:
    name = "grid"

    def __init__(self, overlays=(None, 0.10), specs: list[StrategySpec] | None = None):
        self._queue = list(specs) if specs is not None else grid(overlays=list(overlays))

    def propose(self, history: list[Trial], k: int) -> list[StrategySpec]:
        out, self._queue = self._queue[:k], self._queue[k:]
        return out


class ClaudeProposer:
    """Optional LLM proposer. Reads ANTHROPIC_API_KEY from the environment of
    whoever runs it; the key is never logged or written to disk."""

    name = "claude"
    url = "https://api.anthropic.com/v1/messages"

    def __init__(self, model: str | None = None, transport=None):
        self.model = model or os.environ.get("TRADELAB_MODEL", "claude-sonnet-5-5")
        self.key = os.environ.get("ANTHROPIC_API_KEY")
        self._transport = transport or self._post
        if not self.key and transport is None:
            raise RuntimeError("ClaudeProposer needs ANTHROPIC_API_KEY; use GridProposer otherwise")

    def _post(self, payload: dict) -> dict:
        req = urllib.request.Request(self.url, data=json.dumps(payload).encode(), method="POST", headers={
            "x-api-key": self.key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read())

    def propose(self, history: list[Trial], k: int) -> list[StrategySpec]:
        tried = [{"spec": t.spec.to_dict(), "is_sharpe": round(t.is_sharpe, 3)} for t in history[-60:]]
        prompt = (
            "You are proposing configurations for a monthly backtest of long-only rules on US industry "
            "portfolios. Only configurations inside this search space are accepted:\n"
            f"{json.dumps(SEARCH_SPACE)}\nOptional overlay: vol_target in [null, 0.10].\n"
            f"Already tried (in-sample annualised Sharpe, net of costs):\n{json.dumps(tried)}\n"
            f"Propose {k} untried configurations most likely to generalise, not just to score well "
            "in-sample. Every trial raises the bar the winner must clear. Reply with only a JSON list of "
            'objects like {"name": ..., "params": {...}, "vol_target": null}.')
        resp = self._transport({"model": self.model, "max_tokens": 1500,
                                "messages": [{"role": "user", "content": prompt}]})
        text = "".join(b.get("text", "") for b in resp.get("content", []) if b.get("type") == "text")
        start, end = text.find("["), text.rfind("]")
        try:
            items = json.loads(text[start:end + 1]) if start >= 0 else []
        except json.JSONDecodeError:
            items = []
        return [s for s in (validate(i) for i in items) if s is not None][:k]


def validate(item: dict) -> StrategySpec | None:
    """Accept a proposed configuration only if every value is in the search space."""
    try:
        name = item["name"]
        space = SEARCH_SPACE[name]
        params = item.get("params", {}) or {}
        if set(params) != set(space):
            return None
        if any(params[key] not in vals for key, vals in space.items()):
            return None
        vt = item.get("vol_target")
        if vt not in (None, 0.10):
            return None
        return StrategySpec.make(name, vol_target=vt, **params)
    except (KeyError, TypeError):
        return None


def research(panel: Panel, in_sample: tuple[str, str], holdout: tuple[str, str], proposer=None,
             budget: int = 200, batch: int = 20, cost_bps: float = 10.0, gate: Gate | None = None,
             warmup: int = 36, benchmark: np.ndarray | None = None) -> Study:
    """Run the propose -> backtest -> score loop, then judge the winner once."""
    proposer = proposer or GridProposer()
    gate = gate or Gate()
    is_panel = panel.slice(*in_sample)
    study = Study(panel.source, in_sample, holdout, cost_bps)
    seen: set[str] = set()
    is_results: dict[str, backtest.Result] = {}
    while len(study.trials) < budget:
        specs = [s for s in proposer.propose(study.trials, min(batch, budget - len(study.trials)))
                 if s.key() not in seen]
        if not specs:
            break
        for s in specs:
            seen.add(s.key())
            res = backtest.run(is_panel, s, cost_bps=cost_bps, warmup=warmup)
            is_results[s.key()] = res
            summ = stats.summary(res.returns, res.rf, res.periods_per_year)
            study.trials.append(Trial(s, summ["sharpe"], stats.sharpe(res.excess),
                                      res.annual_turnover(), proposer.name))
    if len(study.trials) < 2:
        raise RuntimeError("need at least two trials to judge selection bias")

    best = max(study.trials, key=lambda t: t.is_sharpe)
    best_is = is_results[best.spec.key()]
    dsr = stats.deflated_sharpe(best_is.excess, [t.is_sharpe_pp for t in study.trials])
    pbo = stats.pbo_cscv(np.column_stack([is_results[t.spec.key()].excess for t in study.trials]))

    # The one and only look at the held-out period. History before it is used
    # as warm-up so the rules start the holdout already formed.
    ho_start_idx = panel.labels.index(next(lab for lab in panel.labels if lab >= holdout[0]))
    warm_from = panel.labels[max(0, ho_start_idx - warmup)]
    ho_panel = panel.slice(warm_from, holdout[1])
    ho = backtest.run(ho_panel, best.spec, cost_bps=cost_bps, warmup=ho_start_idx - panel.labels.index(warm_from))
    ho_summary = stats.summary(ho.returns, ho.rf, ho.periods_per_year)
    ho_psr = stats.probabilistic_sharpe(ho.excess)
    ew = backtest.run(ho_panel, StrategySpec.make("equal_weight"), cost_bps=cost_bps,
                      warmup=ho_start_idx - panel.labels.index(warm_from))
    ew_summary = stats.summary(ew.returns, ew.rf, ew.periods_per_year)
    vs_ew = stats.alpha_beta(ho.returns, ew.returns, ho.rf, ho.periods_per_year)

    checks = {
        "dsr": dsr["dsr"] >= gate.min_dsr,
        "pbo": pbo["pbo"] <= gate.max_pbo,
        "holdout_sharpe": ho_summary["sharpe"] >= gate.min_holdout_sharpe,
        "holdout_psr": ho_psr >= gate.min_holdout_psr,
    }
    study.report = {
        "winner": best.spec.to_dict(),
        "winner_key": best.spec.key(),
        "in_sample": stats.summary(best_is.returns, best_is.rf, best_is.periods_per_year),
        "deflated_sharpe": dsr,
        "pbo": pbo,
        "holdout": ho_summary,
        "holdout_psr": ho_psr,
        "holdout_turnover": ho.annual_turnover(),
        "holdout_equal_weight": ew_summary,
        "holdout_vs_equal_weight": vs_ew,
        "gate": {"thresholds": gate.__dict__, "checks": checks, "promotable": all(checks.values())},
        "n_trials": len(study.trials),
        "proposer": proposer.name,
    }
    return study
