"""Performance and overfitting statistics.

Methods and sources:

* Probabilistic Sharpe Ratio: Bailey, D. H. and Lopez de Prado, M. (2012),
  "The Sharpe Ratio Efficient Frontier", Journal of Risk 15(2).
* Deflated Sharpe Ratio: Bailey, D. H. and Lopez de Prado, M. (2014),
  "The Deflated Sharpe Ratio: Correcting for Selection Bias, Backtest
  Overfitting and Non-Normality", Journal of Portfolio Management 40(5).
* Probability of Backtest Overfitting via combinatorially symmetric
  cross-validation (CSCV): Bailey, D. H., Borwein, J., Lopez de Prado, M. and
  Zhu, Q. J. (2017), "The Probability of Backtest Overfitting", Journal of
  Computational Finance 20(4).
* Stationary bootstrap: Politis, D. N. and Romano, J. P. (1994), "The
  Stationary Bootstrap", Journal of the American Statistical Association
  89(428).

Everything here is written from the papers' formulas; no code was copied.
"""
from __future__ import annotations

import itertools
import math
from statistics import NormalDist

import numpy as np

EULER_GAMMA = 0.5772156649015329
_N = NormalDist()


def sharpe(excess: np.ndarray) -> float:
    """Per-period Sharpe ratio of an excess-return series (not annualised)."""
    x = np.asarray(excess, dtype=float)
    sd = x.std(ddof=1)
    return float(x.mean() / sd) if sd > 0 else 0.0


def summary(returns: np.ndarray, rf: np.ndarray, periods_per_year: int) -> dict:
    """Headline numbers for a strategy's period returns."""
    r = np.asarray(returns, dtype=float)
    ex = r - np.asarray(rf, dtype=float)
    wealth = np.cumprod(1.0 + r)
    peak = np.maximum.accumulate(np.concatenate([[1.0], wealth]))[1:]
    dd = wealth / peak - 1.0
    years = len(r) / periods_per_year
    cagr = wealth[-1] ** (1.0 / years) - 1.0 if wealth[-1] > 0 else -1.0
    vol = r.std(ddof=1) * math.sqrt(periods_per_year)
    downside = ex[ex < 0]
    dsd = math.sqrt((downside ** 2).sum() / len(ex)) * math.sqrt(periods_per_year) if len(ex) else 0.0
    sr = sharpe(ex)
    mdd = float(dd.min())
    return {
        "periods": int(len(r)),
        "years": round(years, 2),
        "cagr": float(cagr),
        "vol": float(vol),
        "sharpe": sr * math.sqrt(periods_per_year),
        "sortino": float(ex.mean() * periods_per_year / dsd) if dsd > 0 else 0.0,
        "max_drawdown": mdd,
        "calmar": float(cagr / -mdd) if mdd < 0 else 0.0,
        "skew": float(skewness(ex)),
        "kurtosis": float(kurtosis(ex)),
        "hit_rate": float((ex > 0).mean()),
        "final_wealth": float(wealth[-1]),
    }


def skewness(x: np.ndarray) -> float:
    x = np.asarray(x, dtype=float)
    sd = x.std()
    return float(((x - x.mean()) ** 3).mean() / sd ** 3) if sd > 0 else 0.0


def kurtosis(x: np.ndarray) -> float:
    """Raw (Pearson) kurtosis; 3 for a normal distribution."""
    x = np.asarray(x, dtype=float)
    sd = x.std()
    return float(((x - x.mean()) ** 4).mean() / sd ** 4) if sd > 0 else 3.0


def _sr_std(sr: float, n: int, skew: float, kurt: float) -> float:
    """Standard error of an estimated per-period Sharpe ratio under non-normal returns
    (Bailey and Lopez de Prado 2012, eq. for the PSR denominator)."""
    v = (1.0 - skew * sr + (kurt - 1.0) / 4.0 * sr * sr) / (n - 1)
    return math.sqrt(max(v, 1e-18))


def probabilistic_sharpe(excess: np.ndarray, sr_benchmark: float = 0.0) -> float:
    """P(true per-period Sharpe > sr_benchmark) given the sample, allowing for
    skew and fat tails. sr_benchmark is per period, not annualised."""
    x = np.asarray(excess, dtype=float)
    sr = sharpe(x)
    return _N.cdf((sr - sr_benchmark) / _sr_std(sr, len(x), skewness(x), kurtosis(x)))


def expected_max_sharpe(n_trials: int, sr_variance: float) -> float:
    """Expected maximum of n_trials per-period Sharpe ratios whose true value is
    zero, given the variance of the estimated Sharpe ratios across trials
    (Bailey and Lopez de Prado 2014, the 'SR0' of the DSR)."""
    if n_trials < 2:
        return 0.0
    sd = math.sqrt(max(sr_variance, 0.0))
    return sd * ((1 - EULER_GAMMA) * _N.inv_cdf(1 - 1.0 / n_trials)
                 + EULER_GAMMA * _N.inv_cdf(1 - 1.0 / (n_trials * math.e)))


def deflated_sharpe(excess: np.ndarray, trial_sharpes: list[float]) -> dict:
    """Deflated Sharpe Ratio of the selected strategy.

    trial_sharpes holds the per-period Sharpe ratio of every configuration
    tried, the selected one included. The more configurations were tried and
    the more their Sharpe ratios vary, the higher the bar the winner must clear.
    """
    n = max(len(trial_sharpes), 1)
    var = float(np.var(trial_sharpes, ddof=1)) if len(trial_sharpes) > 1 else 0.0
    sr0 = expected_max_sharpe(n, var)
    return {"dsr": probabilistic_sharpe(excess, sr0), "sr0_per_period": sr0, "n_trials": n,
            "trial_sharpe_var": var}


def pbo_cscv(matrix: np.ndarray, n_blocks: int = 10) -> dict:
    """Probability of Backtest Overfitting by CSCV.

    matrix: T x N excess returns, one column per configuration tried, over the
    same periods. The periods are cut into n_blocks equal blocks; for every way
    of choosing half the blocks as in-sample, the configuration with the best
    in-sample Sharpe is found and its rank among all configurations out of
    sample recorded. PBO is the share of splits where the in-sample winner
    lands in the bottom half out of sample (logit <= 0).
    """
    m = np.asarray(matrix, dtype=float)
    t, n = m.shape
    if n < 2:
        raise ValueError("PBO needs at least two configurations")
    if n_blocks % 2:
        raise ValueError("n_blocks must be even")
    size = t // n_blocks
    m = m[: size * n_blocks]
    blocks = [m[i * size:(i + 1) * size] for i in range(n_blocks)]
    logits = []
    degradation = []
    for combo in itertools.combinations(range(n_blocks), n_blocks // 2):
        ins = np.vstack([blocks[i] for i in combo])
        oos = np.vstack([blocks[i] for i in range(n_blocks) if i not in combo])
        sr_in = ins.mean(0) / np.maximum(ins.std(0, ddof=1), 1e-12)
        sr_out = oos.mean(0) / np.maximum(oos.std(0, ddof=1), 1e-12)
        best = int(np.argmax(sr_in))
        # Relative rank in (0, 1): 1 is best out of sample.
        rank = (sr_out < sr_out[best]).sum() + 0.5 * ((sr_out == sr_out[best]).sum() - 1) + 1
        w = rank / (n + 1)
        logits.append(math.log(w / (1 - w)))
        degradation.append((float(sr_in[best]), float(sr_out[best])))
    logits = np.array(logits)
    deg = np.array(degradation)
    slope = float(np.polyfit(deg[:, 0], deg[:, 1], 1)[0]) if len(deg) > 2 else float("nan")
    return {
        "pbo": float((logits <= 0).mean()),
        "splits": int(len(logits)),
        "median_logit": float(np.median(logits)),
        "is_oos_slope": slope,
        "mean_is_sharpe_of_winner": float(deg[:, 0].mean()),
        "mean_oos_sharpe_of_winner": float(deg[:, 1].mean()),
    }


def stationary_bootstrap_sharpe(excess: np.ndarray, periods_per_year: int, n_boot: int = 2000,
                                mean_block: float = 12.0, seed: int = 7) -> dict:
    """Confidence interval for the annualised Sharpe ratio by the stationary
    bootstrap, which keeps serial dependence (volatility clustering) that an
    i.i.d. bootstrap would destroy."""
    x = np.asarray(excess, dtype=float)
    t = len(x)
    rng = np.random.default_rng(seed)
    p = 1.0 / mean_block
    out = np.empty(n_boot)
    for b in range(n_boot):
        idx = np.empty(t, dtype=int)
        idx[0] = rng.integers(t)
        jumps = rng.random(t) < p
        starts = rng.integers(t, size=t)
        for i in range(1, t):
            idx[i] = starts[i] if jumps[i] else (idx[i - 1] + 1) % t
        out[b] = sharpe(x[idx]) * math.sqrt(periods_per_year)
    lo, hi = np.percentile(out, [2.5, 97.5])
    return {"sharpe_ci95": [float(lo), float(hi)], "p_sharpe_le_0": float((out <= 0).mean())}


def alpha_beta(returns: np.ndarray, benchmark: np.ndarray, rf: np.ndarray, periods_per_year: int) -> dict:
    """OLS of strategy excess returns on benchmark excess returns, with a
    Newey-West (Bartlett kernel) standard error for alpha."""
    y = np.asarray(returns) - rf
    x = np.asarray(benchmark) - rf
    xm = np.column_stack([np.ones_like(x), x])
    coef, *_ = np.linalg.lstsq(xm, y, rcond=None)
    resid = y - xm @ coef
    t = len(y)
    lags = int(math.floor(4 * (t / 100.0) ** (2.0 / 9.0)))
    xe = xm * resid[:, None]
    s = xe.T @ xe
    for lag in range(1, lags + 1):
        w = 1 - lag / (lags + 1)
        g = xe[lag:].T @ xe[:-lag]
        s += w * (g + g.T)
    bread = np.linalg.inv(xm.T @ xm)
    cov = bread @ s @ bread
    se_alpha = math.sqrt(max(cov[0, 0], 0.0))
    return {"alpha_annual": float(coef[0] * periods_per_year), "beta": float(coef[1]),
            "alpha_t": float(coef[0] / se_alpha) if se_alpha > 0 else 0.0, "nw_lags": lags}
