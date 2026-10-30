"""Event-loop backtester with costs, drift and an optional volatility overlay.

At each period t the strategy sees returns[:t] only, returns target weights,
and the portfolio earns returns[t]. Between rebalances the held weights drift
with prices, so turnover (and therefore cost) is measured against what the
portfolio actually holds, not against last period's target.

Costs are charged as `cost_bps` per unit of one-way turnover (sum of absolute
weight changes). Borrowing beyond 100% of equity pays the risk-free rate plus
`borrow_spread` a year. The volatility overlay scales the whole book to an
annualised target from the strategy's own trailing returns before the overlay
(Moreira, A. and Muir, T. (2017), "Volatility-Managed Portfolios", Journal of
Finance 72(4)), capped at max_leverage.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from .data import Panel
from .strategies import REGISTRY, StrategySpec


@dataclass
class Result:
    spec: StrategySpec
    returns: np.ndarray       # net period returns
    gross: np.ndarray         # before costs
    weights: np.ndarray       # T x N target weights actually traded
    turnover: np.ndarray      # one-way turnover per period
    rf: np.ndarray
    labels: list[str]
    periods_per_year: int

    @property
    def excess(self) -> np.ndarray:
        return self.returns - self.rf

    def annual_turnover(self) -> float:
        return float(self.turnover.mean() * self.periods_per_year)

    def cost_drag(self) -> float:
        return float((self.gross - self.returns).mean() * self.periods_per_year)


def run(panel: Panel, spec: StrategySpec, cost_bps: float = 10.0, warmup: int = 36,
        borrow_spread: float = 0.01, overlay_window: int = 12, rebalance_every: int = 1) -> Result:
    """Backtest one strategy over a panel. The first `warmup` periods are used
    only as history; results start after them so every strategy in a
    comparison is scored on the same periods."""
    fn = REGISTRY[spec.name]
    params = {**spec.param_dict, "periods_per_year": panel.periods_per_year}
    R, rf = panel.returns, panel.rf
    T, N = R.shape
    if T <= warmup + 1:
        raise ValueError(f"need more than {warmup + 1} periods, have {T}")
    held = np.zeros(N)                       # weights held going into period t (after drift)
    raw_hist: list[float] = []               # pre-overlay strategy returns, for the overlay
    out_r, out_g, out_w, out_to = [], [], [], []
    target = np.zeros(N)
    for t in range(warmup, T):
        rebalance = (t - warmup) % rebalance_every == 0
        if rebalance:
            base = np.asarray(fn(R[:t], rf[:t], params), dtype=float)
            base = np.nan_to_num(base)
            scale = 1.0
            if spec.vol_target and len(raw_hist) >= overlay_window:
                realised = np.std(raw_hist[-overlay_window:], ddof=1) * math.sqrt(panel.periods_per_year)
                scale = spec.vol_target / realised if realised > 1e-9 else 1.0
            target = base * scale
            gross_exp = np.abs(target).sum()
            if gross_exp > spec.max_leverage:
                target = target * (spec.max_leverage / gross_exp)
        else:
            target = held.copy()
        turnover = float(np.abs(target - held).sum())
        cash = 1.0 - target.sum()
        borrow = max(-cash, 0.0)
        gross = float(target @ R[t] + cash * rf[t] - borrow * borrow_spread / panel.periods_per_year)
        net = gross - turnover * cost_bps / 1e4
        # Pre-overlay return of the base weights, for the overlay's own vol estimate.
        raw_hist.append(float(base @ R[t] + (1.0 - base.sum()) * rf[t]) if rebalance else gross)
        out_r.append(net)
        out_g.append(gross)
        out_w.append(target.copy())
        out_to.append(turnover)
        # Drift: each sleeve grows with its asset, equity grows with the portfolio.
        grown = target * (1.0 + R[t])
        held = grown / (1.0 + gross) if (1.0 + gross) > 1e-9 else np.zeros(N)
    return Result(spec, np.array(out_r), np.array(out_g), np.array(out_w), np.array(out_to),
                  rf[warmup:], panel.labels[warmup:], panel.periods_per_year)


def run_many(panel: Panel, specs: list[StrategySpec], **kw) -> list[Result]:
    return [run(panel, s, **kw) for s in specs]


def walk_forward(panel: Panel, specs: list[StrategySpec], train: int = 120, step: int = 12,
                 cost_bps: float = 10.0, warmup: int = 36, expanding: bool = True) -> dict:
    """Out-of-sample selection: every `step` periods, pick the spec with the best
    net Sharpe over the training window that ends just before, and trade it for
    the next `step` periods. The returned series is what an agent re-selecting
    on schedule would have earned, including the cost of switching."""
    results = run_many(panel, specs, cost_bps=cost_bps, warmup=warmup)
    ex = np.column_stack([r.excess for r in results])
    net = np.column_stack([r.returns for r in results])
    T = ex.shape[0]
    W = [r.weights for r in results]
    chosen, oos = [], []
    prev = None
    for start in range(train, T, step):
        lo = 0 if expanding else start - train
        win = ex[lo:start]
        sr = win.mean(0) / np.maximum(win.std(0, ddof=1), 1e-12)
        best = int(np.argmax(sr))
        end = min(start + step, T)
        chosen.append({"from": results[0].labels[start], "to": results[0].labels[end - 1],
                       "spec": specs[best].key()})
        block = net[start:end, best].copy()
        if prev is not None and prev != best:
            # Each spec's own turnover is already in its returns; a switch also
            # trades from the old book to the new one, charged on its first period
            # (less the turnover that spec would have done anyway).
            extra = np.abs(W[best][start] - W[prev][start - 1]).sum() - results[best].turnover[start]
            block[0] -= max(extra, 0.0) * cost_bps / 1e4
        oos.extend(block)
        prev = best
    switches = sum(1 for a, b in zip(chosen, chosen[1:]) if a["spec"] != b["spec"])
    oos = np.array(oos)
    labels = results[0].labels[train:]
    rf = results[0].rf[train:]
    return {"returns": oos, "rf": rf, "labels": labels, "chosen": chosen, "switches": switches,
            "results": results}
