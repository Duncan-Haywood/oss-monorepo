"""Neural-versus-boosted pinball over all test years, from results/*.json. Stdlib only.

Prints a markdown table (relative difference, % of boosted; positive = neural worse),
the count of cells within 3%, and the count where neural is ahead.
"""
import json, os
d = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results")
PAIRS = [("chicago", "a2i"), ("sf", "a2i"), ("sf", "i2c"), ("austin", "a2i"), ("austin", "i2c")]
QS = ("0.1", "0.5", "0.9")


def rel(neural, boosted):
    return 100.0 * (neural - boosted) / boosted


def collect(years=(2022, 2023, 2024)):
    cells = []
    for y in years:
        for c, t in PAIRS:
            n = json.load(open(os.path.join(d, f"neural_{c}_{t}_{y}.json")))["neural_pinball"]
            b = json.load(open(os.path.join(d, f"boosted_{c}_{t}_{y}.json")))["boosted_pinball"]
            cells.append((y, c, t, [rel(n[q], b[q]) for q in QS]))
    return cells


if __name__ == "__main__":
    cells = collect()
    print("| year | pair | q0.1 | q0.5 | q0.9 |")
    print("|---|---|---|---|---|")
    for y, c, t, r in cells:
        print(f"| {y} | {c} {t} | " + " | ".join(f"{x:+.1f}%" for x in r) + " |")
    flat = [(y, x) for y, _, _, r in cells for x in r]
    for y in (2022, 2023, 2024):
        xs = [x for yy, x in flat if yy == y]
        print(f"{y}: within 3%: {sum(abs(x) <= 3 for x in xs)}/{len(xs)}; neural ahead: {sum(x < 0 for x in xs)}/{len(xs)}")
    xs = [x for _, x in flat]
    print(f"all: within 3%: {sum(abs(x) <= 3 for x in xs)}/{len(xs)}; neural ahead: {sum(x < 0 for x in xs)}/{len(xs)}; "
          f"mean {sum(xs)/len(xs):+.2f}%")
