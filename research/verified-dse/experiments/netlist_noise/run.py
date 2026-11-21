"""Milestone 161: how far does a cosmetic rewrite of one mapped netlist move the routed result, and does a canonical form remove
it? (flow run).

Usage: python experiments/netlist_noise/run.py --lib /tmp/ss.lib [--pdk <sky130hd dir>] [--jobs 4] [--out /tmp/vdse-m161]
       python experiments/netlist_noise/run.py --analyse   # results.txt from results.jsonl, no flow

Why: milestone 160 found that Yosys 0.70 and 0.71 write mapped netlists that differ only in names and order on 21 of 60 sampled
points, and that OpenROAD 26Q3 still routes them about 2% apart. That was a by-product of two tool builds. This milestone measures
the effect directly, holding every tool fixed: one Yosys 0.71 netlist per point, rewritten in ways that change no cell, no
connection and no port, and placed and routed by the same OpenROAD executable (p9p4, milestone 160).

Points: the 90 points of milestone 160's sample (seed 160; 60 from milestone 159's S, 30 from N), with Yosys 0.71 (mlbh) and
OpenROAD p9p4. The original run is a control: it must reproduce milestone 160's Yosys-0.71 row.

Variants of the mapped netlist `mapped.v` (seeds fixed: "m161" + variant + point index):
  orig  Yosys's netlist as written;
  O1,O2 the instance blocks in two random orders (wire declarations, names and pins untouched);
  W     the internal wire declarations in a random order (instances untouched);
  R     every internal net and instance renamed to a random token, order untouched;
  C(x)  canonical form of x: instances sorted by their colour-refinement (Weisfeiler-Lehman, run until the classes stop splitting)
        label of the cell/net graph (cell type, pin names, top-level ports as the only named nets); any class still tied is split by
        individualising its first member in x's order and refining again; then instances are renamed c<k> and internal nets n<k> in
        order of first use, wire declarations sorted; run for x = orig, O1, R. Disclosed: the canonicaliser was smoke-tested on one
        netlist (clamp6r, point 0; no OpenROAD run on any variant) before this commit; 6 fixed rounds left 282 of 3,052 instances
        tied there, refinement to a fixed point left none.
Every variant is checked to have the same cell multiset and the same name-free WL hash as orig (milestone 160's fingerprint) before
it is placed, so the variants are the same circuit.

Predictions, written here and committed before the flow first runs:
 (1) PRIMARY: O1 changes the routed result (final_area_notap or final_wns) from orig on at least 80% of the points ok in both.
     Prior 85%.
 (2) R (names only, order kept) changes the routed result on at least half. Prior 45%.
 (3) W (wire declaration order only) changes the routed result on at least half. Prior 40%.
 (4) the median routed drift lr = |ln(score O1 / score orig)| (score = area x (period - WNS)) is between 0.005 and 0.04. Prior 70%.
 (5) C(orig), C(O1) and C(R) are byte-identical on at least 90% of points. Prior 80%.
 (6) on points where they are byte-identical, the three canonical runs give the same routed result on every point. Prior 97%.
 (7) noise against signal: with delta(d) = median over design d's sampled points of the largest pairwise lr among orig, O1, O2, W
     and R, at least 15% of the pairs of distinct sequences in build B's table (milestone 157 nominal) on the sampled designs
     have |ln(score_i / score_j)| < delta(d). Prior 60%.
Reported, not predicted: O1 against O2; the first flow stage that differs; the number of WL ties; the drift on S and on N.
"""
import argparse
import hashlib
import importlib.util
import json
import math
import os
import random
import re
import statistics
import subprocess
import sys
from collections import Counter
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
sys.path.insert(0, str(EXP.parent / "src"))
from verified_dse import flow  # noqa: E402

TABLE = HERE / "results.jsonl"
VARIANTS = ["orig", "O1", "O2", "W", "R", "C_orig", "C_O1", "C_R"]
ROUTED = ["final_area_notap", "final_wns"]


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


M160 = _load(EXP / "yosys_swap" / "run.py", "vdse_m161_m160")


# ---------------------------------------------------------------- netlist parsing and rewriting
INST = re.compile(r"^  (\S+) (\S+) \(\n(.*?)\n  \);\n", re.S | re.M)
PIN = re.compile(r"\.(\w+)\(([^()]*)\)")
WIRE = re.compile(r"^  wire (_\w+_);$")


def parse(text):
    """Split a Yosys write_verilog -noattr -noexpr netlist into head lines, internal wire names, instances and tail lines."""
    lines = text.split("\n")
    i0 = next(i for i, l in enumerate(lines) if l.startswith("  sky130"))
    head, wires = [], []
    for l in lines[:i0]:
        m = WIRE.match(l)
        if m:
            wires.append(m.group(1))
        else:
            head.append(l)
    body = "\n".join(lines[i0:])
    insts, pos = [], 0
    for m in INST.finditer(body):
        assert m.start() == pos, "unexpected text between instances"
        insts.append((m.group(1), m.group(2), PIN.findall(m.group(3))))
        pos = m.end()
    tail = body[pos:]
    assert tail.lstrip().startswith(("assign", "endmodule")), tail[:80]
    return head, wires, insts, tail


def emit(head, wires, insts, tail):
    out = []
    # head = banner, module line, port declarations; wires go after them, as Yosys writes them
    out.extend(head)
    out.extend(f"  wire {w};" for w in wires)
    s = "\n".join(out) + "\n"
    for cell, name, pins in insts:
        s += f"  {cell} {name} (\n" + ",\n".join(f"    .{p}({n})" for p, n in pins) + "\n  );\n"
    return s + tail


def _rename_text(tail, m):
    return re.sub(r"_\w+_", lambda x: m.get(x.group(0), x.group(0)), tail)


def _net_map(pins, m):
    def one(n):
        return re.sub(r"_\w+_", lambda x: m.get(x.group(0), x.group(0)), n)
    return [(p, one(n)) for p, n in pins]


def variant(text, kind, seed):
    head, wires, insts, tail = parse(text)
    rng = random.Random(seed)
    if kind in ("O1", "O2"):
        insts = insts[:]
        rng.shuffle(insts)
    elif kind == "W":
        wires = wires[:]
        rng.shuffle(wires)
    elif kind == "R":
        toks = rng.sample(range(16 ** 6), len(wires) + len(insts))
        m = {w: f"_n{toks[i]:06x}_" for i, w in enumerate(wires)}
        insts = [(c, f"_u{toks[len(wires) + i]:06x}_", _net_map(p, m)) for i, (c, _, p) in enumerate(insts)]
        wires = [m[w] for w in wires]
        tail = _rename_text(tail, m)
    elif kind != "orig":
        raise ValueError(kind)
    return emit(head, wires, insts, tail)


def _h(x):
    return hashlib.sha256(repr(x).encode()).hexdigest()[:16]


def canonical(text):
    """Return (canonical text, number of instances still tied after colour refinement, before individualisation)."""
    head, wires, insts, tail = parse(text)
    wset = set(wires)
    nets = {}
    for i, (_, _, pins) in enumerate(insts):
        for p, n in pins:
            nets.setdefault(n, []).append((i, p))
    lab_net = {n: _h(n if n not in wset else "~") for n in nets}  # top-level ports and constants keep their names

    def refine(lab, lab_net):  # colour refinement until the number of instance classes stops growing
        k = len(set(lab))
        while True:
            lab = [_h((lab[i], tuple(sorted((p, lab_net[n]) for p, n in pins)))) for i, (_, _, pins) in enumerate(insts)]
            lab_net = {n: _h((lab_net[n], tuple(sorted((p, lab[i]) for i, p in nets[n])))) for n in nets}
            if len(set(lab)) == k:
                return lab, lab_net
            k = len(set(lab))

    lab, lab_net = refine([_h(c) for c, _, _ in insts], lab_net)
    cnt = Counter(lab)
    ties = sum(v for v in cnt.values() if v > 1)
    while True:  # individualise one member of the smallest tied class (first in x's order) and refine again
        tied = [l for l, v in Counter(lab).items() if v > 1]
        if not tied:
            break
        lab = lab[:]
        lab[lab.index(min(tied))] = _h(("individualised", min(tied)))
        lab, lab_net = refine(lab, lab_net)
    order = sorted(range(len(insts)), key=lambda i: (lab[i], i))
    m, k = {}, 0
    for i in order:
        for _, n in insts[i][2]:
            for w in re.findall(r"_\w+_", n):
                if w in wset and w not in m:
                    m[w] = f"_n{k:05d}_"
                    k += 1
    for w in wires:  # declared but unused
        if w not in m:
            m[w] = f"_n{k:05d}_"
            k += 1
    new_insts = [(insts[i][0], f"_c{j:05d}_", _net_map(insts[i][2], m)) for j, i in enumerate(order)]
    return emit(head, sorted(m[w] for w in wires), new_insts, _rename_text(tail, m)), ties


def same_circuit(a, b):
    fa, fb = M160.fingerprint(a), M160.fingerprint(b)
    return fa["cells"] == fb["cells"] and fa["wl"] == fb["wl"] and fa["n_inst"] == fb["n_inst"]


# ---------------------------------------------------------------- flow
def pnr(design, net, period, wd, lib, pdk, openroad):
    """OpenROAD on a given mapped netlist, exactly as flow.run_point does after Yosys."""
    wd = Path(wd)
    wd.mkdir(parents=True, exist_ok=True)
    _, top, _, clk = flow.DESIGNS[design]
    tcl = (flow.PNR / "src/chip_pnr/pnr.tcl").read_text()
    tcl = re.sub(r'^(puts "STAGE (\w+)")$', r'\1\nputs "TIME \2 [clock milliseconds]"', tcl, flags=re.M)
    tcl = 'puts "TIME start [clock milliseconds]"\n' + tcl
    (wd / "pnr.tcl").write_text(tcl)
    env = dict(os.environ, PLATFORM=str(pdk), LIBERTY=str(lib), NETLIST=str(net), TOP=top, PERIOD_NS=str(period),
               UTIL=str(flow.UTIL), OUTDIR=str(wd), CLK_PORT=clk, OMP_NUM_THREADS="1")
    p = subprocess.run([openroad, "-threads", "1", "-exit", str(wd / "pnr.tcl")], env=env, capture_output=True, text=True)
    (wd / "openroad.log").write_text(p.stdout)
    if p.returncode:
        raise RuntimeError("openroad: " + p.stdout[-300:])
    return {k: v for k, v in flow.parse_log(p.stdout, period).items() if k != "cell_usage"}


def task(a):
    k, cls, design, seq, period, wd, lib, pdk = a
    os.environ["PATH"] = M160.YOSYS["0.71"] + ":" + os.environ["PATH"]
    M141 = _load(EXP / "util65_blind" / "run.py", "vdse_m161_r141")
    M141.install()
    orb = M160.OPENROAD["p9p4"]
    wd = Path(wd)
    base = {"k": k, "cls": cls, "design": design, "seq": list(seq), "period_ns": period}
    try:
        r0 = flow.run_point(design, seq, period, wd / "orig", lib, pdk, orb)
    except RuntimeError as e:
        return [dict(base, variant="orig", status="fail", error=str(e)[-200:])]
    out = [dict(base, variant="orig", status="ok", **{f: r0.get(f) for f in M160.FIELDS},
                netlist=M160.fingerprint((wd / "orig" / "mapped.v").read_text()))]
    text = (wd / "orig" / "mapped.v").read_text()
    texts = {v: variant(text, v, f"m161{v}{k}") for v in ("O1", "O2", "W", "R")}
    for x in ("orig", "O1", "R"):
        texts["C_" + x], ties = canonical(text if x == "orig" else texts[x])
    csha = {v: hashlib.sha256(texts[v].encode()).hexdigest()[:16] for v in texts}
    for v in VARIANTS[1:]:
        if not same_circuit(text, texts[v]):
            out.append(dict(base, variant=v, status="not same circuit"))
            continue
        vd = wd / v
        vd.mkdir(parents=True, exist_ok=True)
        (vd / "mapped.v").write_text(texts[v])
        try:
            r = pnr(design, vd / "mapped.v", period, vd, lib, pdk, orb)
            out.append(dict(base, variant=v, status="ok", sha=csha[v], ties=ties if v.startswith("C_") else None,
                            **{f: r.get(f) for f in M160.FIELDS if f in r}))
        except RuntimeError as e:
            out.append(dict(base, variant=v, status="fail", error=str(e)[-200:]))
    return out


def main_run(a):
    if flow.UTIL != 40:
        sys.exit("unset VDSE_UTIL")
    M143 = _load(EXP / "corner_ss_blind" / "run.py", "vdse_m161_r143")
    if hashlib.sha256(Path(a.lib).read_bytes()).hexdigest() != M143.SHA256:
        sys.exit("not milestone 143's ss liberty")
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    lib = out / "lib.lib"
    flow.filtered_liberty(Path(a.lib), lib)
    pts = M160.sample()
    tasks = [(k, cls, d, ra["seq"], ra["period_ns"], out / f"{k}", lib, Path(a.pdk)) for k, (cls, d, ra, rb) in enumerate(pts)]
    print(f"{len(tasks)} points x {len(VARIANTS)} variants", flush=True)
    with Pool(a.jobs) as pool, open(TABLE, "w") as fh:
        for i, rs in enumerate(pool.imap(task, tasks, chunksize=1)):
            for r in rs:
                fh.write(json.dumps(r) + "\n")
            fh.flush()
            print(i, rs[0]["design"], [r["status"] for r in rs].count("ok"), flush=True)


# ---------------------------------------------------------------- analysis
def score(r):
    return r["final_area_notap"] * (r["period_ns"] - r["final_wns"])


def lr(x, y):
    return abs(math.log(score(y) / score(x)))


def routed_diff(x, y):
    return any(x.get(f) != y.get(f) for f in ROUTED)


def first_divergence(x, y):
    for name, fs in M160.STAGE_ORDER[1:]:
        if any(x.get(f) != y.get(f) for f in fs):
            return name
    return "none"


def analyse(dst, quiet=False):
    rows = [json.loads(l) for l in TABLE.read_text().splitlines()]
    pts = M160.sample()
    by = {}
    for r in rows:
        by.setdefault(r["k"], {})[r["variant"]] = r
    L = []
    ok = [k for k in range(len(pts)) if all(by.get(k, {}).get(v, {}).get("status") == "ok" for v in VARIANTS)]
    n = len(ok)
    ctl = sum(M160.equal(by[k]["orig"], pts[k][3]) for k in ok)
    ch = {v: sum(routed_diff(by[k]["orig"], by[k][v]) for k in ok) for v in ("O1", "O2", "W", "R")}
    lrs = {v: [lr(by[k]["orig"], by[k][v]) for k in ok] for v in ("O1", "O2", "W", "R")}
    med = statistics.median(lrs["O1"])
    csame = [k for k in ok if by[k]["C_orig"]["sha"] == by[k]["C_O1"]["sha"] == by[k]["C_R"]["sha"]]
    cres = sum(not routed_diff(by[k]["C_orig"], by[k]["C_O1"]) and not routed_diff(by[k]["C_orig"], by[k]["C_R"]) for k in csame)
    # (7) noise against signal
    designs, t = M160.m159().M158.tables()
    delta = {}
    for k in ok:
        vs = [by[k][v] for v in ("orig", "O1", "O2", "W", "R")]
        spread = max(lr(a, b) for i, a in enumerate(vs) for b in vs[i + 1:])
        delta.setdefault(pts[k][1], []).append(spread)
    delta = {d: statistics.median(v) for d, v in delta.items()}
    below = tot = 0
    per_design = {}
    for d in sorted(delta):
        sc = [score(r) for r in M160.m159().M158.per(t["B"], d) if r["status"] == "ok"]
        b = sum(abs(math.log(x / y)) < delta[d] for i, x in enumerate(sc) for y in sc[i + 1:])
        m = len(sc) * (len(sc) - 1) // 2
        per_design[d] = (b, m)
        below += b
        tot += m
    held = [ch["O1"] >= 0.8 * n, ch["R"] >= 0.5 * n, ch["W"] >= 0.5 * n, 0.005 <= med <= 0.04,
            len(csame) >= 0.9 * n, bool(csame) and cres == len(csame), tot and below >= 0.15 * tot]
    hv = lambda i: "held" if held[i] else "refuted"  # noqa: E731
    L.append("Milestone 161: cosmetic rewrites of one mapped netlist, same Yosys 0.71 (mlbh) and OpenROAD 26Q3 (p9p4), on milestone 160's 90 points.")
    L.append(f"points with every variant ok: {n} of {len(pts)}; control (orig reproduces milestone 160's Yosys-0.71 row, all fields): {ctl} of {n}")
    L.append("")
    L.append(f"(1) PRIMARY  O1 (instance order) changes the routed result on {ch['O1']} of {n} (needed >= {0.8 * n:.0f}): {hv(0)}")
    L.append(f"(2) R (names only) changes it on {ch['R']} of {n} (needed >= {0.5 * n:.0f}): {hv(1)}")
    L.append(f"(3) W (wire declaration order) changes it on {ch['W']} of {n}: {hv(2)}")
    L.append(f"(4) median lr O1 vs orig {med:.4f} (needed 0.005 to 0.04): {hv(3)}")
    L.append(f"(5) C(orig), C(O1), C(R) byte-identical on {len(csame)} of {n} (needed >= {0.9 * n:.0f}): {hv(4)}")
    L.append(f"(6) of those {len(csame)}, the three canonical runs agree on the routed result on {cres}: {hv(5)}")
    L.append(f"(7) sequence pairs in build B's table closer than the design's cosmetic spread: {below} of {tot}"
             f" ({below / tot:.1%}; needed >= 15%): {hv(6)}")
    L.append("")
    L.append("Reported, not predicted:")
    for v in ("O1", "O2", "W", "R"):
        x = lrs[v]
        L.append(f"  {v} vs orig: routed differs on {ch[v]} of {n}; lr median {statistics.median(x):.4f}, mean {statistics.mean(x):.4f}, "
                 f"max {max(x):.4f}")
        L.append(f"    first stage that differs: " + "; ".join(f"{s} {c}" for s, c in
                                                            sorted(Counter(first_divergence(by[k]['orig'], by[k][v]) for k in ok).items())))
    x = [lr(by[k]["O1"], by[k]["O2"]) for k in ok]
    L.append(f"  O1 vs O2: routed differs on {sum(routed_diff(by[k]['O1'], by[k]['O2']) for k in ok)} of {n}; lr median {statistics.median(x):.4f}")
    for cls in ("S", "N"):
        x = [lr(by[k]["orig"], by[k]["O1"]) for k in ok if pts[k][0] == cls]
        L.append(f"  {cls}: O1 vs orig lr median {statistics.median(x):.4f} (n {len(x)})")
    sp = [max(lr(a, b) for i, a in enumerate(vs) for b in vs[i + 1:]) for vs in
          ([by[k][v] for v in ("orig", "O1", "O2", "W", "R")] for k in ok)]
    L.append(f"  largest pairwise lr among orig, O1, O2, W, R per point: median {statistics.median(sp):.4f}, max {max(sp):.4f}")
    signed = [math.log(score(by[k]["O1"]) / score(by[k]["orig"])) for k in ok]
    L.append(f"  signed mean ln(O1/orig) {statistics.mean(signed):+.4f}")
    ties = [by[k]["C_orig"]["ties"] for k in ok]
    ni = [by[k]["orig"]["netlist"]["n_inst"] for k in ok]
    L.append(f"  WL ties: instances sharing a final label, median {statistics.median(ties)} of median {statistics.median(ni)} instances; "
             f"points with no tie {sum(t == 0 for t in ties)}")
    cdiff = [k for k in ok if routed_diff(by[k]["C_orig"], by[k]["C_O1"])]
    L.append(f"  C(orig) vs C(O1) routed differs on {len(cdiff)} of {n}")
    x = [lr(by[k]["orig"], by[k]["C_orig"]) for k in ok]
    L.append(f"  C(orig) vs orig: routed differs on {sum(routed_diff(by[k]['orig'], by[k]['C_orig']) for k in ok)} of {n}; lr median {statistics.median(x):.4f}")
    L.append("  per design: cosmetic spread delta, sequence pairs closer than delta in build B's table")
    for d in sorted(delta):
        b, m = per_design[d]
        L.append(f"    {d:9s} delta {delta[d]:.4f}  {b:5d} of {m:5d} ({b / m:.1%})")
    fails = [k for k in range(len(pts)) if k not in ok]
    L.append(f"  points with a failed or missing variant: {len(fails)}")
    Path(dst).write_text("\n".join(L) + "\n")
    if not quiet:
        print("\n".join(L))
    return {"held": held, "n": n, "ctl": ctl}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--lib")
    ap.add_argument("--pdk", default="/tmp/pdk/orfs/flow/platforms/sky130hd")
    ap.add_argument("--out", default="/tmp/vdse-m161")
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--analyse", action="store_true")
    a = ap.parse_args()
    if a.analyse:
        analyse(HERE / "results.txt")
    else:
        main_run(a)
