#!/usr/bin/env python3
"""Run the decentralized-training-verification simulation and print a
results report: incentive compatibility, aggregate accuracy, manipulation
vulnerability vs. the Credibly Neutral AI Oracles eps(1-eps) bound, and
audit-cost savings vs. a Verde-style "recompute everything" baseline.

Usage:
    python experiments/run_experiment.py
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from verification_markets.metrics import (  # noqa: E402
    audit_cost_savings,
    average_payoff_by_strategy,
    average_trust_weight_by_strategy,
    incentive_compatibility_gap,
    majority_vote_error_rate,
    market_brier_score,
    non_honest_fraction,
    scoring_window_market_brier_scores,
    theoretical_manipulation_bound,
)
from verification_markets.simulation import SimulationConfig, run_simulation  # noqa: E402


def print_header(title: str) -> None:
    print()
    print(title)
    print("=" * len(title))


def main() -> None:
    base_config = SimulationConfig(
        n_tasks=2000,
        corruption_rate=0.15,
        signal_noise=0.1,
        n_honest=14,
        n_lazy=3,
        n_colluding=3,
        n_adversarial=2,
        market_liquidity=5.0,
        audit_fraction=0.05,
        seed=42,
    )
    result = run_simulation(base_config)

    print_header("Incentive compatibility (avg. payoff by strategy)")
    for mechanism_name, payoff in (("Peer Truth Serum", result.pts_payoff),
                                    ("Correlated Agreement", result.ca_payoff)):
        by_strategy = average_payoff_by_strategy(result, payoff)
        gap = incentive_compatibility_gap(by_strategy)
        print(f"\n{mechanism_name}:")
        for strategy, payoff_value in sorted(by_strategy.items()):
            print(f"  {strategy:>12}: {payoff_value:+.4f}")
        verdict = "OK, incentive-compatible" if gap > 0 else "NEGATIVE -- see README §Limitations"
        print(f"  honest advantage over best deviation: {gap:+.4f} ({verdict})")

    print_header("Aggregate accuracy")
    print(f"LMSR market Brier score (0=perfect, 0.25=uninformed): "
          f"{market_brier_score(result):.4f}")
    print(f"Majority-vote error rate: {majority_vote_error_rate(result):.4f}")

    print_header("Follow-up: reputation-weighted mechanisms "
                  "(closes README Limitations 1-3)")
    print(
        "Bootstraps a per-verifier trust weight from Peer Truth Serum payoffs\n"
        "measured on a held-out calibration window (the first "
        f"{result.config.calibration_fraction:.0%} of tasks), then uses it to\n"
        "(a) re-estimate the Correlated Agreement delta matrix from\n"
        "trust-weighted pairs and discount each payment by the payee's own\n"
        "weight, and (b) scale LMSR trade size -- all measured only on the\n"
        "disjoint scoring window, so nothing here reuses reports it used to\n"
        "estimate trust with."
    )
    trust_by_strategy = average_trust_weight_by_strategy(result)
    print("\nAverage calibration-window trust weight by strategy:")
    for strategy, weight in sorted(trust_by_strategy.items()):
        print(f"  {strategy:>12}: {weight:.4f}")

    print("\nCorrelated Agreement, scored on the held-out scoring window:")
    for label, payoff in (
        ("plain (same estimator as above, held-out window)", result.ca_scoring_payoff),
        ("trust-weighted", result.ca_trust_payoff),
    ):
        by_strategy = average_payoff_by_strategy(result, payoff)
        gap = incentive_compatibility_gap(by_strategy)
        verdict = "OK, incentive-compatible" if gap > 0 else "NEGATIVE"
        print(f"  {label}:")
        for strategy, payoff_value in sorted(by_strategy.items()):
            print(f"    {strategy:>12}: {payoff_value:+.4f}")
        print(f"    honest advantage over best deviation: {gap:+.4f} ({verdict})")

    scoring_brier = scoring_window_market_brier_scores(result)
    print("\nLMSR market Brier score on the scoring window:")
    print(f"  plain:           {scoring_brier['plain']:.4f}")
    print(f"  trust-weighted:  {scoring_brier['trust_weighted']:.4f}")

    print_header("Audit cost savings vs. full recomputation (Verde baseline)")
    print(f"Fraction of tasks NOT requiring ground-truth recomputation: "
          f"{audit_cost_savings(result):.1%}")

    print_header("Manipulation vulnerability sweep "
                  "(empirical majority-vote error vs. Credibly Neutral AI Oracles' eps(1-eps) bound)")
    print(f"{'non-honest frac (eps)':>24} | {'empirical error':>16} | {'eps*(1-eps) bound':>18}")
    print("-" * 64)
    sweep_points = [
        dict(n_honest=19, n_lazy=1, n_colluding=0, n_adversarial=0),
        dict(n_honest=16, n_lazy=2, n_colluding=1, n_adversarial=1),
        dict(n_honest=12, n_lazy=3, n_colluding=3, n_adversarial=2),
        dict(n_honest=8, n_lazy=4, n_colluding=4, n_adversarial=4),
        dict(n_honest=4, n_lazy=5, n_colluding=5, n_adversarial=6),
    ]
    for point in sweep_points:
        config = SimulationConfig(
            n_tasks=1200,
            corruption_rate=0.2,
            signal_noise=0.1,
            market_liquidity=5.0,
            seed=99,
            **point,
        )
        sweep_result = run_simulation(config)
        eps = non_honest_fraction(sweep_result)
        empirical_err = majority_vote_error_rate(sweep_result)
        bound = theoretical_manipulation_bound(eps)
        print(f"{eps:>24.2f} | {empirical_err:>16.4f} | {bound:>18.4f}")

    print_header("Trust-farming 'sleeper' adversary: frozen vs. rolling trust (5 seeds)")
    from verification_markets.adaptive import brier, defection_lag, rolling_trust_market  # noqa: E402

    print(f"{'block':>6} {'decay':>6} | {'frozen Brier':>12} | {'rolling Brier':>13} | mean lag (tasks)")
    for block_size, decay in ((100, 0.5), (50, 0.5), (25, 0.5), (25, 0.2)):
        frozen, rolling, lags = [], [], []
        for seed in range(1, 6):
            cfg = SimulationConfig(
                n_tasks=1500, n_honest=14, n_lazy=0, n_colluding=0,
                n_adversarial=0, n_sleeper=7, seed=seed,
            )
            r = run_simulation(cfg)
            frozen.append(scoring_window_market_brier_scores(r)["trust_weighted"])
            rr = rolling_trust_market(r, block_size, decay, seed)
            rolling.append(brier(rr.market_price, r, r.scoring_tasks))
            sid = next(v.id for v in r.verifiers if v.strategy == "sleeper")
            lags.append(defection_lag(rr, sid, r.scoring_tasks[0]))
        detected = [x for x in lags if x >= 0]
        lag = f"{sum(detected) / len(detected):.0f} ({len(detected)}/5 detected)" if detected else "never"
        print(f"{block_size:>6} {decay:>6.1f} | {sum(frozen)/5:>12.4f} | {sum(rolling)/5:>13.4f} | {lag}")

    print_header("Intermittent adversary: symmetric vs. asymmetric rolling trust (5 seeds)")
    print("12 honest + 10 intermittent (period 100, block 50). asym = decay 0.2 down / 0.9 up")
    print(f"{'defect frac':>11} | {'plain':>7} | {'frozen':>7} | {'sym roll':>8} | {'asym roll':>9} | honest-only sym / asym")
    for frac in (0.25, 0.5, 0.75):
        acc = {k: 0.0 for k in ("plain", "frozen", "sym", "asym", "h_sym", "h_asym")}
        for seed in range(1, 6):
            cfg = SimulationConfig(
                n_tasks=1500, n_honest=12, n_lazy=0, n_colluding=0, n_adversarial=0,
                n_intermittent=10, intermittent_period=100,
                intermittent_defect_fraction=frac, seed=seed,
            )
            r = run_simulation(cfg)
            sc = scoring_window_market_brier_scores(r)
            acc["plain"] += sc["plain"]
            acc["frozen"] += sc["trust_weighted"]
            acc["sym"] += brier(rolling_trust_market(r, 50, 0.5, seed).market_price, r, r.scoring_tasks)
            acc["asym"] += brier(
                rolling_trust_market(r, 50, 0.2, seed, recovery_decay=0.9).market_price, r, r.scoring_tasks)
            h = run_simulation(SimulationConfig(n_tasks=1500, n_honest=22, n_lazy=0, n_colluding=0,
                                                n_adversarial=0, seed=seed))
            acc["h_sym"] += brier(rolling_trust_market(h, 50, 0.5, seed).market_price, h, h.scoring_tasks)
            acc["h_asym"] += brier(
                rolling_trust_market(h, 50, 0.2, seed, recovery_decay=0.9).market_price, h, h.scoring_tasks)
        a = {k: v / 5 for k, v in acc.items()}
        print(f"{frac:>11.2f} | {a['plain']:>7.4f} | {a['frozen']:>7.4f} | {a['sym']:>8.4f} | "
              f"{a['asym']:>9.4f} | {a['h_sym']:.4f} / {a['h_asym']:.4f}")

    print_header("Stealth 'whitewash' adversary: averaged vs. minority-label trust (5 seeds)")
    from verification_markets.stealth import minority_trust_market  # noqa: E402

    print("14 honest + 8 whitewash; Brier on scoring window")
    print(f"{'lie prob':>8} | {'plain':>7} | {'avg-PTS trust':>13} | {'minority trust':>14} | {'fixed-b minority':>16}")
    for prob in (0.25, 0.5, 1.0):
        acc = [0.0] * 4
        for seed in range(1, 6):
            r = run_simulation(SimulationConfig(
                n_tasks=1500, n_honest=14, n_lazy=0, n_colluding=0, n_adversarial=0,
                n_whitewash=8, whitewash_prob=prob, seed=seed))
            sc = scoring_window_market_brier_scores(r)
            acc[0] += sc["plain"]
            acc[1] += sc["trust_weighted"]
            acc[2] += brier(minority_trust_market(r), r, r.scoring_tasks)
            acc[3] += brier(minority_trust_market(r, scale_liquidity=False), r, r.scoring_tasks)
        print(f"{prob:>8.2f} | " + " | ".join(f"{a / 5:>{w}.4f}" for a, w in zip(acc, (7, 13, 14, 16))))

    print_header("Sleeper+whitewash ('late_whitewash'): frozen vs. rolling minority trust (5 seeds)")
    from verification_markets.stealth import rolling_minority_trust_market  # noqa: E402

    print("14 honest + 8 late_whitewash; Brier on scoring window")
    print(f"{'lie prob':>8} | {'plain':>7} | {'frozen minority':>15} | {'rolling sym':>11} | {'rolling asym':>12}")
    for prob in (0.5, 1.0):
        acc = [0.0] * 4
        for seed in range(1, 6):
            r = run_simulation(SimulationConfig(
                n_tasks=1500, n_honest=14, n_lazy=0, n_colluding=0, n_adversarial=0,
                n_late_whitewash=8, whitewash_prob=prob, seed=seed))
            S = r.scoring_tasks
            acc[0] += brier(r.market_price_scoring, r, S)
            acc[1] += brier(minority_trust_market(r), r, S)
            acc[2] += brier(rolling_minority_trust_market(r, 100, 0.5), r, S)
            acc[3] += brier(rolling_minority_trust_market(r, 100, 0.5, recovery_decay=0.9), r, S)
        print(f"{prob:>8.2f} | " + " | ".join(f"{a / 5:>{w}.4f}" for a, w in zip(acc, (7, 15, 11, 12))))

    print_header("Intermittent whitewash: frozen vs. rolling minority trust (5 seeds)")
    print("14 honest + 8 intermittent_whitewash (lie prob 1.0); Brier on scoring window")
    print(f"{'defect':>6} {'period':>6} | {'plain':>7} | {'frozen':>7} | {'roll b100':>9} | {'roll b50':>8} | {'asym b100':>9}")
    for frac in (0.25, 0.5, 0.75):
        for period in (100, 300):
            acc = [0.0] * 5
            for seed in range(1, 6):
                r = run_simulation(SimulationConfig(
                    n_tasks=1500, n_honest=14, n_lazy=0, n_colluding=0, n_adversarial=0,
                    n_intermittent_whitewash=8, whitewash_prob=1.0,
                    intermittent_period=period, intermittent_defect_fraction=frac, seed=seed))
                S = r.scoring_tasks
                acc[0] += brier(r.market_price_scoring, r, S)
                acc[1] += brier(minority_trust_market(r), r, S)
                acc[2] += brier(rolling_minority_trust_market(r, 100, 0.5), r, S)
                acc[3] += brier(rolling_minority_trust_market(r, 50, 0.5), r, S)
                acc[4] += brier(rolling_minority_trust_market(r, 100, 0.2, recovery_decay=0.9), r, S)
            print(f"{frac:>6.2f} {period:>6} | " + " | ".join(f"{a / 5:>{w}.4f}" for a, w in zip(acc, (7, 7, 9, 8, 9))))

    print_header("Closed-loop (trust-observing) whitewash adversary vs. rolling minority trust (5 seeds)")
    from verification_markets import closed_loop as cl  # noqa: E402

    print("14 honest + 8 adaptive whitewashers, block 100, decay 0.5; scoring-window Brier")
    print(f"{'controller':>14} | {'lie rate':>8} | {'plain':>7} | {'rolling':>7} | {'missed fraud':>12} | {'adv weight':>10}")
    ctls = [
        ("fixed 0.25", lambda: cl.fixed(0.25)), ("fixed 0.50", lambda: cl.fixed(0.5)),
        ("fixed 1.00", lambda: cl.fixed(1.0)), ("threshold", lambda: cl.threshold()),
        ("proportional1", lambda: cl.proportional(1.0, 0.1)), ("proportional2", lambda: cl.proportional(2.0, 0.2)),
    ]
    for name, ctl in ctls:
        acc = [0.0] * 5
        for seed in range(1, 6):
            r = run_simulation(SimulationConfig(
                n_tasks=1500, n_honest=14, n_lazy=0, n_colluding=0, n_adversarial=0,
                n_late_whitewash=8, whitewash_prob=0.0, seed=seed))
            adv = [v.id for v in r.verifiers if v.strategy == "late_whitewash"]
            o = cl.run_closed_loop(r, adv, ctl, block_size=100, decay=0.5)
            S = r.scoring_tasks
            for k, x in enumerate((o.lie_rate, brier(o.plain_prices, r, S), brier(o.prices, r, S),
                                   o.missed_fraud, sum(o.adv_weight_history) / len(o.adv_weight_history))):
                acc[k] += x
        print(f"{name:>14} | " + " | ".join(f"{a / 5:>{w}.4f}" for a, w in zip(acc, (8, 7, 7, 12, 10))))


if __name__ == "__main__":
    main()
