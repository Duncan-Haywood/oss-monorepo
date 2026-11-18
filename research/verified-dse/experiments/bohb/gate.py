"""Milestone 70: R4-probe gate. Route m random points at R4, compare R2 with them (Kendall tau-b); if tau < THR run BOHB-R4-first on the remaining
budget, else BOHB. Controls: the same probe spend with no gate. Runs no flow; reuses bohb.py's tables, cost model and functions (the part of bohb.py
before its replay loop is executed here). Usage: python3 gate.py [unseen|unfaithful|unfaithful2|main]; writes gate_<arg>.txt and gate_<arg>.json."""
import json, math, os, random, statistics, sys, zlib
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARG = sys.argv[1] if len(sys.argv) > 1 else "main"; OUTNAME = ARG
src = (HERE / "bohb.py").read_text().split("\ntau = {}\n")[0]
sys.argv = ["bohb.py"] + ([ARG] if ARG != "main" else [])
exec(compile(src, str(HERE / "bohb.py"), "exec"))  # defines TABLES, costs, hyperband, tau_b, flow, M, ...
M_PROBE, THR = int(os.environ.get("GATE_M", 6)), float(os.environ.get("GATE_THR", 0.4))


def sub(idx, sc, ref, z):
    return [sc[i] for i in idx], [ref[i] for i in idx], [z[i] for i in idx]


def gated(C, sc, ref, z, B, rng, mode):
    ids = list(range(len(ref)))
    rng.shuffle(ids)
    pr, rest = ids[:M_PROBE], ids[M_PROBE:]
    Br = B - M_PROBE * C["full"]
    pbest = min(ref[i] for i in pr)
    t = tau_b([sc[i]["r2"] for i in pr], [ref[i] for i in pr])
    fall = mode == "r4first" or (mode == "gate" and (t is None or t < THR))
    if Br <= 0:
        return pbest, fall
    s2, r2_, z2 = sub(rest, sc, ref, z)
    starts = ("r4", "r3", "r2") if fall else ("r2", "r3", "r4")
    v = hyperband(C, s2, r2_, z2, Br, starts, rng, True)
    return (pbest if v is None else min(pbest, v)), fall


reg, fell, tauc = {}, defaultdict(list), {}
for name, path in TABLES.items():
    rows = [json.loads(l) for l in path.read_text().splitlines()]
    ok = [r for r in rows if r["status"] == "ok"]
    C = costs([r for r in ok if r["tag"] == "tight"])
    by = defaultdict(list)
    for r in ok:
        by[(r["tag"], r["design"])].append(r)
    for (tag, d), pool in sorted(by.items()):
        sc = [flow.scores(r) for r in pool]
        ref = [s["r4"] for s in sc]
        lo = min(ref)
        f2 = [(math.log(r["synth_netlist_area"]), math.log(r["period_ns"] - r["synth_netlist_wns"])) for r in pool]
        mu = [M(f[j] for f in f2) for j in range(2)]
        sdv = [max(statistics.pstdev([f[j] for f in f2]), 1e-6) for j in range(2)]
        z = [tuple((f[j] - mu[j]) / sdv[j] for j in range(2)) for f in f2]
        cell = (tag, d)
        tauc[cell] = tau_b([x["r2"] for x in sc], ref)
        for B in BUDGETS:
            Bc = B * C["full"]
            for sd in range(SEEDS):
                key = lambda tail: random.Random(sd * 7919 + zlib.crc32(d.encode()) % 1000 + tail)
                ids = list(range(len(ref)))
                key(1).shuffle(ids)
                out = {
                    "rand": min(ref[i] for i in ids[:max(int(B), 1)]),
                    "bohb": hyperband(C, sc, ref, z, Bc, ("r2", "r3", "r4"), key(3), True),
                    "bohb_r4first": hyperband(C, sc, ref, z, Bc, ("r4", "r3", "r2"), key(3), True),
                }
                for mode in ("gate", "r2first", "r4first"):
                    v, f = gated(C, sc, ref, z, Bc, key(5), mode)
                    out[{"gate": "gate", "r2first": "probe_bohb", "r4first": "probe_r4first"}[mode]] = v
                    if mode == "gate":
                        fell[(cell, B)].append(f)
                for a, v in out.items():
                    reg.setdefault((cell, B, a), []).append(pct(v, lo))
for k, v in list(reg.items()):
    reg[k] = None if None in v else M(v)
cells = sorted(tauc)
arms = ["rand", "bohb", "bohb_r4first", "probe_bohb", "probe_r4first", "gate"]
MULT = [c for c in cells if c[0] == "relaxed" and c[1].startswith("mult")]
out = [f"# milestone 70: R4-probe gate, m {M_PROBE}, threshold tau<{THR}, {len(cells)} cells ({ARG}), {SEEDS} paired seeds\n"]
for title, cs in (("all cells", cells), (f"relaxed multiplier cells ({len(MULT)})", MULT), ("other cells", [c for c in cells if c not in MULT])):
    if not cs:
        continue
    out.append(f"## mean regret %, {title} (n={len(cs)})\nbudget | " + " | ".join(arms))
    for B in BUDGETS:
        out.append(f"{B} | " + " | ".join("n/a" if None in [reg[(c, B, a)] for c in cs] else f"{M([reg[(c, B, a)] for c in cs]):.2f}" for a in arms))
out.append("\n## gate fallback rate (share of seeds where tau of the 6 probes < threshold), per cell class, by budget")
for title, cs in (("relaxed multiplier", MULT), ("other", [c for c in cells if c not in MULT])):
    if cs:
        out.append(title + ": " + ", ".join(f"B{B} {M([M(fell[(c, B)]) for c in cs]):.2f}" for B in BUDGETS))
out.append("\n## per relaxed multiplier cell, regret % at B40 (bohb / r4first / gate / rand) and tau(R2,R4)")
for c in MULT:
    out.append(f"{c[1]}: " + " / ".join(f"{reg[(c, 40, a)]:.2f}" for a in ("bohb", "bohb_r4first", "gate", "rand")) + f"; tau {tauc[c]:.2f}")
for B in BUDGETS:
    d = [reg[(c, B, "gate")] - reg[(c, B, "bohb")] for c in cells]
    w, l = sum(x < -1e-9 for x in d), sum(x > 1e-9 for x in d)
    n = w + l
    p = min(1.0, 2 * sum(math.comb(n, k) for k in range(0, min(w, l) + 1)) / 2 ** n) if n else 1.0
    out.append(f"gate vs bohb, B {B}: lower in {w}, higher in {l}, sign-test p {p:.3f}")
(HERE / f"gate_{OUTNAME}.txt").write_text("\n".join(out) + "\n")
(HERE / f"gate_{OUTNAME}.json").write_text(json.dumps({f"{c[0]}/{c[1]}": {f"{a}_B{B}": reg[(c, B, a)] for B in BUDGETS for a in arms} for c in cells}, indent=1))
print("\n".join(out))
