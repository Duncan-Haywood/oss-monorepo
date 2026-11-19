"""Milestone 153: SWC(1) against SWC(1.25) blind at tt on milestone 152's fresh short add chains (flow run in run.py).

Usage: python3 analyse.py [out.txt]

Question: should the paper's clip alpha move from 1.25 to 1? Milestone 152 found SWC(1) lowest at ff on its 15 fresh designs
(5.57% against 7.18%), post hoc; milestone 151 found 1.25 the in-sample best on 118 tt cells. Here alpha = 1 and 1.25 are scored
on 13 designs that have never been run at tt, and each design's tt preference is paired with its ff one.

Rule and scoring (unchanged from milestones 151 and 152): SWC(alpha) routes the best 8 mapped points by
r2c(alpha) = mapped area x max(period, alpha x mapped delay) on the ladder branch (routed/r2 > theta = 3), else equal-cost random
routing. Per-design regrets from milestone 141's cell builder with milestone 151's widened alpha grid; tag "m153tt".
d(alpha) = SWC(alpha) - SWC(1.25), points, per design. Interval: design bootstrap of the mean (2,000 resamples, seed 153).
Sign test: two-sided exact binomial on non-tied designs. Spearman with average ranks.

Predictions, written here and committed (with run.py) before any point, baselines included, ran:
 (1) PRIMARY: on the fresh tt designs, mean d(1) >= 0, i.e. SWC(1.25) is at least as good as SWC(1). Prior 70%.
 (2) mean d(0) > 0 at tt (area-only worse than SWC(1.25); milestone 151: +8 points over 118 cells). Prior 80%.
 (3) SWC(1.25) has lower mean regret than equal-cost random routing at tt on these designs. Prior 75%.
 (4) at least 10 of the 13 designs are on the ladder branch at tt (routed/r2 > 3; all 15 were at ff). Prior 60%.
 (5) over these designs' 26 units (13 tt + the same 13 at ff from milestone 152), the in-sample best alpha in
     {0, 0.5, 0.8, 1, 1.25} is 1. Prior 40%.
 (6) the per-design d(0) at ff and at tt have a positive Spearman correlation over the 13 designs. Prior 50%.
 (7) pooled over every unit (77 + 15 ff, 118 + 13 tt), the in-sample best single alpha is 1.25. Prior 65%.
Reported, not predicted: the per-design table at both corners, tt baselines against ff, per-family means.
"""
import importlib.util
import json
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 153


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


m152 = _sibling(EXP / "addshort_ff" / "analyse.py", "verified_dse_m153_m152")
run = _sibling(HERE / "run.py", "verified_dse_m153_run")
ac = m152.ac
GRID, INCUMBENT, THETA = ac.GRID, ac.INCUMBENT, ac.THETA
TABLE = HERE / "results.jsonl"


def rows():
    return [json.loads(l) for l in TABLE.read_text().splitlines()] if TABLE.exists() else []


def tt_units():
    ac.units()  # widens every reachable ALPHAS
    meta = json.loads(run.META.read_text())
    rs = rows()
    done = run.complete(rs, meta["order"])
    if not done:
        return [], meta
    keep = [r for r in rs if r["design"] in set(done)]
    cc = ac.m148.m141.cells(keep, "addshort_tt", "m153tt")
    out = [{"corner": "tt", "fold": "m153", "design": f"m153:{x}", "name": x, "cell": cc[x]} for x in done]
    for u in out:
        assert not [a for a in GRID if a not in u["cell"]["clip"]], u["design"]
    return out, meta


def swc(u, a):
    return ac.swc(u["cell"], a)


def ranks(v):
    o = sorted(range(len(v)), key=lambda i: v[i])
    r = [0.0] * len(v)
    i = 0
    while i < len(o):
        j = i
        while j + 1 < len(o) and v[o[j + 1]] == v[o[i]]:
            j += 1
        for k in range(i, j + 1):
            r[o[k]] = (i + j) / 2
        i = j + 1
    return r


def spearman(x, y):
    rx, ry = ranks(x), ranks(y)
    mx, my = statistics.mean(rx), statistics.mean(ry)
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    den = (sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry)) ** 0.5
    return num / den if den else 0.0


def best(us):
    return min(GRID, key=lambda a: (round(ac.mean(us, a), 9), -a))


def main(dst):
    tu, meta = tt_units()
    ffm = json.loads((EXP / "addshort_ff" / "meta.json").read_text())
    out = ["# Milestone 153: SWC(1) against SWC(1.25) blind at tt_025C_1v80 on milestone 152's fresh short add chains (flow run)", "",
           f"theta = {THETA}; grid {', '.join(f'{a:g}' for a in GRID)}; bootstrap {m152.BOOT} resamples, seed {SEED}",
           f"tools: {meta['tools']}", f"liberty sha256: {meta['liberty_sha256']}", ""]
    out.append("design | clock | tt baseline no-wire period ns | ff baseline ns (milestone 152) | tt/ff")
    for d in run.ORDER:
        p, f = meta["base_period_ns"][d], ffm["base_period_ns"][d]
        out.append(f"{d} | {run.CLOCK[d]} | {'-' if p is None else f'{p:.3f}'} | {f:.3f} | "
                   f"{'-' if p is None else f'{p / f:.2f}'}")
    out += ["", f"complete designs (order prefix): {len(tu)} of {len(meta['order'])}"]
    if not tu:
        Path(dst).write_text("\n".join(out) + "\n")
        print("\n".join(out))
        return
    fu, _ = m152.fresh_units()
    ffby = {u["name"]: u for u in fu}
    out += ["", "## Per design at tt (regret %)", "",
            "design | routed/r2 | branch | random | " + " | ".join(f"SWC({a:g})" for a in GRID) + " | d(1) | d(0) | ff d(1) | ff d(0)"]
    for u in tu:
        c, f = u["cell"], ffby[u["name"]]
        out.append(f"{u['name']} | {c['ratio']:.2f} | {'ladder' if c['ratio'] > THETA else 'random'} | {c['rand']:.2f} | "
                   + " | ".join(f"{swc(u, a):.2f}" for a in GRID)
                   + f" | {swc(u, 1) - swc(u, INCUMBENT):+.2f} | {swc(u, 0) - swc(u, INCUMBENT):+.2f}"
                   + f" | {swc(f, 1) - swc(f, INCUMBENT):+.2f} | {swc(f, 0) - swc(f, INCUMBENT):+.2f}")
    n = len(tu)
    d1 = [swc(u, 1) - swc(u, INCUMBENT) for u in tu]
    d0 = [swc(u, 0) - swc(u, INCUMBENT) for u in tu]
    mr = statistics.mean(u["cell"]["rand"] for u in tu)
    out += ["", "## Fresh tt designs", "", "alpha | mean regret % | worst % (design)"]
    for a in GRID:
        w = max(tu, key=lambda u: swc(u, a))
        out.append(f"{a:g} | {ac.mean(tu, a):.2f} | {swc(w, a):.2f} ({w['name']})")
    out.append(f"random | {mr:.2f} |")
    b1, w1 = sum(x < -1e-9 for x in d1), sum(x > 1e-9 for x in d1)
    lo1, hi1 = m152.boot(d1, SEED)
    lo0, hi0 = m152.boot(d0, SEED)
    m125 = ac.mean(tu, INCUMBENT)
    nl = sum(u["cell"]["ratio"] > THETA for u in tu)
    out += ["",
            f"(1) PRIMARY mean d(1) = {statistics.mean(d1):+.2f} points (SWC(1) {ac.mean(tu, 1):.2f}% against SWC(1.25) "
            f"{m125:.2f}%), 95% interval {lo1:+.2f} to {hi1:+.2f}; SWC(1) better / worse / tied {b1} / {w1} / {n - b1 - w1} "
            f"(sign p = {m152.sign_p(b1, w1):.3f}): {'held' if statistics.mean(d1) >= 0 else 'refuted'}",
            f"(2) mean d(0) = {statistics.mean(d0):+.2f} points, 95% interval {lo0:+.2f} to {hi0:+.2f}: "
            f"{'held' if statistics.mean(d0) > 0 else 'refuted'}",
            f"(3) SWC(1.25) {m125:.2f}% against random {mr:.2f}%: {'held' if m125 < mr else 'refuted'}",
            f"(4) ladder branch at tt: {nl} of {n}: {'held' if nl >= 10 else 'refuted'}"]
    pair = tu + [ffby[u["name"]] for u in tu]
    bp = best(pair)
    out.append(f"(5) these designs at both corners ({len(pair)} units): "
               + ", ".join(f"{a:g} {ac.mean(pair, a):.2f}%" for a in GRID) + f"; best {bp:g}: {'held' if bp == 1 else 'refuted'}")
    f0 = [swc(ffby[u["name"]], 0) - swc(ffby[u["name"]], INCUMBENT) for u in tu]
    rho = spearman(f0, d0)
    out.append(f"(6) Spearman of d(0) at ff against tt over {n} designs: {rho:+.3f}: {'held' if rho > 0 else 'refuted'}")
    allu = ac.units() + fu + tu
    ba = best(allu)
    out.append(f"(7) every unit ({len(allu)}: ff {sum(u['corner'] == 'ff' for u in allu)}, tt {sum(u['corner'] == 'tt' for u in allu)}): "
               + ", ".join(f"{a:g} {ac.mean(allu, a):.2f}%" for a in GRID) + f"; best {ba:g}: "
               f"{'held' if ba == INCUMBENT else 'refuted'}")
    out += ["", "## Reported, not predicted", ""]
    for c in ("ff", "tt"):
        cu = [u for u in allu if u["corner"] == c]
        out.append(f"all {c} units ({len(cu)}): best alpha {best(cu):g}; " + ", ".join(f"{a:g} {ac.mean(cu, a):.2f}%" for a in GRID))
    fam = {}
    for u in tu:
        fam.setdefault(u["name"].rstrip("0123456789r").rstrip("0123456789"), []).append(swc(u, 1) - swc(u, INCUMBENT))
    out += ["", "family | designs | mean tt d(1) points"]
    out += [f"{k} | {len(v)} | {statistics.mean(v):+.2f}" for k, v in sorted(fam.items())]
    fd1 = [swc(ffby[u["name"]], 1) - swc(ffby[u["name"]], INCUMBENT) for u in tu]
    out.append("")
    out.append(f"Spearman of d(1) at ff against tt: {spearman(fd1, d1):+.3f}; these 13 at ff: SWC(1) "
               f"{statistics.mean(swc(ffby[u['name']], 1) for u in tu):.2f}% against SWC(1.25) "
               f"{statistics.mean(swc(ffby[u['name']], INCUMBENT) for u in tu):.2f}%")
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
