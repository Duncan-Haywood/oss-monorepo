"""Milestone 47 analysis: rung agreement with a detail-routed reference (R5), and tool-version drift of R1 to R4.
Writes results.txt. Stdlib only. Score = area x (period - WNS) as in flow.scores; R5 uses detailed_route + OpenRCX parasitics."""
import json, statistics
from pathlib import Path

import sys
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import flow, stats  # noqa: E402


def load(p):
    return [json.loads(l) for l in open(p)]


def med(v):
    return statistics.median(v) if v else float("nan")


def fmt(t):
    return "n/a" if t is None else f"{t:+.2f}"


def main():
    tag = sys.argv[1] if len(sys.argv) > 1 else "tight"
    sfx = sys.argv[3] if len(sys.argv) > 3 else ""  # e.g. "_large" for the larger-design set
    src, dst = (f"results{sfx}.jsonl", f"results{sfx}.txt") if tag == "tight" else (f"results{sfx}_{tag}.jsonl", f"results{sfx}_{tag}.txt")
    new = [r for r in load(HERE / src) if r.get("status") == "ok"]
    oldp = HERE.parent / (sys.argv[2] if len(sys.argv) > 2 else "rung_bias/results.jsonl")  # cached table the points came from
    old = {(r["design"], r["tag"], tuple(r["seq"])): r for r in load(oldp) if r["status"] == "ok"}
    out = [f"Milestone 47/49: detail-routed reference (R5). {tag} clock; tools: OpenROAD 26Q3, Yosys 0.70 (cached tables: 26Q2, 0.33)", ""]
    designs = sorted({r["design"] for r in new})
    hdr = f"{'design':12s}{'n':>4s}{'distinct r5':>12s}  tau(R1,R5) tau(R2,R5) tau(R3,R5) tau(R4,R5)  regret% R2/R4 pick  R5-opt in R4 top5"
    out.append(hdr)
    taus = {k: [] for k in ("r1", "r2", "r3", "r4")}
    shifts, drifts = [], []
    for d in designs:
        rows = [r for r in new if r["design"] == d]
        sc = [flow.scores(r) for r in rows]
        p = [r["period_ns"] for r in rows]
        r5 = [r["final_area_notap"] * (r["period_ns"] - r["droute_wns"]) for r in rows]
        line, tt = f"{d:12s}{len(rows):4d}{len(set(round(x, 3) for x in r5)):12d}  ", {}
        for k in ("r1", "r2", "r3", "r4"):
            t = stats.kendall_tau_b([s[k] for s in sc], r5)
            tt[k] = t
            if t is not None:
                taus[k].append(t)
            line += f"{fmt(t):>10s} "
        reg2 = 100 * stats.pick_regret([s["r2"] for s in sc], r5)
        reg4 = 100 * stats.pick_regret([s["r4"] for s in sc], r5)
        hit = stats.topk_hit([s["r4"] for s in sc], r5, 5)
        out.append(line + f"   {reg2:5.1f} / {reg4:4.1f}        {hit}")
        shifts += [r["droute_wns"] - r["gr4_wns4"] for r in rows]
        # tool drift: same point, cached R4 vs re-measured R4
        pairs = [(old[(d, tag, tuple(r["seq"]))], r) for r in rows if (d, tag, tuple(r["seq"])) in old]
        if pairs:
            a = [flow.scores(o)["r4"] for o, _ in pairs]
            b = [flow.scores(n)["r4"] for _, n in pairs]
            drifts.append((d, stats.kendall_tau_b(a, b), med([abs(y / x - 1) for x, y in zip(a, b)])))
    out += ["", "median tau against R5 over designs: " + ", ".join(f"{k} {med(v):+.2f} (n={len(v)})" for k, v in taus.items())]
    out.append(f"detail-route slack minus global-route slack (ns): median {med(shifts):+.3f}, min {min(shifts):+.3f}, max {max(shifts):+.3f}, n={len(shifts)}")
    out.append("tool-version drift of R4 (cached 26Q2/0.33 vs re-run 26Q3/0.70, same points): " +
               "; ".join(f"{d} tau {fmt(t)} median |change| {100 * c:.1f}%" for d, t, c in drifts))
    out.append("detail-route time per point (s): median %.1f" % med([r["t_droute"] for r in new]))
    out.append("points with DRC violations: %d of %d" % (sum(1 for r in new if r.get("drc_violations")), len(new)))
    (HERE / dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
