"""Milestone 156: does a corner with its own wire RC move the ladder? Milestone 143's 27 designs at ss_100C_1v60, nominal RC against
the PDK's max-RC corner, same tools, same clocks, same 120 sequences (experiments/rc_corner/run.py).

Usage: python3 analyse.py [out.txt]

Why: milestones 154 and 155 found that the clipped ladder (SWC) loses to equal-cost random routing where mapped (no-wire) delay ranks
routed delay worst (tauD near 0), and every corner so far changed only the liberty, with wire RC fixed (PAPER.md Section 6, item 6:
"a corner with its own RC remains untested"). Worst-case wires add delay that the mapped rung cannot see, so RC is the knob that
should move tauD most, with cell timing held fixed.

Quantities, per design and arm (nom, rcmax), over the sequences ok in that arm:
  ratio   = the cell's routed/r2 cost ratio (ladder branch when > theta = 3), from the usual cell builder;
  d       = SWC(1.25) - equal-cost random regret, in points (random's tie-break seed "m156" + arm + clock + design);
  tauD    = Kendall tau-b of mapped delay (synth_netlist_period_ns) against routed delay (period - final_wns);
  wire    = median over points of routed delay / mapped delay;
  and between arms, over sequences ok in both: tauR = tau-b of the routed score (area x delay), and whether the routed-best
  sequence is the same.

Predictions, written here and committed before the flow runs (over the analysed designs; differences are rcmax - nom):
 (1) mechanism check: wire is higher under rcmax on at least 90% of designs. Prior 85%.
 (2) PRIMARY: tauD falls: mean tauD(rcmax) - tauD(nom) < 0 with a design-bootstrap 95% interval (2,000 resamples, seed 156)
     entirely below 0. Prior 45%.
 (3) under rcmax SWC beats random on more designs than it loses, two-sided exact sign p < 0.05. Prior 65% (depends on how many
     designs finish).
 (4) the change in the edge, mean d(rcmax) - d(nom), has a design-bootstrap 95% interval that contains zero. Prior 60%.
 (5) RC moves the routed ranking less than the liberty did: median tauR above 0.335 (milestone 143's tt vs ss median). Prior 70%.
 (6) over all analysed units (designs x arms), Spearman of tauD against d is <= -0.2. Prior 50% (milestone 154: -0.58 on 26 units
     of short add chains; milestone 155: -0.01 over 183 units).
 (7) every rcmax cell is on the ladder branch. Prior 85%.
Reported, not predicted: the per-design table; mean regrets of SWC and random per arm; the nominal arm against milestone 143's own
table for the same designs (a tool-version replication: today's Yosys 0.71 / OpenROAD 26Q3 build against milestone 143's Yosys 0.70);
failed points.
"""
import importlib.util
import json
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 156
TABLE = HERE / "results.jsonl"
NOM, MAX = "ss_100C_1v60", "ss_100C_1v60+rcmax"


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


m141 = _sibling(EXP / "util65_blind" / "analyse.py", "verified_dse_m156_m141")
score, swc, rand, lad, sign, boot, tau_b = m141.score, m141.swc, m141.rand, m141.lad, m141.sign, m141.boot, m141.tau_b
lb = m141.lb
run = _sibling(HERE / "run.py", "verified_dse_m156_run")


def rows():
    return [json.loads(l) for l in TABLE.read_text().splitlines()] if TABLE.exists() else []


def rdelay(r):
    return r["period_ns"] - r["final_wns"]


def delay_stats(rs):
    ok = [r for r in rs if r["status"] == "ok"]
    t = tau_b([r["synth_netlist_period_ns"] for r in ok], [rdelay(r) for r in ok])
    w = statistics.median(rdelay(r) / r["synth_netlist_period_ns"] for r in ok)
    return t, w


def spearman(x, y):
    def rank(v):
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
    a, b = rank(x), rank(y)
    ma, mb = statistics.mean(a), statistics.mean(b)
    num = sum((p - ma) * (q - mb) for p, q in zip(a, b))
    return num / (sum((p - ma) ** 2 for p in a) * sum((q - mb) ** 2 for q in b)) ** 0.5


def boot_seed(v, seed):
    return boot(v, seed=seed)


def main(dst):
    rs = rows()
    done = run.complete(rs)
    out = ["# Milestone 156: ss_100C_1v60 at nominal RC against the PDK's max-RC corner, same tools (flow run)", "",
           f"theta = {score.THETA}; complete designs (paired prefix of milestone 143's order): {len(done)} of {len(run.ORDER)}"]
    if not done:
        Path(dst).write_text("\n".join(out) + "\n")
        print("\n".join(out))
        return
    by = {arm: [r for r in rs if r["corner"] == arm and r["design"] in set(done)] for arm in (NOM, MAX)}
    cell = {NOM: m141.cells(by[NOM], "rc_corner", "m156nom"), MAX: m141.cells(by[MAX], "rc_corner", "m156max")}
    d, tD, wire = {NOM: {}, MAX: {}}, {NOM: {}, MAX: {}}, {NOM: {}, MAX: {}}
    for arm in (NOM, MAX):
        for x in done:
            c = cell[arm][x]
            d[arm][x] = swc(c) - rand(c)
            tD[arm][x], wire[arm][x] = delay_stats([r for r in by[arm] if r["design"] == x])
    tauR, same = {}, {}
    for x in done:
        tauR[x], same[x], _ = m141.compare(x, [r for r in by[NOM] if r["design"] == x], [r for r in by[MAX] if r["design"] == x])
    out += ["", "design | clock | ratio nom | ratio rcmax | wire nom | wire rcmax | tauD nom | tauD rcmax | tauR | same best | "
            "random nom | SWC nom | random rcmax | SWC rcmax | d nom | d rcmax"]
    for x in sorted(done, key=lambda x: (d[MAX][x], x)):
        a, b = cell[NOM][x], cell[MAX][x]
        out.append(f"{x} | {b['clock']} | {a['ratio']:.2f} | {b['ratio']:.2f} | {wire[NOM][x]:.3f} | {wire[MAX][x]:.3f} | "
                   f"{tD[NOM][x]:.3f} | {tD[MAX][x]:.3f} | {tauR[x]:.3f} | {same[x]} | {rand(a):.2f} | {swc(a):.2f} | "
                   f"{rand(b):.2f} | {swc(b):.2f} | {d[NOM][x]:+.2f} | {d[MAX][x]:+.2f}")
    n = len(done)
    up = sum(wire[MAX][x] > wire[NOM][x] for x in done)
    dt = [tD[MAX][x] - tD[NOM][x] for x in done]
    tlo, thi = boot_seed(dt, SEED)
    bs, ws, ts, ps = sign(d[MAX])
    bn, wn, tn, pn = sign(d[NOM])
    dd = [d[MAX][x] - d[NOM][x] for x in done]
    dlo, dhi = boot_seed(dd, SEED + 1)
    mt = statistics.median(tauR.values())
    units_t = [tD[a][x] for a in (NOM, MAX) for x in done]
    units_d = [d[a][x] for a in (NOM, MAX) for x in done]
    rho = spearman(units_t, units_d)
    nlad = sum(lad(cell[MAX][x]) for x in done)
    L = {a: [cell[a][x] for x in done] for a in (NOM, MAX)}
    res = [
        (f"(1) wire higher under rcmax on {up} of {n} (median {statistics.median(wire[NOM].values()):.3f} nom, "
         f"{statistics.median(wire[MAX].values()):.3f} rcmax)", up >= 0.9 * n),
        (f"(2) PRIMARY mean tauD change {statistics.mean(dt):+.3f} ({statistics.mean(tD[NOM].values()):.3f} to "
         f"{statistics.mean(tD[MAX].values()):.3f}), interval {tlo:+.3f} to {thi:+.3f}; lower on {sum(v < 0 for v in dt)} of {n}",
         thi < 0),
        (f"(3) rcmax: SWC better on {bs}, worse on {ws}, tied on {ts}; sign p = {ps:.6f}", bs > ws and ps < 0.05),
        (f"(4) mean d change {statistics.mean(dd):+.2f} points, interval {dlo:+.2f} to {dhi:+.2f}", dlo <= 0 <= dhi),
        (f"(5) median tauR {mt:.3f} (range {min(tauR.values()):.3f} to {max(tauR.values()):.3f}); same routed-best on "
         f"{sum(same.values())} of {n}", mt > 0.335),
        (f"(6) Spearman of tauD against d over {2 * n} units {rho:+.3f}", rho <= -0.2),
        (f"(7) ladder branch under rcmax: {nlad} of {n} (lowest ratio {min(c['ratio'] for c in L[MAX]):.2f})", nlad == n),
    ]
    out += ["", "## Predictions", ""] + [f"{t}: {'held' if h else 'refuted'}" for t, h in res]
    out += ["", "## Reported, not predicted", "",
            f"nom: mean regret SWC {lb.mean(L[NOM], swc):.2f}%, random {lb.mean(L[NOM], rand):.2f}%; SWC better on {bn}, worse on {wn}, "
            f"tied on {tn}; sign p = {pn:.6f}",
            f"rcmax: mean regret SWC {lb.mean(L[MAX], swc):.2f}%, random {lb.mean(L[MAX], rand):.2f}%",
            f"failed points: nom {sum(r['status'] != 'ok' for r in by[NOM])}, rcmax {sum(r['status'] != 'ok' for r in by[MAX])}"]
    # tool-version replication: the nominal arm against milestone 143's own table
    m143 = {(r["design"], tuple(r["seq"])): r for r in map(json.loads, (EXP / "corner_ss_blind" / "results.jsonl").read_text().splitlines())}
    both = [(r, m143[(r["design"], tuple(r["seq"]))]) for r in by[NOM] if (r["design"], tuple(r["seq"])) in m143]
    both = [(a, b) for a, b in both if a["status"] == "ok" and b["status"] == "ok"]
    same_map = sum(a["synth_netlist_area"] == b["synth_netlist_area"] and a["synth_netlist_wns"] == b["synth_netlist_wns"] for a, b in both)
    same_rt = sum(a["final_area_notap"] == b["final_area_notap"] and a["final_wns"] == b["final_wns"] for a, b in both)
    rep = {}
    for x in done:
        rep[x], _, _ = m141.compare(x, [a for a, _ in both if a["design"] == x], [b for _, b in both if b["design"] == x])
    m143c = m141.cells([b for _, b in both], "corner_ss_blind", "m143ss")
    out += [f"tool replication (nom arm against milestone 143, {len(both)} points ok in both): mapped rung identical on {same_map}, "
            f"routed identical on {same_rt}; median tau-b of routed score {statistics.median(rep.values()):.3f}; "
            f"milestone 143's d on the same designs: mean {statistics.mean(swc(m143c[x]) - rand(m143c[x]) for x in done if x in m143c):+.2f} "
            f"against {statistics.mean(d[NOM].values()):+.2f} here"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))
    return {"done": done, "d": d, "tauD": tD, "wire": wire, "tauR": tauR, "held": [h for _, h in res]}


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
