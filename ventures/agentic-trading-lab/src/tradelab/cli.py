"""Command line: python -m tradelab <command> (or `tradelab` once installed)."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import agent, backtest, data, stats
from .execution import brokers, planner, safety
from .strategies import REGISTRY, StrategySpec

DISCLAIMER = """\
No warranty. This software is provided free and as-is, without warranty of any
kind, express or implied. It is not investment, financial, legal or tax advice,
and it does not replace a qualified professional. Backtests are hypothetical,
are built on data that is not directly investable, and do not predict future
results. Trading can lose more than you expect, including all of the money in
the account. You are responsible for reviewing every signal and order before
relying on it. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use. This tool is for a person
trading their own account; it is not a fund and must not be used to manage
anyone else's money (see LEGAL.md).
"""


def _universe(name: str) -> data.Panel:
    if name == "ind10":
        return data.french_industries(10)
    if name == "ind49":
        return data.french_industries(49)
    if name == "market":
        return data.french_market()
    if name.startswith("crypto:"):
        return data.coinbase_daily(name.split(":", 1)[1].split(","))
    raise SystemExit(f"unknown universe {name!r}: use ind10, ind49, market or crypto:BTC-USD,ETH-USD")


def _params(pairs: list[str]) -> dict:
    out = {}
    for p in pairs or []:
        k, v = p.split("=", 1)
        try:
            out[k] = json.loads(v)
        except json.JSONDecodeError:
            out[k] = v
    return out


def _spec(args) -> StrategySpec:
    if getattr(args, "report", None):
        rep = json.loads(Path(args.report).read_text())
        return StrategySpec.from_dict(rep["winner"])
    return StrategySpec.make(args.strategy, vol_target=args.vol_target, **_params(args.param))


def cmd_backtest(args) -> int:
    panel = _universe(args.universe).slice(args.start, args.end)
    spec = _spec(args)
    warm = args.warmup if args.warmup is not None else (200 if panel.periods_per_year > 12 else 36)
    res = backtest.run(panel, spec, cost_bps=args.cost, warmup=warm)
    s = stats.summary(res.returns, res.rf, res.periods_per_year)
    s.update(stats.stationary_bootstrap_sharpe(res.excess, res.periods_per_year, n_boot=500))
    s["psr"] = stats.probabilistic_sharpe(res.excess)
    s["turnover_per_year"] = res.annual_turnover()
    s["cost_drag_per_year"] = res.cost_drag()
    print(json.dumps({"spec": spec.key(), "from": res.labels[0], "to": res.labels[-1], **s}, indent=1))
    return 0


def cmd_research(args) -> int:
    panel = _universe(args.universe)
    proposer = agent.ClaudeProposer() if args.proposer == "claude" else agent.GridProposer()
    warm = 200 if panel.periods_per_year > 12 else 36
    st = agent.research(panel, (args.is_start, args.is_end), (args.ho_start, args.ho_end), proposer=proposer,
                        budget=args.budget, cost_bps=args.cost, warmup=warm)
    rep = {**st.report, "universe": args.universe, "trials": [
        {"spec": t.spec.key(), "is_sharpe": t.is_sharpe, "proposer": t.proposer} for t in st.trials]}
    text = json.dumps(rep, indent=1, default=str)
    if args.out:
        Path(args.out).write_text(text)
    a = st.report
    print(f"{a['n_trials']} trials. Winner {a['winner_key']}: in-sample Sharpe {a['in_sample']['sharpe']:.2f}, "
          f"DSR {a['deflated_sharpe']['dsr']:.3f}, PBO {a['pbo']['pbo']:.2f}, holdout Sharpe "
          f"{a['holdout']['sharpe']:.2f} (equal weight {a['holdout_equal_weight']['sharpe']:.2f}). "
          f"Promotable: {a['gate']['promotable']}." + (f" Report: {args.out}" if args.out else ""))
    return 0


def current_targets(panel: data.Panel, spec: StrategySpec) -> dict[str, float]:
    """Target weights for the next period, from all data up to the latest one.
    The volatility overlay is applied the same way the backtest applies it."""
    warm = 200 if panel.periods_per_year > 12 else 36
    res = backtest.run(panel, spec, warmup=min(warm, len(panel.labels) - 2))
    # Weights the strategy would set using every period including the last.
    fn = REGISTRY[spec.name]
    base = fn(panel.returns, panel.rf, {**spec.param_dict, "periods_per_year": panel.periods_per_year})
    scale = 1.0
    if spec.vol_target and len(res.gross) >= 12:
        import math
        import numpy as np
        realised = float(np.std(res.gross[-12:], ddof=1)) * math.sqrt(panel.periods_per_year)
        scale = spec.vol_target / realised if realised > 1e-9 else 1.0
    w = {a: float(x) * scale for a, x in zip(panel.assets, base)}
    gross = sum(abs(x) for x in w.values())
    if gross > spec.max_leverage:
        w = {a: x * spec.max_leverage / gross for a, x in w.items()}
    return {a: x for a, x in w.items() if abs(x) > 1e-9}


def cmd_signal(args) -> int:
    panel = _universe(args.universe)
    spec = _spec(args)
    w = current_targets(panel, spec)
    mapped = planner.map_weights(w, planner.INDUSTRY10_TO_ETF) if args.universe == "ind10" else w
    print(json.dumps({"spec": spec.key(), "data_through": panel.labels[-1], "weights": w,
                      "symbols": mapped, "cash": 1 - sum(mapped.values())}, indent=1))
    return 0


def cmd_rebalance(args) -> int:
    print(DISCLAIMER, file=sys.stderr)
    report = json.loads(Path(args.report).read_text()) if args.report else None
    panel = _universe(args.universe)
    spec = _spec(args)
    w = current_targets(panel, spec)
    target = planner.map_weights(w, planner.INDUSTRY10_TO_ETF) if args.universe == "ind10" else w
    limits = safety.Limits(max_order_notional=args.max_order, max_orders_per_run=args.max_orders,
                           max_weight_per_symbol=args.max_weight)
    errs = safety.check_targets(target, limits)
    if errs:
        print("refused, targets break limits:\n  " + "\n  ".join(errs), file=sys.stderr)
        return 2
    try:
        safety.assert_live_allowed(args.live, report, args.allow_unpromoted)
    except safety.LiveTradingRefused as e:
        print(str(e), file=sys.stderr)
        return 3
    if args.broker == "paper":
        broker = brokers.PaperBroker(args.paper_state, cash=args.paper_cash)
        broker.set_prices(json.loads(Path(args.prices).read_text()) if args.prices else {s: 100.0 for s in target})
    elif args.broker == "alpaca":
        broker = brokers.AlpacaBroker(live=args.live)
    elif args.broker == "robinhood-crypto":
        if not args.live and args.execute:
            print("Robinhood's Crypto Trading API has no paper mode: --execute there needs --live.", file=sys.stderr)
            return 3
        broker = brokers.RobinhoodCryptoBroker()
    else:
        raise SystemExit(f"unknown broker {args.broker}")
    syms = sorted(set(target) | set(broker.positions()))
    prices = broker.prices(syms)
    orders = planner.plan_orders(target, broker.equity(), broker.positions(), prices)
    verdict = safety.check_orders(orders, limits)
    print(json.dumps({"spec": spec.key(), "data_through": panel.labels[-1], "broker": broker.name,
                      "live": bool(args.live), "targets": target,
                      "orders": [o.__dict__ for o in verdict.accepted],
                      "rejected": [{**o.__dict__, "why": why} for o, why in verdict.rejected]}, indent=1))
    if not args.execute:
        print("dry run: nothing sent. Add --execute to send these orders.", file=sys.stderr)
        return 0
    for o in verdict.accepted:
        print(json.dumps(broker.submit(o), default=str))
    return 0


def cmd_study(args) -> int:
    from .report import run_study
    run_study(Path(args.out), crypto=not args.no_crypto)
    print(f"wrote {args.out}/study.json and {args.out}/REPORT.md")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="tradelab", description="Backtest, research and (carefully) trade rules-based "
                                "strategies on your own account.", epilog=DISCLAIMER,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    def strat(sp):
        sp.add_argument("--universe", default="ind10", help="ind10, ind49, market, or crypto:BTC-USD,ETH-USD")
        sp.add_argument("--strategy", default="dual_momentum", choices=sorted(REGISTRY))
        sp.add_argument("--param", action="append", help="k=v, repeatable (e.g. lookback=12)")
        sp.add_argument("--vol-target", type=float, default=None, help="annualised portfolio vol target overlay")
        sp.add_argument("--report", help="use the winner from a research report instead of --strategy")

    b = sub.add_parser("backtest", help="backtest one strategy")
    strat(b)
    b.add_argument("--cost", type=float, default=10.0, help="bps per unit turnover")
    b.add_argument("--start")
    b.add_argument("--end")
    b.add_argument("--warmup", type=int)
    b.set_defaults(fn=cmd_backtest)

    r = sub.add_parser("research", help="agent search with overfitting controls and a holdout")
    r.add_argument("--universe", default="ind10")
    r.add_argument("--proposer", choices=["grid", "claude"], default="grid",
                   help="claude needs your own ANTHROPIC_API_KEY")
    r.add_argument("--budget", type=int, default=200)
    r.add_argument("--cost", type=float, default=10.0)
    r.add_argument("--is-start", default="192607")
    r.add_argument("--is-end", default="199912")
    r.add_argument("--ho-start", default="200001")
    r.add_argument("--ho-end", default="999912")
    r.add_argument("--out", help="write the full report JSON here")
    r.set_defaults(fn=cmd_research)

    s = sub.add_parser("signal", help="today's target weights")
    strat(s)
    s.set_defaults(fn=cmd_signal)

    rb = sub.add_parser("rebalance", help="plan (and optionally send) orders; dry run by default")
    strat(rb)
    rb.add_argument("--broker", choices=["paper", "alpaca", "robinhood-crypto"], default="paper")
    rb.add_argument("--execute", action="store_true", help="send the orders (paper unless --live)")
    rb.add_argument("--live", action="store_true", help="real money; also needs TRADELAB_LIVE_CONFIRM")
    rb.add_argument("--allow-unpromoted", action="store_true")
    rb.add_argument("--max-order", type=float, default=1000.0)
    rb.add_argument("--max-orders", type=int, default=20)
    rb.add_argument("--max-weight", type=float, default=0.5)
    rb.add_argument("--paper-state", default="paper-state.json")
    rb.add_argument("--paper-cash", type=float, default=10_000.0)
    rb.add_argument("--prices", help="JSON file of symbol -> price for the paper broker")
    rb.set_defaults(fn=cmd_rebalance)

    st = sub.add_parser("study", help="rerun the full published study")
    st.add_argument("--out", default="results")
    st.add_argument("--no-crypto", action="store_true")
    st.set_defaults(fn=cmd_study)
    return p


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    return args.fn(args)
