"""Milestone 154: why the clipped ladder's edge over random routing is thinner at ff than at tt on short add chains. A paired
replay on the 13 designs that ran at both corners (milestone 152 at ff_n40C_1v95, milestone 153 at tt_025C_1v80), same 120 pass
sequences, same relative clock. No flow run.

Usage: python3 analyse.py [out.txt]

Why: milestones 152 and 153's "Next". On the 15 fresh short add chains SWC(1.25) beat equal-cost random routing by 1.05 points at
ff (7.18% against 8.23%), and on 13 of them at tt by 1.50 (1.69% against 3.19%). Milestone 134 found, at tt, that where the ladder
fails mapped delay carries no rank information about routed delay while mapped area ranks routed area almost exactly. A fast corner
shrinks cell delay against unchanged wire parasitics, so the mapped (no-wire) delay should say less about the routed delay there.
This milestone tests that account on designs where the corner is the only thing that changes.

Disclosed before this script ran: the corner-level means above (from milestones 152 and 153's results.txt) were read; no per-point
rank statistic, tau-b or recall below had been computed for these designs at either corner.

Units: the 13 designs of milestone 153 (tt), each paired with its milestone-152 ff run. Points: status "ok" rows of each run. For
paired statistics over points, only sequences ok at both corners are used.
Quantities per design and corner, over its ok points:
  tau     Kendall tau-b of r2c(1.25) = mapped area x max(period, 1.25 x mapped delay) against routed score r4 = routed area x routed
          delay (routed delay = period - final_wns), the ladder's ranking key against what it is scored on;
  tauA    tau-b of mapped area (synth_netlist_area) against routed area (final_area_notap);
  tauD    tau-b of mapped delay (period - synth_netlist_wns) against routed delay;
  rank    the r2c(1.25) rank of the routed-best point as a share of the pool (average rank for ties, 0 = top, / (n - 1));
  d       SWC(1.25) - random regret (points; from the published cells, unchanged).
Paired difference: ff minus tt. Interval: design bootstrap of the mean paired difference (2,000 resamples, seed 154). Sign test:
two-sided exact binomial on untied designs. Spearman with average ranks.

Predictions, written here and committed before the script first ran:
 (1) PRIMARY: mean paired tau(ff) - tau(tt) < 0 and its 95% interval excludes 0 (the ladder's key ranks routing worse at ff).
     Prior 50%.
 (2) mean paired tauD(ff) - tauD(tt) < 0 (mapped delay loses rank information about routed delay at ff). Prior 65%.
 (3) |mean paired tauA(ff) - tauA(tt)| < 0.10 (mapped area ranks routed area about as well at both corners). Prior 65%.
 (4) mean paired d(ff) - d(tt) > 0 (SWC's edge over random is smaller at ff on these 13). Prior 70%.
 (5) over the 26 units, Spearman of tau against d is negative (better rank information, larger edge). Prior 60%.
 (6) median paired rank(ff) - rank(tt) > 0 (the routed-best point sits lower in the ladder's ordering at ff). Prior 55%.
 (7) mean random regret at ff exceeds mean random regret at tt on these 13. Prior 70%.
Reported, not predicted: the per-design table, the share of the routed score's log-variance carried by routed delay at each corner,
and the tau-b of the routed score between corners over common sequences.
"""
import importlib.util
import math
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 154
BOOT = 2000
ALPHA = 1.25


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


m153 = _sibling(EXP / "addshort_tt" / "analyse.py", "verified_dse_m154_m153")
m152 = m153.m152
tau_b = _sibling(EXP / "ladder_diagnosis" / "analyse.py", "verified_dse_m154_diag").tau_b


def r2c(r):
    p = r["period_ns"]
    return r["synth_netlist_area"] * max(p, ALPHA * (p - r["synth_netlist_wns"]))


def r4(r):
    return r["final_area_notap"] * (r["period_ns"] - r["final_wns"])


def mdelay(r):
    return r["period_ns"] - r["synth_netlist_wns"]


def rdelay(r):
    return r["period_ns"] - r["final_wns"]


def avg_ranks(v):
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


def best_rank(rs):
    """Share-of-pool rank of the routed-best point(s) in the r2c ordering (mean over tied routed-best points)."""
    rk = avg_ranks([r2c(r) for r in rs])
    y = [r4(r) for r in rs]
    lo = min(y)
    return statistics.mean(rk[i] for i in range(len(rs)) if y[i] == lo) / (len(rs) - 1)


def delay_share(rs):
    """Share of var(log r4) carried by log routed delay: (var(logD) + cov(logA, logD)) / var(log r4)."""
    la = [math.log(r["final_area_notap"]) for r in rs]
    ld = [math.log(rdelay(r)) for r in rs]
    ly = [a + b for a, b in zip(la, ld)]
    vy = statistics.pvariance(ly)
    if vy == 0:
        return float("nan")
    ma, md = statistics.mean(la), statistics.mean(ld)
    cov = statistics.mean((a - ma) * (b - md) for a, b in zip(la, ld))
    return (statistics.pvariance(ld) + cov) / vy


def stats_of(rs):
    return {"n": len(rs),
            "tau": tau_b([r2c(r) for r in rs], [r4(r) for r in rs]),
            "tauA": tau_b([r["synth_netlist_area"] for r in rs], [r["final_area_notap"] for r in rs]),
            "tauD": tau_b([mdelay(r) for r in rs], [rdelay(r) for r in rs]),
            "rank": best_rank(rs),
            "dshare": delay_share(rs)}


def boot(v, seed=SEED, n=BOOT):
    rng = random.Random(seed)
    v = list(v)
    ms = sorted(statistics.mean(rng.choice(v) for _ in v) for _ in range(n))
    return ms[int(0.025 * n)], ms[int(0.975 * n) - 1]


def sign_p(b, w):
    n, k = b + w, min(b, w)
    if n == 0:
        return 1.0
    return min(1.0, 2 * sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n)


def spearman(x, y):
    return m153.spearman(x, y)


def paired():
    """[{name, tt, ff}] with per-corner stats over common ok sequences, plus d and random regret from the published cells."""
    tu, _ = m153.tt_units()
    fu, _ = m152.fresh_units()
    ffby = {u["name"]: u for u in fu}
    ttrows = [r for r in m153.rows() if r["status"] == "ok"]
    out = []
    for u in tu:
        x, f = u["name"], ffby[u["name"]]
        a = {tuple(r["seq"]): r for r in ttrows if r["design"] == x}
        b = {tuple(r["seq"]): r for r in f["rows"]}
        common = sorted(set(a) & set(b))
        ra, rb = [a[s] for s in common], [b[s] for s in common]
        st, sf = stats_of(ra), stats_of(rb)
        for s, c in ((st, u["cell"]), (sf, f["cell"])):
            s["d"] = m153.swc({"cell": c}, ALPHA) - c["rand"]
            s["rand"] = c["rand"]
            s["swc"] = m153.swc({"cell": c}, ALPHA)
        cross = tau_b([r4(r) for r in ra], [r4(r) for r in rb])
        out.append({"name": x, "tt": st, "ff": sf, "common": len(common), "cross": cross})
    return out


def main(dst):
    ps = paired()
    out = ["# Milestone 154: the clipped ladder's rank information at ff against tt on 13 paired short add chains (replay)", "",
           f"alpha = {ALPHA}; bootstrap {BOOT} resamples, seed {SEED}; points = sequences ok at both corners", "",
           "design | common points | tau tt | tau ff | tauA tt | tauA ff | tauD tt | tauD ff | rank tt | rank ff | d tt | d ff | "
           "delay share tt | delay share ff | tau-b r4 tt vs ff"]
    for p in ps:
        t, f = p["tt"], p["ff"]
        out.append(f"{p['name']} | {p['common']} | {t['tau']:.3f} | {f['tau']:.3f} | {t['tauA']:.3f} | {f['tauA']:.3f} | "
                   f"{t['tauD']:.3f} | {f['tauD']:.3f} | {t['rank']:.3f} | {f['rank']:.3f} | {t['d']:+.2f} | {f['d']:+.2f} | "
                   f"{t['dshare']:.2f} | {f['dshare']:.2f} | {p['cross']:.3f}")
    n = len(ps)

    def diff(k):
        return [p["ff"][k] - p["tt"][k] for p in ps]

    out += ["", "quantity | mean tt | mean ff | mean ff - tt | 95% interval | ff higher / lower / tied (sign p)"]
    summ = {}
    for k in ("tau", "tauA", "tauD", "rank", "d", "rand", "swc", "dshare"):
        v = diff(k)
        lo, hi = boot(v)
        h, l = sum(x > 1e-9 for x in v), sum(x < -1e-9 for x in v)
        summ[k] = (statistics.mean(v), lo, hi, statistics.median(v))
        out.append(f"{k} | {statistics.mean(p['tt'][k] for p in ps):.3f} | {statistics.mean(p['ff'][k] for p in ps):.3f} | "
                   f"{statistics.mean(v):+.3f} | {lo:+.3f} to {hi:+.3f} | {h} / {l} / {n - h - l} ({sign_p(h, l):.3f})")
    m, lo, hi, _ = summ["tau"]
    out += ["", f"(1) PRIMARY mean tau(ff) - tau(tt) = {m:+.3f}, interval {lo:+.3f} to {hi:+.3f}: "
            f"{'held' if m < 0 and hi < 0 else 'refuted'}"]
    out.append(f"(2) mean tauD(ff) - tauD(tt) = {summ['tauD'][0]:+.3f}: {'held' if summ['tauD'][0] < 0 else 'refuted'}")
    out.append(f"(3) |mean tauA(ff) - tauA(tt)| = {abs(summ['tauA'][0]):.3f}: {'held' if abs(summ['tauA'][0]) < 0.10 else 'refuted'}")
    out.append(f"(4) mean d(ff) - d(tt) = {summ['d'][0]:+.2f} points: {'held' if summ['d'][0] > 0 else 'refuted'}")
    units = [p[c] for p in ps for c in ("tt", "ff")]
    rho = spearman([u["tau"] for u in units], [u["d"] for u in units])
    out.append(f"(5) Spearman of tau against d over {len(units)} units: {rho:+.3f}: {'held' if rho < 0 else 'refuted'}")
    out.append(f"(6) median rank(ff) - rank(tt) = {summ['rank'][3]:+.3f}: {'held' if summ['rank'][3] > 0 else 'refuted'}")
    out.append(f"(7) mean random regret ff {statistics.mean(p['ff']['rand'] for p in ps):.2f}% against tt "
               f"{statistics.mean(p['tt']['rand'] for p in ps):.2f}%: {'held' if summ['rand'][0] > 0 else 'refuted'}")
    out += ["", "## Reported, not predicted", "",
            f"median tau-b of routed score between corners (common sequences): {statistics.median(p['cross'] for p in ps):.3f}",
            f"Spearman of tauD against d over {len(units)} units: {spearman([u['tauD'] for u in units], [u['d'] for u in units]):+.3f}",
            f"Spearman of tauA against d over {len(units)} units: {spearman([u['tauA'] for u in units], [u['d'] for u in units]):+.3f}"]
    out += ["", "## Post hoc: SWC(1.25) against equal-cost random by unit set (added after the first run, for the paper's corner table)", "",
            "set | units | SWC % | random % | SWC better / worse / tied | sign p"]
    fu, _ = m152.fresh_units()
    tu, _ = m153.tt_units()
    pair13 = {p["name"] for p in ps}
    for label, us in (("ff milestones 144 to 147 (milestone 148's pool)", [u for u in m153.ac.units() if u["corner"] == "ff"]),
                      ("ff milestone 152, all fresh", fu),
                      ("ff milestone 152, the 13 paired", [u for u in fu if u["name"] in pair13]),
                      ("tt milestone 153, the 13 paired", tu)):
        dd = [m153.swc(u, ALPHA) - u["cell"]["rand"] for u in us]
        b, w = sum(x < -1e-9 for x in dd), sum(x > 1e-9 for x in dd)
        out.append(f"{label} | {len(us)} | {statistics.mean(m153.swc(u, ALPHA) for u in us):.2f} | "
                   f"{statistics.mean(u['cell']['rand'] for u in us):.2f} | {b} / {w} / {len(us) - b - w} | {sign_p(b, w):.4f}")
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))
    return ps, summ


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
