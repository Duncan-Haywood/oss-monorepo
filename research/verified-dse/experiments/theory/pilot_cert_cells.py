"""Why the chance of a pilot ceiling plateaus near 0.45 (milestone 100). Runs no flow.
Writes pilot_cert_cells_results.txt. Usage: python3 pilot_cert_cells.py

Milestone 99 saw the share of pilots with a ceiling flatten (0.422 / 0.440 / 0.448 at m = 24 / 32 / 40) and guessed the cause was the
cells with few or no certified points (ratio < 1), without counting them. This counts them. For a cell with n points of which c are
certified, a pilot of m points drawn without replacement holds none with probability C(n-c, m)/C(n, m), so the share with a ceiling
is exactly 1 - that, averaged over cells. No sampling is involved.
Predictions written before running: (1) the exact share matches milestone 99's simulated share to within Monte Carlo error (0.005) at
every m; (2) at least a quarter of the cells have c = 0, so no pilot can ever yield a ceiling there; (3) the plateau is explained by
the cells: the share of cells with c >= 1 is within 0.1 above the m = 40 value."""
import json
import sys
from collections import defaultdict
from math import comb
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import flow  # noqa: E402
from pilot_rho import ratio, ETA  # noqa: E402

SIZES = (4, 8, 12, 16, 24, 32, 40)


def cells(by):
    out = []
    for tag in ("tight", "relaxed"):
        for d in flow.DESIGNS:
            sc = by[(tag, d)]
            n = len(sc)
            s = {g: [p[g] for p in sc] for g in ("r1", "r2", "r3")}
            keep = [max(1, n // ETA), max(1, n // ETA ** 2), max(1, n // ETA ** 3)]
            for rungs, kp in ((("r1", "r2", "r3"), keep), (("r2", "r3"), keep[:2])):
                c = sum(ratio(s, rungs, kp, i, n) < 1 for i in range(n))
                out.append((tag, d, len(rungs), n, c))
    return out


def share(cs, m):
    return sum(1 - comb(n - c, m) / comb(n, m) if m <= n - c else 1.0 for *_, n, c in cs) / len(cs)


if __name__ == "__main__":
    rows = [json.loads(l) for l in (HERE.parent / "rung_bias" / "results.jsonl").read_text().splitlines()]
    by = defaultdict(list)
    for r in rows:
        if r["status"] == "ok":
            by[(r["tag"], r["design"])].append(flow.scores(r))
    cs = cells(by)
    sim = {int(l.split(" | ")[0]): float(l.split(" | ")[3]) for l in (HERE / "pilot_cert_size_results.txt").read_text().splitlines()[1:]}
    out = [f"cells: {len(cs)}; with c = 0: {sum(c == 0 for *_, c in cs)}; with c >= 1: {sum(c >= 1 for *_, c in cs)}; share with c >= 1: {sum(c >= 1 for *_, c in cs) / len(cs):.3f}",
           "cell (tag, design, rungs, n, certified c)"]
    out += [f"{t} {d} r{k} n={n} c={c}" for t, d, k, n, c in cs]
    out.append("m | exact share with a ceiling | simulated (milestone 99) | difference")
    for m in SIZES:
        e = share(cs, m)
        out.append(f"{m} | {e:.4f} | {sim[m]:.3f} | {e - sim[m]:+.4f}")
    (HERE / "pilot_cert_cells_results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))
