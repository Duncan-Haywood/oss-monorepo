"""Milestone 6s: does the size-2 knee in omega move with H? Paired excess of rand-k over uncompressed at H = 16 for keep
1/4, 1/8, 1/16, 1/32 (omega 3, 7, 15, 31), scored against the hypotheses registered in LOG.md before the runs, then the
three forms (linear, power, hinge) fitted to the H = 16 cells and compared with the H = 64 hinge (6r: w0 7.75, slope 0.0057).
Reads scale.jsonl; no training. Usage: python3 knee16_6s.py"""
import json, math, os, random

HERE = os.path.dirname(os.path.abspath(__file__))
c = {}
for l in open(os.path.join(HERE, "scale.jsonl")):
    r = json.loads(l); c.setdefault((r["H"], round(r["keep"], 6)), {})[r["seed"]] = r["loss"]


def cells(H, keeps):
    out = []
    for k in keeps:
        d, b = c.get((H, round(k, 6)), {}), c[(H, 1.0)]
        s = sorted(set(d) & set(b)); x = [d[i] - b[i] for i in s]
        if len(x) < 2: print(f"H {H} omega {1/k-1:.0f}: fewer than 2 paired seeds, skipped"); continue
        mu = sum(x) / len(x); se = (sum((v - mu) ** 2 for v in x) / (len(x) - 1)) ** .5 / len(x) ** .5
        out.append((round(1 / k - 1), mu, se))
        print(f"H {H} omega {1/k-1:.0f}: seeds {s} excess {mu:+.4f} se {se:.4f} per-seed {[round(v, 4) for v in x]}")
    return out


GRID = {"linear": [0], "power": [0.5 + 0.25 * i for i in range(47)], "hinge": [0.25 * i for i in range(121)]}
f = lambda fm, p, w: w if fm == "linear" else w ** p if fm == "power" else max(0.0, w - p)


def fit(fm, pts):
    best = None
    for p in GRID[fm]:
        g = [f(fm, p, w) for w, _, _ in pts]
        den = sum(gi * gi / s ** 2 for gi, (_, _, s) in zip(g, pts))
        if den == 0: continue
        a = sum(gi * m / s ** 2 for gi, (_, m, s) in zip(g, pts)) / den
        chi = sum(((m - a * gi) / s) ** 2 for gi, (_, m, s) in zip(g, pts))
        if best is None or chi < best[0]: best = (chi, a, p)
    return best


def boot_w0(pts, n=4000, seed=0):
    rng = random.Random(seed); w = []
    for _ in range(n):
        q = [(o, rng.gauss(m, s), s) for o, m, s in pts]
        w.append(fit("hinge", q)[2])
    w.sort(); return w[int(.025 * n)], w[n // 2], w[int(.975 * n) - 1]


if __name__ == "__main__":
    h16 = cells(16, (0.25, 0.125, 0.0625, 1 / 32))
    h64 = cells(64, (0.25, 0.125, 1 / 12, 0.0625, 1 / 32))
    get = lambda pts, o: next((p for p in pts if p[0] == o), None)
    c7, c31, r31 = get(h16, 7), get(h16, 31), get(h64, 31)
    if c7 and c31:
        fin = math.isfinite(c31[1])
        d = c31[1] - r31[1]; sed = (c31[2] ** 2 + r31[2] ** 2) ** .5
        print(f"\nomega 31, H 16 minus H 64: {d:+.4f} (se {sed:.4f}, {d/sed:+.1f} se)")
        print(f"H6s-i  (H 16 omega 31 within +/-0.030 of H 64's {r31[1]:+.4f}): {'held' if fin and abs(d) <= 0.030 else 'refuted'}")
        print(f"H6s-ii (H 16 omega 7 within 2 se of zero): {'held' if abs(c7[1]) <= 2 * c7[2] else 'refuted'} ({c7[1]/c7[2]:+.1f} se)")
        if fin:
            print("\nH 16 four-cell fits (chi2, a, p):")
            for fm in GRID:
                chi, a, p = fit(fm, h16); print(f"  {fm:7s} chi2 {chi:7.2f} a {a:.6f} p {p:5.2f}")
            lo, mid, hi = boot_w0(h16); lo64, mid64, hi64 = boot_w0(h64)
            print(f"hinge w0 bootstrap 2.5/50/97.5: H 16 {lo}/{mid}/{hi}; H 64 {lo64}/{mid64}/{hi64}")
            print(f"H6s-iii (the two w0 intervals overlap): {'held' if lo <= hi64 and lo64 <= hi else 'refuted'}")
            chi, a, p = fit("hinge", [(o, m, s) for o, m, s in h16] + [(o, m, s) for o, m, s in h64])
            print(f"pooled nine-cell hinge (one w0, one slope for both H): chi2 {chi:.2f} on 7 dof, w0 {p}, slope {a:.5f}")
