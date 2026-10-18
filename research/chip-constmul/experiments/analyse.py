"""Summarise results.txt (stdlib only); prints the tables quoted in the README.   python experiments/analyse.py"""
from pathlib import Path
from statistics import mean

HERE = Path(__file__).resolve().parent


def load(path=HERE / "results.txt"):
    rows = []
    for line in Path(path).read_text().splitlines()[1:]:
        a, o, b, c, e = [s.split() for s in line.split("|")]
        k, pc, nd = map(int, a)
        rows.append(dict(k=k, pc=pc, nd=nd, op=tuple(map(int, o)), bin=tuple(map(int, b)), csd=tuple(map(int, c)), eq=int(e[0])))
    return rows


def pearson(x, y):
    mx, my = mean(x), mean(y)
    sx = sum((a - mx) ** 2 for a in x) ** .5
    sy = sum((b - my) ** 2 for b in y) ** .5
    return sum((a - mx) * (b - my) for a, b in zip(x, y)) / (sx * sy)


def main():
    R = load()
    print("constants", len(R), "all equivalent", all(r["eq"] for r in R))
    for f in ("op", "bin", "csd"):
        print(f, "mean cells %.1f mean depth %.1f" % (mean(r[f][0] for r in R), mean(r[f][1] for r in R)))
    for a, b in (("csd", "op"), ("csd", "bin"), ("bin", "op")):
        w = sum(r[a][0] < r[b][0] for r in R)
        t = sum(r[a][0] == r[b][0] for r in R)
        print(f"cells {a} < {b}: {w}  tie: {t}  worse: {len(R) - w - t}")
    print("pearson cells vs binary popcount (op):", round(pearson([r["pc"] for r in R], [r["op"][0] for r in R]), 3))
    print("pearson cells vs csd digits (op):", round(pearson([r["nd"] for r in R], [r["op"][0] for r in R]), 3))
    print("by csd digit count: n, mean cells op/bin/csd, mean depth op/bin/csd")
    for n in sorted({r["nd"] for r in R}):
        s = [r for r in R if r["nd"] == n]
        print(n, len(s), *("%.1f" % mean(r[f][0] for r in s) for f in ("op", "bin", "csd")),
              *("%.1f" % mean(r[f][1] for r in s) for f in ("op", "bin", "csd")))
    print("per-K best of bin/csd: mean cells %.1f (op %.1f); K where bin < csd: %d" % (
        mean(min(r["bin"][0], r["csd"][0]) for r in R), mean(r["op"][0] for r in R), sum(r["bin"][0] < r["csd"][0] for r in R)))
    print("mean cells saving csd vs op: %.1f%%" % (100 * (1 - sum(r["csd"][0] for r in R) / sum(r["op"][0] for r in R))))
    best = sorted(R, key=lambda r: r["csd"][0] - r["op"][0])[:3]
    worst = sorted(R, key=lambda r: r["op"][0] - r["csd"][0])[:3]
    print("largest csd saving vs op (k, op cells, csd cells):", [(r["k"], r["op"][0], r["csd"][0]) for r in best])
    print("largest csd loss vs op:", [(r["k"], r["op"][0], r["csd"][0]) for r in worst])


if __name__ == "__main__":
    main()
