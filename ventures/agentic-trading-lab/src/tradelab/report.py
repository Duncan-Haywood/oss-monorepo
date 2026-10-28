"""The full study behind README's results: `python -m tradelab study`.

Writes results/study.json (every number) and results/REPORT.md (the same,
readable). Downloads its data on first run; see data.py for sources.
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from . import agent, backtest, data, stats
from .strategies import StrategySpec, grid

DEFAULTS = [
    StrategySpec.make("equal_weight"),
    StrategySpec.make("inverse_vol", vol_window=12),
    StrategySpec.make("sma_trend", lookback=10),
    StrategySpec.make("tsmom", lookback=12, asset_vol_target=0.4),
    StrategySpec.make("xs_momentum", lookback=12, skip=1, top_k=3),
    StrategySpec.make("dual_momentum", lookback=12, top_k=3),
    StrategySpec.make("trend_momentum_blend", lookback=12, top_k=3, sma_lookback=10),
    StrategySpec.make("reversal", lookback=1, bottom_k=3),
    StrategySpec.make("dual_momentum", vol_target=0.10, lookback=12, top_k=3),
]

# Year each rule was published, for the before/after comparison (McLean, R. D.
# and Pontiff, J. (2016), "Does Academic Research Destroy Stock Return
# Predictability?", Journal of Finance 71(1), find anomaly returns fall after
# publication). Equal weight and inverse vol are baselines, not anomalies.
PUBLISHED = {"sma_trend": 2007, "tsmom": 2012, "xs_momentum": 1999, "dual_momentum": 2014,
             "reversal": 1990, "trend_momentum_blend": 2014}

CRYPTO_SPECS = (
    [StrategySpec.make("equal_weight")]
    + [StrategySpec.make("sma_trend", lookback=lb) for lb in (20, 50, 100, 150, 200)]
    + [StrategySpec.make("tsmom", lookback=lb, vol_window=60, asset_vol_target=vt)
       for lb in (14, 30, 60, 90, 180) for vt in (0.4, 0.8)]
    + [StrategySpec.make("dual_momentum", lookback=lb, top_k=1) for lb in (30, 60, 90, 180)]
    + [StrategySpec.make("inverse_vol", vol_window=w) for w in (30, 90)]
)


def _row(res: backtest.Result) -> dict:
    s = stats.summary(res.returns, res.rf, res.periods_per_year)
    s["turnover"] = res.annual_turnover()
    s["cost_drag"] = res.cost_drag()
    return s


def _r(x, n=3):
    return None if x is None or (isinstance(x, float) and math.isnan(x)) else round(float(x), n)


def equity_study(n_industries: int, in_sample, holdout, cost_bps: float) -> dict:
    panel = data.french_industries(n_industries)
    out = {"source": panel.source, "first": panel.labels[0], "last": panel.labels[-1],
           "assets": panel.assets if n_industries <= 12 else f"{n_industries} industries"}

    # A. Every default rule over the whole sample, net of costs.
    full = {s.key(): _row(backtest.run(panel, s, cost_bps=cost_bps)) for s in DEFAULTS}
    mkt = data.french_market().slice(panel.labels[0], panel.labels[-1])
    full["US market (buy and hold)"] = _row(backtest.run(mkt, StrategySpec.make("equal_weight"), cost_bps=0))
    out["full_sample"] = full

    # B. The agent's search, judged on a holdout it never saw.
    st = agent.research(panel, in_sample, holdout, cost_bps=cost_bps)
    rep = st.report
    ho_panel_res = None
    out["agent"] = rep
    out["agent"]["top_trials"] = [{"spec": t.spec.key(), "is_sharpe": t.is_sharpe, "turnover": t.turnover}
                                  for t in sorted(st.trials, key=lambda t: -t.is_sharpe)[:10]]

    # Bootstrap CIs on the holdout for the winner and for equal weight.
    winner = StrategySpec.from_dict(rep["winner"])
    hidx = next(i for i, lab in enumerate(panel.labels) if lab >= holdout[0])
    hp = panel.slice(panel.labels[hidx - 36], holdout[1])
    w_res = backtest.run(hp, winner, cost_bps=cost_bps, warmup=36)
    e_res = backtest.run(hp, StrategySpec.make("equal_weight"), cost_bps=cost_bps, warmup=36)
    out["holdout_bootstrap"] = {
        "winner": stats.stationary_bootstrap_sharpe(w_res.excess, 12, n_boot=1000),
        "equal_weight": stats.stationary_bootstrap_sharpe(e_res.excess, 12, n_boot=1000),
        "difference_sharpe_point": stats.summary(w_res.returns, w_res.rf, 12)["sharpe"]
        - stats.summary(e_res.returns, e_res.rf, 12)["sharpe"],
    }

    # C. Cost sensitivity of each default rule over the holdout.
    out["cost_sweep_holdout"] = {
        s.key(): {str(c): _r(stats.summary(r.returns, r.rf, 12)["sharpe"])
                  for c in (0, 10, 25, 50) for r in [backtest.run(hp, s, cost_bps=c, warmup=36)]}
        for s in DEFAULTS}

    # D. Walk-forward: re-pick the best trailing-Sharpe rule every year.
    specs = grid(overlays=[None])
    wf = backtest.walk_forward(panel, specs, train=120, step=12, cost_bps=cost_bps)
    wf_sum = stats.summary(wf["returns"], wf["rf"], 12)
    ew_wf = backtest.run(panel, StrategySpec.make("equal_weight"), cost_bps=cost_bps)
    ew_tail = ew_wf.returns[120:]
    out["walk_forward"] = {
        "from": wf["labels"][0], "to": wf["labels"][-1], "candidates": len(specs),
        "switches": wf["switches"], "summary": wf_sum,
        "equal_weight_same_periods": stats.summary(ew_tail, wf["rf"], 12),
        "most_chosen": _most_common([c["spec"] for c in wf["chosen"]], 5),
        "last_choice": wf["chosen"][-1],
    }

    # E. Before and after publication.
    pp = {}
    for s in DEFAULTS:
        year = PUBLISHED.get(s.name)
        if year is None or s.vol_target:
            continue
        r = backtest.run(panel, s, cost_bps=cost_bps)
        e = backtest.run(panel, StrategySpec.make("equal_weight"), cost_bps=cost_bps)
        cut = f"{year}12"
        pre = [i for i, lab in enumerate(r.labels) if lab <= cut]
        post = [i for i, lab in enumerate(r.labels) if lab > cut]
        pp[s.key()] = {
            "published": year,
            "pre_sharpe": stats.summary(r.returns[pre], r.rf[pre], 12)["sharpe"],
            "post_sharpe": stats.summary(r.returns[post], r.rf[post], 12)["sharpe"],
            "pre_minus_ew": stats.summary(r.returns[pre], r.rf[pre], 12)["sharpe"]
            - stats.summary(e.returns[pre], e.rf[pre], 12)["sharpe"],
            "post_minus_ew": stats.summary(r.returns[post], r.rf[post], 12)["sharpe"]
            - stats.summary(e.returns[post], e.rf[post], 12)["sharpe"],
            "post_months": len(post),
        }
    out["publication"] = pp

    # F. Growth of $1 for the page's chart, one point per month.
    curves = {}
    for label, spec in (("Equal weight", StrategySpec.make("equal_weight")),
                        ("SMA trend (10m)", StrategySpec.make("sma_trend", lookback=10)),
                        ("Dual momentum (12m, top 3)", StrategySpec.make("dual_momentum", lookback=12, top_k=3)),
                        ("Time-series momentum (12m)", StrategySpec.make("tsmom", lookback=12, asset_vol_target=0.4))):
        r = backtest.run(panel, spec, cost_bps=cost_bps)
        curves[label] = [round(float(x), 4) for x in np.cumprod(1 + r.returns)]
    out["curves"] = {"labels": r.labels, "series": curves}
    return out


def crypto_study(pairs, in_sample, holdout, cost_bps: float) -> dict:
    panel = data.coinbase_daily(pairs)
    out = {"source": panel.source, "first": panel.labels[0], "last": panel.labels[-1], "assets": pairs}
    st = agent.research(panel, in_sample, holdout, proposer=agent.GridProposer(specs=CRYPTO_SPECS),
                        cost_bps=cost_bps, warmup=200)
    out["agent"] = st.report
    winner = StrategySpec.from_dict(st.report["winner"])
    hidx = next(i for i, lab in enumerate(panel.labels) if lab >= holdout[0])
    hp = panel.slice(panel.labels[hidx - 200], holdout[1])
    out["cost_sweep_holdout"] = {
        s.key(): {str(c): _r(stats.summary(r.returns, r.rf, 365)["sharpe"])
                  for c in (0, 25, 50, 100, 150) for r in [backtest.run(hp, s, cost_bps=c, warmup=200)]}
        for s in [winner, StrategySpec.make("equal_weight"), StrategySpec.make("sma_trend", lookback=200)]}
    w = backtest.run(hp, winner, cost_bps=cost_bps, warmup=200)
    out["holdout_bootstrap_winner"] = stats.stationary_bootstrap_sharpe(w.excess, 365, n_boot=500, mean_block=20)
    return out


def _most_common(items, k):
    counts: dict[str, int] = {}
    for i in items:
        counts[i] = counts.get(i, 0) + 1
    return sorted(counts.items(), key=lambda kv: -kv[1])[:k]


def run_study(out_dir: Path, crypto: bool = True) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    study = {
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "settings": {"equity_cost_bps": 10, "equity_in_sample": ["192607", "199912"],
                     "equity_holdout": ["200001", "999912"], "crypto_cost_bps": 50,
                     "crypto_in_sample": ["2016-01-01", "2021-12-31"], "crypto_holdout": ["2022-01-01", "9999-12-31"]},
        "equity10": equity_study(10, ("192607", "199912"), ("200001", "999912"), 10),
        "equity49": equity_study(49, ("192607", "199912"), ("200001", "999912"), 10),
    }
    if crypto:
        study["crypto"] = crypto_study(["BTC-USD", "ETH-USD"], ("2016-01-01", "2021-12-31"),
                                       ("2022-01-01", "9999-12-31"), 50)
    (out_dir / "study.json").write_text(json.dumps(study, indent=1, default=_jsonable))
    (out_dir / "REPORT.md").write_text(render_markdown(study))
    return study


def _jsonable(o):
    if isinstance(o, (np.floating, np.integer)):
        return o.item()
    if isinstance(o, np.ndarray):
        return o.tolist()
    if isinstance(o, set):
        return sorted(o)
    return str(o)


def _pct(x):
    return f"{100 * x:.1f}%"


def render_markdown(study: dict) -> str:
    L = ["# Agentic Trading Lab: study results", "",
         f"Generated {study['generated_utc']} by `python -m tradelab study`. Every number below is in "
         "`study.json` beside this file. Backtests are hypothetical: no money was traded, the industry "
         "portfolios are not directly investable, and past performance does not predict future results.", ""]
    for key, title in (("equity10", "US equities: 10 industry portfolios"),
                       ("equity49", "US equities: 49 industry portfolios")):
        e = study[key]
        L += [f"## {title}", "", f"Data: {e['source']}, {e['first']} to {e['last']}, monthly. "
              f"Costs {study['settings']['equity_cost_bps']} bps per unit of turnover.", "",
              "### Every default rule, whole sample (after a 36-month warm-up)", "",
              "| Rule | CAGR | Vol | Sharpe | Max DD | Turnover/yr |", "|---|---:|---:|---:|---:|---:|"]
        for k, s in e["full_sample"].items():
            L.append(f"| `{k}` | {_pct(s['cagr'])} | {_pct(s['vol'])} | {s['sharpe']:.2f} | "
                     f"{_pct(s['max_drawdown'])} | {s['turnover']:.1f} |")
        a = e["agent"]
        g = a["gate"]["checks"]
        L += ["", f"### Agent search: {a['n_trials']} trials on data up to 1999 "
              f"({a['in_sample']['periods']} scored months after warm-up), judged once on 2000 onward", "",
              f"- In-sample winner: `{a['winner_key']}`, Sharpe {a['in_sample']['sharpe']:.2f}.",
              f"- Deflated Sharpe Ratio {a['deflated_sharpe']['dsr']:.3f} (gate >= "
              f"{a['gate']['thresholds']['min_dsr']}): {'pass' if g['dsr'] else 'fail'}.",
              f"- Probability of backtest overfitting {a['pbo']['pbo']:.2f} over {a['pbo']['splits']} CSCV "
              f"splits (gate <= {a['gate']['thresholds']['max_pbo']}): {'pass' if g['pbo'] else 'fail'}.",
              f"- Holdout: Sharpe {a['holdout']['sharpe']:.2f}, CAGR {_pct(a['holdout']['cagr'])}, max drawdown "
              f"{_pct(a['holdout']['max_drawdown'])}. Equal weight over the same months: Sharpe "
              f"{a['holdout_equal_weight']['sharpe']:.2f}, CAGR {_pct(a['holdout_equal_weight']['cagr'])}, max "
              f"drawdown {_pct(a['holdout_equal_weight']['max_drawdown'])}.",
              f"- Alpha against equal weight on the holdout: {_pct(a['holdout_vs_equal_weight']['alpha_annual'])}"
              f"/yr, Newey-West t = {a['holdout_vs_equal_weight']['alpha_t']:.2f}, beta "
              f"{a['holdout_vs_equal_weight']['beta']:.2f}.",
              f"- Holdout Sharpe 95% interval (stationary bootstrap): winner "
              f"[{e['holdout_bootstrap']['winner']['sharpe_ci95'][0]:.2f}, "
              f"{e['holdout_bootstrap']['winner']['sharpe_ci95'][1]:.2f}], equal weight "
              f"[{e['holdout_bootstrap']['equal_weight']['sharpe_ci95'][0]:.2f}, "
              f"{e['holdout_bootstrap']['equal_weight']['sharpe_ci95'][1]:.2f}].",
              f"- **Promotable to paper trading: {'yes' if a['gate']['promotable'] else 'no'}.**", "",
              "### Holdout Sharpe by cost (bps per unit turnover)", "",
              "| Rule | 0 | 10 | 25 | 50 |", "|---|---:|---:|---:|---:|"]
        for k, row in e["cost_sweep_holdout"].items():
            L.append(f"| `{k}` | " + " | ".join(f"{row[c]:.2f}" for c in ("0", "10", "25", "50")) + " |")
        w = e["walk_forward"]
        L += ["", "### Walk-forward selection", "",
              f"Every 12 months from {w['from']}, pick the best of {w['candidates']} rules by trailing "
              f"(expanding-window) Sharpe and trade it for a year. {w['switches']} switches.", "",
              f"- Walk-forward: CAGR {_pct(w['summary']['cagr'])}, Sharpe {w['summary']['sharpe']:.2f}, "
              f"max drawdown {_pct(w['summary']['max_drawdown'])}.",
              f"- Equal weight, same months: CAGR {_pct(w['equal_weight_same_periods']['cagr'])}, Sharpe "
              f"{w['equal_weight_same_periods']['sharpe']:.2f}, max drawdown "
              f"{_pct(w['equal_weight_same_periods']['max_drawdown'])}.",
              "- Most often chosen: " + ", ".join(f"`{k}` ({n} yrs)" for k, n in w["most_chosen"]) + ".",
              "", "### Before and after publication", "",
              "| Rule | Published | Sharpe before | Sharpe after | Edge over 1/N before | Edge after |",
              "|---|---:|---:|---:|---:|---:|"]
        for k, p in e["publication"].items():
            L.append(f"| `{k}` | {p['published']} | {p['pre_sharpe']:.2f} | {p['post_sharpe']:.2f} | "
                     f"{p['pre_minus_ew']:+.2f} | {p['post_minus_ew']:+.2f} |")
        L.append("")
    if "crypto" in study:
        c = study["crypto"]
        a = c["agent"]
        L += ["## Crypto: BTC-USD and ETH-USD, daily", "",
              f"Data: {c['source']}, {c['first']} to {c['last']}. Costs {study['settings']['crypto_cost_bps']} "
              "bps per unit of turnover (Robinhood charges crypto through a spread; it varies). Cash earns "
              "zero here.", "",
              f"- {a['n_trials']} trials on 2016-2021; winner `{a['winner_key']}`, in-sample Sharpe "
              f"{a['in_sample']['sharpe']:.2f}.",
              f"- DSR {a['deflated_sharpe']['dsr']:.3f}, PBO {a['pbo']['pbo']:.2f}.",
              f"- Holdout (2022 on): Sharpe {a['holdout']['sharpe']:.2f}, CAGR {_pct(a['holdout']['cagr'])}, "
              f"max drawdown {_pct(a['holdout']['max_drawdown'])}; 50/50 rebalanced: Sharpe "
              f"{a['holdout_equal_weight']['sharpe']:.2f}, CAGR {_pct(a['holdout_equal_weight']['cagr'])}, max "
              f"drawdown {_pct(a['holdout_equal_weight']['max_drawdown'])}.",
              f"- Winner holdout Sharpe 95% interval: [{c['holdout_bootstrap_winner']['sharpe_ci95'][0]:.2f}, "
              f"{c['holdout_bootstrap_winner']['sharpe_ci95'][1]:.2f}].",
              f"- **Promotable: {'yes' if a['gate']['promotable'] else 'no'}.**", "",
              "| Rule | 0 | 25 | 50 | 100 | 150 |", "|---|---:|---:|---:|---:|---:|"]
        for k, row in c["cost_sweep_holdout"].items():
            L.append(f"| `{k}` | " + " | ".join(f"{row[x]:.2f}" for x in ("0", "25", "50", "100", "150")) + " |")
        L.append("")
    return "\n".join(L)
