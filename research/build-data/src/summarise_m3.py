"""Print the milestone 3 table (markdown) from results/boosted_*.json. Stdlib only."""
import glob, json, os
d = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results")
rows = [json.load(open(f)) for f in sorted(glob.glob(os.path.join(d, "boosted_*.json")))]
print("| city/target | year | n test | tau | baseline | boosted | rel diff | 95% block CI of diff | wins |")
print("|---|---|---|---|---|---|---|---|---|")
for r in sorted(rows, key=lambda r: (r["test_year"], r["city"], r["target"])):
    for t in ("0.1", "0.5", "0.9"):
        h = r["h1"][t]
        win = "yes" if h["hi"] < 0 else ("no (worse)" if h["lo"] > 0 else "tie")
        print(f"| {r['city']} {r['target']} | {r['test_year']} | {r['n_test']} | {t} | {r['baseline_pinball'][t]:.3f} | "
              f"{r['boosted_pinball'][t]:.3f} | {100*h['rel']:+.1f}% | [{h['lo']:+.3f}, {h['hi']:+.3f}] | {win} |")
print()
print("| city/target | year | cov80 boosted | Brier same-day: boosted / baseline / train-rate | same-day share test |")
print("|---|---|---|---|---|")
for r in sorted(rows, key=lambda r: (r["test_year"], r["city"], r["target"])):
    print(f"| {r['city']} {r['target']} | {r['test_year']} | {r['coverage_80']:.3f} | {r['brier_same_day_boosted']:.3f} / "
          f"{r['brier_same_day_baseline']:.3f} / {r['brier_same_day_constant_train_rate']:.3f} | {r['share_same_day_test']:.3f} |")
