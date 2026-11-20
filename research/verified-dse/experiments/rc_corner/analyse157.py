"""Milestone 157: milestone 156's max-RC corner, resumed on the designs it did not reach (a blind replication of its null).

Usage: python3 analyse157.py [out.txt]

Why: milestone 156 ran 12 of milestone 143's 27 designs at ss_100C_1v60, nominal RC against SKY130's max-RC corner, before its
110-minute stop, and found the RC corner barely moves the ladder (edge change +0.10 points, interval -1.44 to +1.84; tauD change
-0.005). Its "Next" was to resume the remaining 15 designs from the same table (`run.py --resume`). Those designs' rows did not
exist when milestone 156's reading was written, so they are a blind replication of it; this script scores them alone ("fresh",
the designs past milestone 156's 12 in the complete paired prefix) and pooled with the first 12.

Same quantities as analyse.py (ratio, d = SWC(1.25) - equal-cost random regret, tauD, wire, tauR), same cell builder and tie-break
seeds. A same-tool control (control157.jsonl: run.py --control re-run before the resume, rng8l's first 12 sequences at nominal RC)
is compared with milestone 156's own rows for those points.

Predictions, written here and committed before the resumed flow runs (F = fresh designs, P = pooled complete prefix; differences
are rcmax - nom; design-bootstrap 95% intervals, 2,000 resamples, seed 157):
 (1) PRIMARY: on F the edge does not move: the interval of mean d(rcmax) - d(nom) contains zero and |mean| < 1.5 points.
     Prior 65%.
 (2) on F the interval of mean tauD(rcmax) - tauD(nom) contains zero. Prior 70%.
 (3) on F wire is higher under rcmax on at least 90% of designs. Prior 90%.
 (4) on F median tauR (routed score, nom against rcmax) is above 0.75. Prior 75%.
 (5) on P the interval of mean d(rcmax) - d(nom) contains zero. Prior 70%.
 (6) on P under rcmax SWC beats random on more designs than it loses, exact two-sided sign p < 0.05. Prior 45%.
 (7) control: the same nixpkgs Yosys 0.71 / OpenROAD 26Q3 build reproduces milestone 156's routed area and WNS exactly on every
     control point ok in both. Prior 60%.
Reported, not predicted: the per-design table for F; mean regrets per arm on F and P; failed points; the tool strings.
"""
import importlib.util
import json
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SEED = 157
M156_DONE = 12  # designs complete in both arms at milestone 156's stop (results.txt there)


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


A = _load(HERE / "analyse.py", "verified_dse_m157_a156")
NOM, MAX = A.NOM, A.MAX
m141, swc, rand, lad, sign, boot, lb = A.m141, A.swc, A.rand, A.lad, A.sign, A.boot, A.lb


def stats(rs, designs):
    by = {arm: [r for r in rs if r["corner"] == arm and r["design"] in set(designs)] for arm in (NOM, MAX)}
    cell = {NOM: m141.cells(by[NOM], "rc_corner", "m156nom"), MAX: m141.cells(by[MAX], "rc_corner", "m156max")}
    d, tD, wire = {NOM: {}, MAX: {}}, {NOM: {}, MAX: {}}, {NOM: {}, MAX: {}}
    for arm in (NOM, MAX):
        for x in designs:
            c = cell[arm][x]
            d[arm][x] = swc(c) - rand(c)
            tD[arm][x], wire[arm][x] = A.delay_stats([r for r in by[arm] if r["design"] == x])
    tauR, same = {}, {}
    for x in designs:
        tauR[x], same[x], _ = m141.compare(x, [r for r in by[NOM] if r["design"] == x], [r for r in by[MAX] if r["design"] == x])
    return {"by": by, "cell": cell, "d": d, "tD": tD, "wire": wire, "tauR": tauR, "same": same}


def control():
    p = HERE / "control157.jsonl"
    if not p.exists():
        return None
    old = {tuple(r["seq"]): r for r in A.rows() if r["design"] == "rng8l" and r["corner"] == NOM}
    new = [json.loads(l) for l in p.read_text().splitlines()]
    both = [(r, old[tuple(r["seq"])]) for r in new if tuple(r["seq"]) in old and r["status"] == "ok" == old[tuple(r["seq"])]["status"]]
    mapped = sum(a["synth_netlist_area"] == b["synth_netlist_area"] and a["synth_netlist_wns"] == b["synth_netlist_wns"] for a, b in both)
    routed = sum(a["final_area_notap"] == b["final_area_notap"] and a["final_wns"] == b["final_wns"] for a, b in both)
    return len(new), len(both), mapped, routed


def main(dst):
    rs = A.rows()
    done = A.run.complete(rs)
    fresh = done[M156_DONE:]
    out = ["# Milestone 157: the max-RC corner on the designs milestone 156 did not reach (flow run, resumed)", "",
           f"complete designs (paired prefix of milestone 143's order): {len(done)} of {len(A.run.ORDER)}; "
           f"fresh (past milestone 156's {M156_DONE}): {len(fresh)}"]
    meta = json.loads((HERE / "meta.json").read_text())
    out.append(f"tools: {meta['tools']}")
    if len(fresh) < 2:
        Path(dst).write_text("\n".join(out) + "\n")
        print("\n".join(out))
        return None
    F, P = stats(rs, fresh), stats(rs, done)
    out += ["", "## Fresh designs", "",
            "design | clock | ratio nom | ratio rcmax | wire nom | wire rcmax | tauD nom | tauD rcmax | tauR | same best | "
            "random nom | SWC nom | random rcmax | SWC rcmax | d nom | d rcmax"]
    for x in sorted(fresh, key=lambda x: (F["d"][MAX][x], x)):
        a, b = F["cell"][NOM][x], F["cell"][MAX][x]
        out.append(f"{x} | {b['clock']} | {a['ratio']:.2f} | {b['ratio']:.2f} | {F['wire'][NOM][x]:.3f} | {F['wire'][MAX][x]:.3f} | "
                   f"{F['tD'][NOM][x]:.3f} | {F['tD'][MAX][x]:.3f} | {F['tauR'][x]:.3f} | {F['same'][x]} | {rand(a):.2f} | "
                   f"{swc(a):.2f} | {rand(b):.2f} | {swc(b):.2f} | {F['d'][NOM][x]:+.2f} | {F['d'][MAX][x]:+.2f}")
    n = len(fresh)
    ddF = [F["d"][MAX][x] - F["d"][NOM][x] for x in fresh]
    lo1, hi1 = boot(ddF, seed=SEED)
    dtF = [F["tD"][MAX][x] - F["tD"][NOM][x] for x in fresh]
    lo2, hi2 = boot(dtF, seed=SEED + 1)
    up = sum(F["wire"][MAX][x] > F["wire"][NOM][x] for x in fresh)
    mt = statistics.median(F["tauR"].values())
    ddP = [P["d"][MAX][x] - P["d"][NOM][x] for x in done]
    lo5, hi5 = boot(ddP, seed=SEED + 2)
    bs, ws, ts, ps = sign(P["d"][MAX])
    ctl = control()
    res = [
        (f"(1) PRIMARY fresh: mean d change {statistics.mean(ddF):+.2f} points, interval {lo1:+.2f} to {hi1:+.2f}; "
         f"higher on {sum(v > 0 for v in ddF)} of {n}", lo1 <= 0 <= hi1 and abs(statistics.mean(ddF)) < 1.5),
        (f"(2) fresh: mean tauD change {statistics.mean(dtF):+.3f}, interval {lo2:+.3f} to {hi2:+.3f}; lower on "
         f"{sum(v < 0 for v in dtF)} of {n}", lo2 <= 0 <= hi2),
        (f"(3) fresh: wire higher under rcmax on {up} of {n} (median {statistics.median(F['wire'][NOM].values()):.3f} nom, "
         f"{statistics.median(F['wire'][MAX].values()):.3f} rcmax)", up >= 0.9 * n),
        (f"(4) fresh: median tauR {mt:.3f} (range {min(F['tauR'].values()):.3f} to {max(F['tauR'].values()):.3f}); "
         f"same routed-best on {sum(F['same'].values())} of {n}", mt > 0.75),
        (f"(5) pooled {len(done)}: mean d change {statistics.mean(ddP):+.2f} points, interval {lo5:+.2f} to {hi5:+.2f}", lo5 <= 0 <= hi5),
        (f"(6) pooled rcmax: SWC better on {bs}, worse on {ws}, tied on {ts}; sign p = {ps:.6f}", bs > ws and ps < 0.05),
    ]
    if ctl:
        res.append((f"(7) control: {ctl[0]} points re-run, {ctl[1]} ok in both; mapped identical on {ctl[2]}, routed identical on "
                    f"{ctl[3]}", ctl[1] > 0 and ctl[3] == ctl[1]))
    out += ["", "## Predictions", ""] + [f"{t}: {'held' if h else 'refuted'}" for t, h in res]
    if not ctl:
        out.append("(7) control: not run")
    bn, wn, tn, pn = sign(P["d"][NOM])
    LF = {a: [F["cell"][a][x] for x in fresh] for a in (NOM, MAX)}
    LP = {a: [P["cell"][a][x] for x in done] for a in (NOM, MAX)}
    nlad = sum(lad(c) for c in LP[MAX])
    out += ["", "## Reported, not predicted", "",
            f"fresh nom: mean regret SWC {lb.mean(LF[NOM], swc):.2f}%, random {lb.mean(LF[NOM], rand):.2f}%",
            f"fresh rcmax: mean regret SWC {lb.mean(LF[MAX], swc):.2f}%, random {lb.mean(LF[MAX], rand):.2f}%",
            f"pooled nom: mean regret SWC {lb.mean(LP[NOM], swc):.2f}%, random {lb.mean(LP[NOM], rand):.2f}%; SWC better on {bn}, "
            f"worse on {wn}, tied on {tn}; sign p = {pn:.6f}",
            f"pooled rcmax: mean regret SWC {lb.mean(LP[MAX], swc):.2f}%, random {lb.mean(LP[MAX], rand):.2f}%",
            f"pooled: mean tauD change {statistics.mean(P['tD'][MAX][x] - P['tD'][NOM][x] for x in done):+.3f}; "
            f"median tauR {statistics.median(P['tauR'].values()):.3f}; ladder branch under rcmax {nlad} of {len(done)}",
            f"pooled: Spearman of tauD against d over {2 * len(done)} units "
            f"{A.spearman([P['tD'][a][x] for a in (NOM, MAX) for x in done], [P['d'][a][x] for a in (NOM, MAX) for x in done]):+.3f}",
            f"failed points (fresh): nom {sum(r['status'] != 'ok' for r in F['by'][NOM])}, "
            f"rcmax {sum(r['status'] != 'ok' for r in F['by'][MAX])}"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))
    return {"done": done, "fresh": fresh, "F": F, "P": P, "held": [h for _, h in res]}


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results157.txt")
