"""Milestone 160: is the "OpenROAD rebuild" drift of milestone 159 OpenROAD's at all? One OpenROAD binary, two Yosys builds
(flow run).

Usage: python experiments/yosys_swap/run.py --lib /tmp/ss.lib [--pdk <sky130hd dir>] [--jobs 4] [--out /tmp/vdse-m160]
       python experiments/yosys_swap/run.py --analyse   # results.txt from results.jsonl, no flow

Why: milestone 159 read the drift on its "same mapped netlist" points S (equal mapped area and OpenSTA WNS under both builds) as
the OpenROAD rebuild's alone, 54% of a design's drift. This session recovered the two builds' store paths, which no earlier
milestone recorded, from the nixpkgs-unstable release history (releases.nixos.org store-paths.xz) and Hydra:
  every Yosys-0.70 release from 2026-11-12 09:23 to 2026-11-17 10:21 UTC (milestone 143 ran on 11-17) ships
    /nix/store/k3d2rlwjmidx9ir9s4d5mx6fnbr54029-openroad-26Q3 with /nix/store/dzsihg5w5xxgcg54wadlv0zf7vk4br8n-yosys-0.70;
  the 11-18 release ships h5lmxcar...-openroad-26Q3 with 97qy1bkp...-yosys-0.71, and the 11-20 and later releases (milestones
    156 and 157 ran on 11-20) ship /nix/store/p9p471531siamk4ccnl5h2xp41kgzjq6-openroad-26Q3 with
    /nix/store/mlbhr6nzwzfaqigj8vh5bwmbcrajsd11-yosys-0.71.
The executable inside all three OpenROAD outputs, bin/.openroad-wrapped, is byte-identical (sha256 0cc2cf88...), and their runtime
closures (cache.nixos.org narinfo References, 206 store paths) are identical except yosys-0.70 -> yosys-0.71, which the
bin/openroad wrapper only prepends to PATH (`experiments/yosys_swap/closures.txt`). So the "rebuild" is a new store hash with the
same binary and libraries, and milestone 159's S drift must come from the Yosys outputs differing in a way the area/WNS proxy
cannot see, or from something outside the tools.

Test: points sampled from milestone 159's S and N (seed 160: 60 of S's 374, 30 of N's 2,407), each run through the flow twice with
OpenROAD p9p4 fixed and only `yosys` on PATH changed (0.70 dzsihg5w, 0.71 mlbh), plus a control of the first 6 S points with
Yosys 0.70 under OpenROAD k3d2 (the store path build A actually used). Each run keeps fingerprints of its mapped netlist:
sha256 of the text, sha256 of its sorted lines (order-only differences), the cell-type multiset, and a Weisfeiler-Lehman hash of
the cell/net graph with top-level ports as the only named nets (structure up to renaming; 6 rounds). "Reproduces" means every one
of FIELDS is equal to the milestone's row.

Predictions, written here and committed before the flow first runs:
 (1) PRIMARY: with OpenROAD fixed, Yosys 0.70 reproduces build A's row (milestone 143, corner_ss_blind) and Yosys 0.71 reproduces
     build B's row (milestone 156/157, rc_corner nominal) each on at least 90% of the 90 points. Prior 75%.
 (2) control: OpenROAD k3d2 gives the same FIELDS as p9p4 on all 6 control points. Prior 95%.
 (3) on the sampled S points, the two Yosys builds' mapped netlists are not byte-identical on at least 90%. Prior 85%.
 (4) on the sampled S points, the cell-type multiset is the same on at least 90%. Prior 75%.
 (5) on the sampled S points, the netlists are WL-equal (the same structure up to names) on at least half. Prior 50%.
 (6) on the sampled N points, they are WL-equal on at most 10%. Prior 80%.
 (7) among sampled S points that are WL-equal, the routed numbers (final_area_notap, final_wns) differ between the Yosys
     builds on at least 80%: names or order alone move placement. Prior 65%.
Reported, not predicted: which kind of difference (order only, names, structure) on S and N; the stage at which runs on
WL-equal netlists first diverge; the routed drift lr on each class.
"""
import argparse
import hashlib
import importlib.util
import json
import os
import random
import re
import sys
from collections import Counter
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
sys.path.insert(0, str(EXP.parent / "src"))
from verified_dse import flow  # noqa: E402

SEED = 160
YOSYS = {"0.70": "/nix/store/dzsihg5w5xxgcg54wadlv0zf7vk4br8n-yosys-0.70/bin",
         "0.71": "/nix/store/mlbhr6nzwzfaqigj8vh5bwmbcrajsd11-yosys-0.71/bin"}
OPENROAD = {"p9p4": "/nix/store/p9p471531siamk4ccnl5h2xp41kgzjq6-openroad-26Q3/bin/openroad",
            "k3d2": "/nix/store/k3d2rlwjmidx9ir9s4d5mx6fnbr54029-openroad-26Q3/bin/openroad"}
FIELDS = ["r1_cells", "r1_depth", "synth_netlist_area", "synth_netlist_wns", "global_place_area", "global_place_wns",
          "detail_place_area", "detail_place_wns", "buffers_added", "final_area", "final_wns", "final_cells", "final_area_notap",
          "tap_area", "power_w"]
STAGE_ORDER = [("mapped", ["synth_netlist_area", "synth_netlist_wns"]), ("global_place", ["global_place_area", "global_place_wns"]),
               ("detail_place", ["detail_place_area", "detail_place_wns", "buffers_added"]),
               ("routed", ["final_area_notap", "final_wns", "final_cells", "power_w"])]
TABLE = HERE / "results.jsonl"


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def m159():
    return _load(EXP / "tool_build" / "analyse159.py", "vdse_m160_m159")


def sample():
    """(class, design, A row, B row) for the sampled points, fixed by seed 160 before any flow ran."""
    M = m159()
    designs, t = M.M158.tables()
    S, N = [], []
    for d in designs:
        for s, a, b in M.pairs(M.M158.per(t["A"], d), M.M158.per(t["B"], d)):
            (S if M.same_mapped(a, b) else N).append((d, a, b))
    rng = random.Random(SEED)
    return [("S",) + x for x in rng.sample(S, 60)] + [("N",) + x for x in rng.sample(N, 30)]


# ---------------------------------------------------------------- netlist fingerprints
INST = re.compile(r"^\s*(\S+)\s+(\\\S+|\S+)\s*\((.*?)\);", re.S | re.M)
PIN = re.compile(r"\.(\w+)\(([^()]*)\)")
ASSIGN = re.compile(r"^\s*assign\s+(.+?)\s*=\s*(.+?);", re.M)
PORT = re.compile(r"^\s*(input|output|inout)\s+(?:\[(\d+):(\d+)\]\s*)?(\S+);", re.M)


def _h(x):
    return hashlib.sha256(repr(x).encode()).hexdigest()[:16]


def fingerprint(text):
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)  # the "Generated by Yosys <version>" banner
    body = text[text.index("module"):]
    ports = {}
    for kind, hi, lo, name in PORT.findall(body):
        if hi:
            for i in range(min(int(hi), int(lo)), max(int(hi), int(lo)) + 1):
                ports[f"{name}[{i}]"] = f"{kind}:{name}[{i}]"
        else:
            ports[name] = f"{kind}:{name}"
    parent = {}

    def find(x):
        while parent.get(x, x) != x:
            x = parent[x]
        return x

    for lhs, rhs in ASSIGN.findall(body):
        parent[find(lhs.strip())] = find(rhs.strip())
    insts = []
    for cell, name, conns in INST.findall(body):
        if cell in ("module", "input", "output", "inout", "wire", "assign", "reg"):
            continue
        insts.append((cell, [(p, find(n.strip())) for p, n in PIN.findall(conns)]))
    nets = {}
    for i, (_, pins) in enumerate(insts):
        for p, n in pins:
            nets.setdefault(n, []).append((i, p))
    portlab = {}
    for x in ports:
        portlab.setdefault(find(x), []).append(ports[x])
    lab_net = {}
    for n in nets:
        names = sorted(portlab.get(n, []))
        if n.startswith("1'"):
            names = [n]
        lab_net[n] = _h(tuple(names) if names else "~")
    lab_inst = [_h(c) for c, _ in insts]
    for _ in range(6):
        new_inst = [_h((lab_inst[i], tuple(sorted((p, lab_net[n]) for p, n in pins)))) for i, (_, pins) in enumerate(insts)]
        new_net = {n: _h((lab_net[n], tuple(sorted((p, lab_inst[i]) for i, p in nets[n])))) for n in nets}
        lab_inst, lab_net = new_inst, new_net
    return {"sha": hashlib.sha256(text.encode()).hexdigest()[:16],
            "sorted_sha": _h(sorted(l for l in text.splitlines() if l.strip())),
            "cells": _h(sorted(Counter(c for c, _ in insts).items())),
            "n_inst": len(insts),
            "wl": _h(sorted(lab_inst))}


# ---------------------------------------------------------------- flow
def task(a):
    tag, cls, design, seq, period, wd, lib, pdk, ykey, okey = a
    os.environ["PATH"] = YOSYS[ykey] + ":" + os.environ["PATH"]
    M141 = _load(EXP / "util65_blind" / "run.py", "vdse_m160_r141")
    M141.install()
    try:
        r = flow.run_point(design, seq, period, wd, lib, pdk, OPENROAD[okey])
        r["status"] = "ok"
        r["netlist"] = fingerprint((Path(wd) / "mapped.v").read_text())
    except RuntimeError as e:
        r = {"design": design, "seq": list(seq), "period_ns": period, "status": "fail", "error": str(e)[-200:]}
    r.update({"tag": tag, "cls": cls, "yosys": ykey, "openroad": okey})
    return r


def main_run(a):
    if flow.UTIL != 40:
        sys.exit("unset VDSE_UTIL")
    M143 = _load(EXP / "corner_ss_blind" / "run.py", "vdse_m160_r143")
    if hashlib.sha256(Path(a.lib).read_bytes()).hexdigest() != M143.SHA256:
        sys.exit("not milestone 143's ss liberty")
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    lib = out / "lib.lib"
    flow.filtered_liberty(Path(a.lib), lib)
    pts = sample()
    tasks = []
    for k, (cls, d, ra, rb) in enumerate(pts):
        assert ra["period_ns"] == rb["period_ns"]
        for y in YOSYS:
            tasks.append(("main", cls, d, ra["seq"], ra["period_ns"], out / y / f"{k}", lib, Path(a.pdk), y, "p9p4"))
    for k, (cls, d, ra, rb) in enumerate(pts[:6]):
        tasks.append(("control", cls, d, ra["seq"], ra["period_ns"], out / "ctl" / f"{k}", lib, Path(a.pdk), "0.70", "k3d2"))
    print(f"{len(tasks)} runs", flush=True)
    with Pool(a.jobs) as pool, open(TABLE, "w") as fh:
        for i, r in enumerate(pool.imap(task, tasks, chunksize=1)):
            fh.write(json.dumps(r) + "\n")
            fh.flush()
            if i % 20 == 0:
                print(i, r["design"], r["status"], flush=True)


# ---------------------------------------------------------------- analysis
def equal(x, y, fields=FIELDS):
    return all(x.get(f) == y.get(f) for f in fields)


def first_divergence(x, y):
    for name, fs in STAGE_ORDER:
        if not equal(x, y, fs):
            return name
    return "none"


def kind(f70, f71):
    if f70["sha"] == f71["sha"]:
        return "identical"
    if f70["sorted_sha"] == f71["sorted_sha"]:
        return "order only"
    if f70["wl"] == f71["wl"]:
        return "names/order (WL-equal)"
    if f70["cells"] == f71["cells"]:
        return "structure (same cells)"
    return "structure (different cells)"


def lr(x, y):
    import math
    sx = x["final_area_notap"] * (x["period_ns"] - x["final_wns"])
    sy = y["final_area_notap"] * (y["period_ns"] - y["final_wns"])
    return abs(math.log(sy / sx))


def analyse(dst):
    import statistics
    rows = [json.loads(l) for l in TABLE.read_text().splitlines()]
    pts = sample()
    main = {(r["yosys"], tuple(r["seq"]), r["design"]): r for r in rows if r["tag"] == "main"}
    ctl = [r for r in rows if r["tag"] == "control"]
    L = []
    rec = []
    for cls, d, ra, rb in pts:
        y0, y1 = main[("0.70", tuple(ra["seq"]), d)], main[("0.71", tuple(ra["seq"]), d)]
        ok = y0["status"] == "ok" and y1["status"] == "ok"
        rec.append({"cls": cls, "design": d, "ok": ok, "repA": ok and equal(y0, ra), "repB": ok and equal(y1, rb),
                    "kind": kind(y0["netlist"], y1["netlist"]) if ok else "fail",
                    "div": first_divergence(y0, y1) if ok else "fail", "lr": lr(y0, y1) if ok else None,
                    "mismatchA": [f for f in FIELDS if ok and y0.get(f) != ra.get(f)],
                    "mismatchB": [f for f in FIELDS if ok and y1.get(f) != rb.get(f)]})
    n = len(rec)
    S = [r for r in rec if r["cls"] == "S"]
    N = [r for r in rec if r["cls"] == "N"]
    repA = sum(r["repA"] for r in rec)
    repB = sum(r["repB"] for r in rec)
    pmain = {tuple(r["seq"]) + (r["design"],): r for r in rows if r["tag"] == "main" and r["yosys"] == "0.70"}
    ctl_eq = sum(c["status"] == "ok" and equal(c, pmain[tuple(c["seq"]) + (c["design"],)]) for c in ctl)
    Sok = [r for r in S if r["ok"]]
    Nok = [r for r in N if r["ok"]]
    notbyte = sum(r["kind"] != "identical" for r in Sok)
    samecells = sum(r["kind"] in ("identical", "order only", "names/order (WL-equal)", "structure (same cells)") for r in Sok)
    wlS = [r for r in Sok if r["kind"] in ("identical", "order only", "names/order (WL-equal)")]
    wlN = [r for r in Nok if r["kind"] in ("identical", "order only", "names/order (WL-equal)")]
    wl_moved = [r for r in wlS if r["div"] in ("mapped", "global_place", "detail_place", "routed")
                and r["kind"] != "identical"]
    wl_routed_diff = sum(r["div"] != "none" for r in wlS)
    held = [repA >= 0.9 * n and repB >= 0.9 * n,
            ctl_eq == len(ctl),
            notbyte >= 0.9 * len(Sok),
            samecells >= 0.9 * len(Sok),
            len(wlS) >= 0.5 * len(Sok),
            len(wlN) <= 0.1 * len(Nok),
            bool(wlS) and wl_routed_diff >= 0.8 * len(wlS)]
    L.append("Milestone 160: one OpenROAD binary, two Yosys builds, on 90 points sampled from milestone 159's S and N (seed 160).")
    L.append("OpenROAD p9p4 (bin/.openroad-wrapped byte-identical to build A's k3d2); Yosys 0.70 dzsihg5w (build A) or 0.71 mlbh (build B).")
    L.append(f"points: {n} ({len(S)} S, {len(N)} N); ok under both Yosys builds: {len(Sok)} S, {len(Nok)} N")
    L.append("")
    L.append(f"(1) PRIMARY  Yosys 0.70 reproduces build A's row on {repA} of {n}; Yosys 0.71 reproduces build B's row on {repB} of {n}"
             f" (needed >= {0.9 * n:.0f} each): {'held' if held[0] else 'refuted'}")
    L.append(f"(2) control  OpenROAD k3d2 equals p9p4 on {ctl_eq} of {len(ctl)}: {'held' if held[1] else 'refuted'}")
    L.append(f"(3) S netlists not byte-identical on {notbyte} of {len(Sok)}: {'held' if held[2] else 'refuted'}")
    L.append(f"(4) S cell-type multiset the same on {samecells} of {len(Sok)}: {'held' if held[3] else 'refuted'}")
    L.append(f"(5) S WL-equal on {len(wlS)} of {len(Sok)}: {'held' if held[4] else 'refuted'}")
    L.append(f"(6) N WL-equal on {len(wlN)} of {len(Nok)}: {'held' if held[5] else 'refuted'}")
    L.append(f"(7) of the {len(wlS)} WL-equal S points, results differ on {wl_routed_diff}: {'held' if held[6] else 'refuted'}")
    L.append("")
    L.append("Reported, not predicted:")
    for cls, R in (("S", Sok), ("N", Nok)):
        c = Counter(r["kind"] for r in R)
        L.append(f"  {cls} netlist difference: " + "; ".join(f"{k} {v}" for k, v in sorted(c.items())))
        c = Counter(r["div"] for r in R)
        L.append(f"  {cls} first stage that differs between the Yosys builds: " + "; ".join(f"{k} {v}" for k, v in sorted(c.items())))
        for k in sorted(set(r["kind"] for r in R)):
            v = [r["lr"] for r in R if r["kind"] == k]
            L.append(f"  {cls} {k}: median routed drift lr {statistics.median(v):.4f}, mean {statistics.mean(v):.4f} (n {len(v)})")
    bad = [r for r in rec if r["ok"] and not (r["repA"] and r["repB"])]
    L.append(f"  points not reproduced: {len(bad)}" + "".join(f"\n    {r['cls']} {r['design']}: A {r['mismatchA']} B {r['mismatchB']}" for r in bad))
    fails = [r for r in rec if not r["ok"]]
    L.append(f"  points failing under either Yosys build: {len(fails)}")
    Path(dst).write_text("\n".join(L) + "\n")
    print("\n".join(L))
    return {"held": held, "n": n, "repA": repA, "repB": repB, "rec": rec}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--lib")
    ap.add_argument("--pdk", default="/tmp/pdk/orfs/flow/platforms/sky130hd")
    ap.add_argument("--out", default="/tmp/vdse-m160")
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--analyse", action="store_true")
    a = ap.parse_args()
    if a.analyse:
        analyse(HERE / "results.txt")
    else:
        main_run(a)
