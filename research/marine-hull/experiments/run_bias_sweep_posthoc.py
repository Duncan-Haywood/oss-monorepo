"""Milestone 6zv post hoc (written after the predictions in run_bias_sweep.py were scored): is it the bias, not the years?

The two halves start from opposite realised biases (realised harvest / climatology 1.011 on T, 0.989 on R), so a
scale s on T and a scale about 0.02 lower on R give nearly the same effective plan optimism
(eff = s / realised ratio): T at s = 1.00, 1.01, 1.02, 1.03 (eff 0.989, 0.999, 1.009, 1.019) pairs with R at
s = 0.98, 0.99, 1.00, 1.01 (eff 0.991, 1.001, 1.011, 1.021). If what decides dominance is the effective bias and not
which five years are flown, the paired cells agree. This reads results_bias_sweep.txt; it reruns nothing.

Also: per rule and pack, the range of eff over which it dominates B, pooled over both halves.

Run (from research/marine-hull): python3 experiments/run_bias_sweep_posthoc.py > experiments/results_bias_sweep_posthoc.txt
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
LINE = re.compile(r"^\s+(T|R)\s+([\d.]+) ([\d.]+) ([\d.]+) \|\s+\d+\s+\d+ \|\s+([\d.]+)\s+([\d.]+) ([yn]) \|"
                  r"\s+([\d.]+)\s+([\d.]+) ([yn]) \|\s+([\d.]+)\s+([\d.]+) ([yn]) \|\s+(\d+) (\S+)$")
RULES = ("PS", "PSS", "default")
PAIRS = ((1.00, 0.98), (1.01, 0.99), (1.02, 1.00), (1.03, 1.01))


def parse(path=os.path.join(HERE, "results_bias_sweep.txt")):
    rows = {}
    with open(path) as f:
        for line in f:
            m = LINE.match(line)
            if not m:
                continue
            g = m.groups()
            half, c, s, eff = g[0], float(g[1]), round(float(g[2]), 2), float(g[3])
            rows[(half, c, s)] = {"eff": eff, "PS": g[6] == "y", "PSS": g[9] == "y", "default": g[12] == "y",
                                  "safe": int(g[13])}
    return rows


def main():
    rows = parse()
    packs = sorted({k[1] for k in rows})
    assert len(rows) == 56, len(rows)
    print("Milestone 6zv post hoc: paired cells at matched effective bias (T at s vs R at s - 0.02)")
    print("  C kWh  T s / R s  eff T / R    | PS  T R | PSS T R | dflt T R | safe tau T R")
    agree = {r: 0 for r in RULES + ("safe",)}
    near = 0
    n = 0
    for c in packs:
        for st, sr in PAIRS:
            a, b = rows[("T", c, st)], rows[("R", c, sr)]
            n += 1
            for r in RULES:
                agree[r] += a[r] == b[r]
            agree["safe"] += a["safe"] == b["safe"]
            steps = (0, 10, 20, 30, 60)
            near += abs(steps.index(a["safe"]) - steps.index(b["safe"])) <= 1
            yn = lambda x: "y" if x else "n"  # noqa: E731
            print(f"  {c:5.1f}  {st:.2f} / {sr:.2f}  {a['eff']:.3f} / {b['eff']:.3f} | "
                  f"{yn(a['PS'])}  {yn(b['PS'])}  |  {yn(a['PSS'])} {yn(b['PSS'])}  |  {yn(a['default'])} {yn(b['default'])}  | "
                  f"{a['safe']:3d} {b['safe']:3d}")
    print("  agreement over the 16 pairs: " + ", ".join(f"{r} {agree[r]}/{n}" for r in RULES) +
          f", longest safe tau equal {agree['safe']}/{n}, within one grid step {near}/{n}")

    print("\nEffective-bias range over which each rule dominates B (both halves pooled, 14 cells per pack)")
    for r in RULES:
        for c in packs:
            cs = sorted((v["eff"], v[r]) for (h, cc, s), v in rows.items() if cc == c)
            yes = [e for e, d in cs if d]
            # a "window" is contiguous if no failing cell lies strictly between the lowest and highest passing eff
            holes = [e for e, d in cs if not d and yes and min(yes) < e < max(yes)]
            rng = f"{min(yes):.3f} to {max(yes):.3f}" if yes else "none"
            print(f"  {r:7s} {c:4.1f} kWh: dominates at eff {rng} ({len(yes)} of 14 cells)"
                  f"{'; contiguous' if not holes else f'; fails inside at {holes}'}")

    print("\nLongest safe tau by effective bias (both halves pooled, all packs)")
    bands = ((0.0, 0.985), (0.985, 0.995), (0.995, 1.005), (1.005, 1.015), (1.015, 1.025), (1.025, 1.1))
    for lo, hi in bands:
        taus = sorted(v["safe"] for v in rows.values() if lo <= v["eff"] < hi)
        print(f"  eff [{lo:.3f}, {hi:.3f}): {len(taus):2d} cells, safe tau {taus}")


if __name__ == "__main__":
    main()
