"""Milestone 141: does the clipped ladder's blind advantage survive a second operating point? The one-clock blind designs of
milestones 137, 138 and 140, rerun at 65% placement utilisation (experiments/util65_blind/run.py), compared with their own 40% cells.

Usage: python3 analyse.py [out.txt]

Why: milestone 140's "Next" and every blind milestone's "Limits": one tool version, corner and utilisation. Over 73 blind designs at
40% utilisation SWC beats equal-cost random routing on 55 and loses on 15 (sign p = 0.000002). The rule's parts (theta = 3 on the
routing-cost ratio, the clip alpha = 1.25 at the clock) were all chosen at 40%. At 65% the same mapped netlists are placed in a smaller
core, so wires, congestion and timing repair change, and the routed optimum can move. Nothing is retuned here.

Rules, unchanged: SWC (milestone 115's clipped ladder on the ladder branch, routed/r2 > theta = 3; equal-cost random below it) and
equal-cost random routing, both from experiments/new_families/analyse.py's build (the code of every blind set since milestone 121).
Random's tie-break seed: "m141u65" + clock + design at 65%; the 40% cells keep their own milestones' seeds (m137confirm, m138confirm).
The analysed set is the longest complete prefix of run.py's seed-141 ORDER (a rule that depends on no result).

Predictions, written here and committed before the flow runs (all over the analysed designs, one cell each):
 (1) routing is dearer at 65%: the median over designs of the table routed/r2 ratio is higher at 65% than at 40%. Prior 65%.
 (2) every 65% cell is on the ladder branch (routed/r2 > 3). Prior 80% (the lowest 40% ratio on these designs is 3.33).
 (3) PRIMARY: at 65% SWC is better than random on more designs than it is worse, and the two-sided exact sign test over the untied
     designs has p < 0.05. Prior 55% (depends on how many designs finish: 16 untied designs need 13 to 3 or better).
 (4) at 65% SWC's mean regret is below random's. Prior 75%.
 (5) the sign of SWC - random agrees between 65% and 40% on at least two thirds of the designs untied at both. Prior 55%.
 (6) the operating point matters: the median over designs of Kendall tau-b between a point's routed score (area x delay) at 40% and
     at 65%, over the sequences usable at both, is below 0.8. Prior 60%. If it is not, (3) to (5) say little that 40% did not.
 (7) the change in the advantage, d65 - d40 with d = SWC - random, has a design-bootstrap 95% interval (2,000 resamples, seed 141)
     that contains zero. Prior 60%.
Reported, not predicted: the per-design table at both points, the share of designs whose routed-best sequence is the same at both,
SWC failures (loses to random by more than 1 point) at each point, and the ratio bands of milestone 139 at 65%.
"""
import importlib.util
import json
import statistics
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 141
TABLE = HERE / "results.jsonl"


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


m140 = _sibling(EXP / "ladder_rest" / "analyse.py", "verified_dse_m141_m140")
m137, lb, nf, rule, pool, score = m140.m137, m140.lb, m140.nf, m140.rule, m140.pool, m140.score
swc, rand, lad, sign = m140.swc, m140.rand, m140.lad, m140.sign
run = _sibling(HERE / "run.py", "verified_dse_m141_run")
tau_b = _sibling(EXP / "ladder_diagnosis" / "analyse.py", "verified_dse_m141_diag").tau_b
BANDS = m140.BANDS


def rows65():
    return [json.loads(l) for l in TABLE.read_text().splitlines()] if TABLE.exists() else []


def rows40(d):
    if run.SRC[d] == "ladder_confirm":
        rs = [json.loads(l) for l in (EXP / "ladder_confirm" / "results.jsonl").read_text().splitlines()]
    else:
        rs = m140.rows()
    return [r for r in rs if r["design"] == d]


def cells(rs, src, seed):
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / "t.jsonl"
        p.write_text("".join(json.dumps(r) + "\n" for r in rs))
        raw = rule.load_table(p, src)
    return {c["design"]: c for c in nf.build(raw, lambda k: f"{seed}{k[0]}{k[1]}")}


def r4(r):
    return r["final_area_notap"] * (r["period_ns"] - r["final_wns"])


def compare(d, a, b):
    """tau-b of routed score over sequences usable at both points, and whether the routed-best sequence is the same."""
    x = {tuple(r["seq"]): r4(r) for r in a if r["status"] == "ok"}
    y = {tuple(r["seq"]): r4(r) for r in b if r["status"] == "ok"}
    common = sorted(set(x) & set(y))
    t = tau_b([x[s] for s in common], [y[s] for s in common])
    return t, min(x, key=x.get) == min(y, key=y.get), len(common)


def boot(diffs, seed=SEED, n=2000):
    rng = __import__("random").Random(seed)
    v = list(diffs)
    ms = sorted(statistics.mean(rng.choice(v) for _ in v) for _ in range(n))
    return ms[int(0.025 * n)], ms[int(0.975 * n) - 1]


def main(dst):
    out = ["# Milestone 141: the one-clock blind designs at 65% placement utilisation against their 40% cells (flow run)", "",
           f"theta = {score.THETA}; run order seed 141 over {len(run.ORDER)} designs (milestone 137's 12, milestone 138's 40)", ""]
    r65 = rows65()
    done = run.complete(r65)
    out.append(f"complete designs (ORDER prefix): {len(done)} of {len(run.ORDER)}")
    if not done:
        Path(dst).write_text("\n".join(out) + "\n")
        print("\n".join(out))
        return
    c65 = cells([r for r in r65 if r["design"] in set(done)], "util65_blind", "m141u65")
    c40, tau, same = {}, {}, {}
    for d in done:
        a = rows40(d)
        seed = "m137confirm" if run.SRC[d] == "ladder_confirm" else "m138confirm"
        c40[d] = cells(a, run.SRC[d], seed)[d]
        tau[d], same[d], _ = compare(d, a, [r for r in r65 if r["design"] == d])
    d40 = {d: swc(c40[d]) - rand(c40[d]) for d in done}
    d65 = {d: swc(c65[d]) - rand(c65[d]) for d in done}
    out += ["", "design | clock | routed/r2 40% | routed/r2 65% | tau-b routed 40 vs 65 | same best | random 40 | SWC 40 | "
            "random 65 | SWC 65 | d40 | d65"]
    for d in sorted(done, key=lambda d: (d65[d], d)):
        a, b = c40[d], c65[d]
        out.append(f"{d} | {b['clock']} | {a['ratio']:.2f} | {b['ratio']:.2f} | {tau[d]:.3f} | {same[d]} | {rand(a):.2f} | "
                   f"{swc(a):.2f} | {rand(b):.2f} | {swc(b):.2f} | {d40[d]:+.2f} | {d65[d]:+.2f}")
    l65 = list(c65.values())
    l40 = [c40[d] for d in done]
    med40, med65 = statistics.median(c["ratio"] for c in l40), statistics.median(c["ratio"] for c in l65)
    ladder = [c for c in l65 if lad(c)]
    b65, w65, t65, p65 = sign(d65)
    b40, w40, t40, p40 = sign(d40)
    agree = [d for d in done if abs(d40[d]) > 1e-9 and abs(d65[d]) > 1e-9]
    nagree = sum((d40[d] < 0) == (d65[d] < 0) for d in agree)
    mtau = statistics.median(tau.values())
    ch = [d65[d] - d40[d] for d in done]
    clo, chi = boot(ch)
    lo65, hi65 = boot(d65.values(), seed=SEED + 1)
    fail40, fail65 = sum(v > 1 for v in d40.values()), sum(v > 1 for v in d65.values())
    out += ["", f"65%: mean regret SWC {lb.mean(l65, swc):.2f}%, random {lb.mean(l65, rand):.2f}%; SWC better on {b65}, worse on "
            f"{w65}, tied on {t65}; two-sided sign p = {p65:.4f}; design-bootstrap 95% interval of mean d65 {lo65:+.2f} to {hi65:+.2f}",
            f"40% (same designs): mean regret SWC {lb.mean(l40, swc):.2f}%, random {lb.mean(l40, rand):.2f}%; SWC better on {b40}, "
            f"worse on {w40}, tied on {t40}; two-sided sign p = {p40:.4f}",
            f"SWC fails (loses by > 1 point): {fail40} designs at 40%, {fail65} at 65%",
            f"median routed/r2: {med40:.2f} at 40%, {med65:.2f} at 65%; ladder branch at 65%: {len(ladder)} of {len(l65)}",
            f"median tau-b of routed score, 40% vs 65%: {mtau:.3f} (range {min(tau.values()):.3f} to {max(tau.values()):.3f}); "
            f"same routed-best sequence on {sum(same.values())} of {len(done)}",
            f"change d65 - d40: mean {statistics.mean(ch):+.2f} points, design-bootstrap 95% interval {clo:+.2f} to {chi:+.2f}",
            f"sign of d agrees on {nagree} of {len(agree)} designs untied at both points", "",
            "## Ratio bands at 65% (milestone 139's)", "", "band | cells | SWC % | random % | SWC better | SWC worse"]
    for name, lo, hi in BANDS:
        cs = [c for c in l65 if lo < c["ratio"] <= hi]
        if not cs:
            out.append(f"{name} | 0 | - | - | - | -")
            continue
        bb, ww, _, _ = sign({c["design"]: swc(c) - rand(c) for c in cs})
        out.append(f"{name} | {len(cs)} | {lb.mean(cs, swc):.2f} | {lb.mean(cs, rand):.2f} | {bb} | {ww}")
    out += ["", "## Predictions", "",
            f"(1) median routed/r2 higher at 65%: {med65 > med40} ({med65:.2f} against {med40:.2f})",
            f"(2) every 65% cell on the ladder branch: {len(ladder) == len(l65)} ({len(ladder)} of {len(l65)}; lowest "
            f"{min(c['ratio'] for c in l65):.2f})",
            f"(3) PRIMARY: SWC better on more designs at 65% and sign p < 0.05: {b65 > w65 and p65 < 0.05} ({b65} better, {w65} worse, "
            f"p = {p65:.4f})",
            f"(4) SWC mean regret below random at 65%: {lb.mean(l65, swc) < lb.mean(l65, rand)}",
            f"(5) sign agrees on at least two thirds of untied designs: {3 * nagree >= 2 * len(agree)} ({nagree} of {len(agree)})",
            f"(6) median tau-b 40% vs 65% below 0.8: {mtau < 0.8} ({mtau:.3f})",
            f"(7) interval of d65 - d40 contains zero: {clo <= 0 <= chi} ({clo:+.2f} to {chi:+.2f})"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
