"""Strategies: functions from the past to target weights.

Every strategy is `weights(past_returns, past_rf, params) -> np.ndarray` where
`past_returns` holds only periods strictly before the one being traded. The
engine (`backtest.py`) is what enforces that: a strategy is never handed the
period it is about to earn. Weights are fractions of equity per asset; what is
left over (1 - sum) sits in cash at the risk-free rate. Long-only by default,
because a cash account at a retail broker cannot short.

Sources for each rule are in its docstring. They are re-implementations of
the published rules, with parameters exposed so the agent can search them,
not claims to reproduce the papers' exact numbers.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Callable

import numpy as np


def _cum(r: np.ndarray) -> np.ndarray:
    """Compounded return over the rows of r, per column."""
    return np.prod(1.0 + r, axis=0) - 1.0


def _vol(r: np.ndarray) -> np.ndarray:
    v = r.std(axis=0, ddof=1)
    return np.where(v > 1e-12, v, np.nan)


def equal_weight(past, rf, p):
    """Rebalance to 1/N each period. The baseline any rule has to beat
    (DeMiguel, Garlappi and Uppal 2009, Review of Financial Studies 22(5))."""
    n = past.shape[1]
    return np.full(n, 1.0 / n)


def sma_trend(past, rf, p):
    """Hold an asset only while its price is above its trailing moving average,
    otherwise cash; equal weight across held assets. Faber, M. T. (2007),
    "A Quantitative Approach to Tactical Asset Allocation", Journal of Wealth
    Management 9(4) (10-month rule)."""
    look = int(p.get("lookback", 10))
    if len(past) < look:
        return np.zeros(past.shape[1])
    price = np.cumprod(1.0 + past[-look:], axis=0)
    above = price[-1] > price.mean(axis=0)
    return above / past.shape[1]


def tsmom(past, rf, p):
    """Time-series momentum: go long assets whose own excess return over the
    lookback was positive (and short the rest if long_only is False), sized to
    a per-asset volatility target. Moskowitz, T. J., Ooi, Y. H. and Pedersen,
    L. H. (2012), "Time Series Momentum", Journal of Financial Economics 104(2)."""
    look = int(p.get("lookback", 12))
    vol_win = int(p.get("vol_window", 12))
    ppy = int(p.get("periods_per_year", 12))
    need = max(look, vol_win)
    if len(past) < need:
        return np.zeros(past.shape[1])
    ex = past[-look:] - rf[-look:, None]
    signal = np.sign(_cum(ex))
    if p.get("long_only", True):
        signal = np.maximum(signal, 0)
    sigma = _vol(past[-vol_win:]) * math.sqrt(ppy)
    size = np.nan_to_num(p.get("asset_vol_target", 0.40) / sigma)
    return signal * size / past.shape[1]


def xs_momentum(past, rf, p):
    """Cross-sectional momentum: hold the top_k assets by return over the
    lookback, skipping the most recent `skip` periods. Jegadeesh, N. and
    Titman, S. (1993), Journal of Finance 48(1); for industries, Moskowitz, T. J.
    and Grinblatt, M. (1999), "Do Industries Explain Momentum?", Journal of
    Finance 54(4)."""
    look, skip, k = int(p.get("lookback", 12)), int(p.get("skip", 1)), int(p.get("top_k", 3))
    if len(past) < look:
        return np.zeros(past.shape[1])
    window = past[-look:len(past) - skip] if skip else past[-look:]
    score = _cum(window)
    w = np.zeros(past.shape[1])
    w[np.argsort(score)[::-1][:k]] = 1.0 / k
    return w


def dual_momentum(past, rf, p):
    """Relative plus absolute momentum: of the top_k assets by lookback return,
    hold only those whose lookback return also beat T-bills; the rest of their
    slot goes to cash. Antonacci, G. (2014), Dual Momentum Investing,
    McGraw-Hill; the absolute leg is the time-series momentum filter above."""
    look, k = int(p.get("lookback", 12)), int(p.get("top_k", 3))
    if len(past) < look:
        return np.zeros(past.shape[1])
    score = _cum(past[-look:])
    hurdle = float(np.prod(1.0 + rf[-look:]) - 1.0)
    w = np.zeros(past.shape[1])
    for i in np.argsort(score)[::-1][:k]:
        if score[i] > hurdle:
            w[i] = 1.0 / k
    return w


def inverse_vol(past, rf, p):
    """Weights proportional to 1 / trailing volatility, fully invested: the
    naive form of risk parity (Maillard, Roncalli and Teiletche 2010, Journal of
    Portfolio Management 36(4), give the general equal-risk-contribution case)."""
    win = int(p.get("vol_window", 12))
    if len(past) < win:
        return np.zeros(past.shape[1])
    inv = np.nan_to_num(1.0 / _vol(past[-win:]))
    return inv / inv.sum() if inv.sum() > 0 else inv


def reversal(past, rf, p):
    """Short-term reversal: hold the bottom_k assets by last-period return.
    Jegadeesh, N. (1990), Journal of Finance 45(3); Lehmann, B. N. (1990),
    Quarterly Journal of Economics 105(1). Included because it trades heavily,
    so it shows what costs do to a paper edge."""
    look, k = int(p.get("lookback", 1)), int(p.get("bottom_k", 3))
    if len(past) < look:
        return np.zeros(past.shape[1])
    score = _cum(past[-look:])
    w = np.zeros(past.shape[1])
    w[np.argsort(score)[:k]] = 1.0 / k
    return w


def trend_momentum_blend(past, rf, p):
    """Half dual momentum, half SMA trend: two different trend rules averaged,
    the cheapest form of ensembling."""
    return 0.5 * dual_momentum(past, rf, p) + 0.5 * sma_trend(past, rf, {**p, "lookback": p.get("sma_lookback", 10)})


REGISTRY: dict[str, Callable] = {
    "equal_weight": equal_weight,
    "sma_trend": sma_trend,
    "tsmom": tsmom,
    "xs_momentum": xs_momentum,
    "dual_momentum": dual_momentum,
    "inverse_vol": inverse_vol,
    "reversal": reversal,
    "trend_momentum_blend": trend_momentum_blend,
}

# The search space the agent may draw from. Bounded on purpose: every value
# here is a trial that the Deflated Sharpe Ratio has to charge for.
SEARCH_SPACE: dict[str, dict[str, list]] = {
    "equal_weight": {},
    "sma_trend": {"lookback": [6, 8, 10, 12]},
    "tsmom": {"lookback": [3, 6, 9, 12], "asset_vol_target": [0.2, 0.4]},
    "xs_momentum": {"lookback": [6, 9, 12], "skip": [0, 1], "top_k": [2, 3, 5]},
    "dual_momentum": {"lookback": [6, 9, 12], "top_k": [2, 3, 5]},
    "inverse_vol": {"vol_window": [6, 12, 24]},
    "reversal": {"lookback": [1], "bottom_k": [2, 3]},
    "trend_momentum_blend": {"lookback": [9, 12], "top_k": [3, 5], "sma_lookback": [10]},
}


@dataclass(frozen=True)
class StrategySpec:
    """A strategy plus its parameters and portfolio overlay settings."""

    name: str
    params: tuple = ()
    vol_target: float | None = None   # annualised portfolio vol target (overlay), None = off
    max_leverage: float = 1.0         # 1.0 = no borrowing (cash account)

    @staticmethod
    def make(name: str, vol_target: float | None = None, max_leverage: float = 1.0, **params) -> "StrategySpec":
        if name not in REGISTRY:
            raise KeyError(f"unknown strategy {name!r}; known: {sorted(REGISTRY)}")
        return StrategySpec(name, tuple(sorted(params.items())), vol_target, max_leverage)

    @property
    def param_dict(self) -> dict:
        return dict(self.params)

    def key(self) -> str:
        ps = ",".join(f"{k}={v}" for k, v in self.params)
        ov = f"|vt={self.vol_target},L={self.max_leverage}" if self.vol_target else ""
        return f"{self.name}({ps}){ov}"

    def to_dict(self) -> dict:
        return {"name": self.name, "params": self.param_dict, "vol_target": self.vol_target,
                "max_leverage": self.max_leverage}

    @staticmethod
    def from_dict(d: dict) -> "StrategySpec":
        return StrategySpec.make(d["name"], d.get("vol_target"), d.get("max_leverage", 1.0), **d.get("params", {}))


def grid(space: dict[str, dict[str, list]] | None = None, overlays: list[float | None] = (None,)) -> list[StrategySpec]:
    """Every configuration in the search space, crossed with the overlay targets."""
    import itertools
    space = space or SEARCH_SPACE
    out = []
    for name, ps in space.items():
        keys = sorted(ps)
        for combo in itertools.product(*(ps[k] for k in keys)) if keys else [()]:
            for vt in overlays:
                out.append(StrategySpec.make(name, vol_target=vt, **dict(zip(keys, combo))))
    return out
