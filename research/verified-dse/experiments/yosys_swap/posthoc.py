"""Milestone 160, post hoc (not pre-registered): how far apart are the two Yosys builds' netlists on the "same mapped
netlist" points? Written after the first flow rows showed input-pin swaps on commutative gates.

Usage: python3 posthoc.py --netlists /tmp/vdse-m160   # re-fingerprints the kept mapped.v files, writes posthoc.jsonl
       python3 posthoc.py                             # summary from posthoc.jsonl (no netlists needed), writes posthoc.txt

wl_in: the Weisfeiler-Lehman hash of run.py, but with every input pin of a cell given the same label, so it is unchanged when
Yosys/ABC connects the same nets to a cell's inputs in another order. It is coarser than structural identity (it would also equal
a swap of a mux's select and data inputs), so "WL_in-equal" means "the same cells wired to the same nets up to which input pin".
"""
import argparse
import hashlib
import importlib.util
import json
import re
import statistics
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT_PINS = {"X", "Y", "Q", "Q_N", "COUT", "SUM", "HI", "LO"}


def _load():
    spec = importlib.util.spec_from_file_location("vdse_m160_run", HERE / "run.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def wl_in(text, m):
    t = re.sub(r"\.(\w+)\(", lambda x: "." + (x.group(1) if x.group(1) in OUT_PINS else "IN") + "(", text)
    return m.fingerprint(t)["wl"]


def build(root):
    m = _load()
    rows = [json.loads(l) for l in (HERE / "results.jsonl").read_text().splitlines()]
    pts = m.sample()
    out = []
    for k, (cls, d, ra, rb) in enumerate(pts):
        fa, fb = Path(root) / "0.70" / str(k) / "mapped.v", Path(root) / "0.71" / str(k) / "mapped.v"
        if not (fa.exists() and fb.exists()):
            continue
        ta, tb = fa.read_text(), fb.read_text()
        out.append({"k": k, "cls": cls, "design": d, "seq": ra["seq"], "wl_in_equal": wl_in(ta, m) == wl_in(tb, m),
                    "n_inst": len(m.INST.findall(ta))})
    (HERE / "posthoc.jsonl").write_text("".join(json.dumps(r) + "\n" for r in out))


def summary(dst):
    m = _load()
    res = m.analyse(Path("/dev/null"), quiet=True)
    rec = dict(enumerate(res["rec"]))  # analyse() keeps sample() order, so the index is k
    ph = [json.loads(l) for l in (HERE / "posthoc.jsonl").read_text().splitlines()]
    L = ["Milestone 160, post hoc (not pre-registered): netlist distance between the Yosys builds, inputs unordered (wl_in)."]
    for cls in ("S", "N"):
        R = [r for r in ph if r["cls"] == cls and rec[r["k"]]["ok"]]
        eq = [r for r in R if r["wl_in_equal"]]
        L.append(f"  {cls}: wl_in-equal on {len(eq)} of {len(R)}")
        if eq:
            L.append(f"     of which routed numbers differ on {sum(rec[r['k']]['div'] != 'none' for r in eq)}; first divergence: "
                     + "; ".join(f"{k} {v}" for k, v in sorted(Counter(rec[r['k']]['div'] for r in eq).items())))
            L.append(f"     median routed drift lr {statistics.median(rec[r['k']]['lr'] for r in eq):.4f}")
        ne = [r for r in R if not r["wl_in_equal"]]
        if ne:
            L.append(f"  {cls}: not wl_in-equal on {len(ne)}; median routed drift lr {statistics.median(rec[r['k']]['lr'] for r in ne):.4f}")
    Path(dst).write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--netlists")
    a = ap.parse_args()
    if a.netlists:
        build(a.netlists)
    summary(HERE / "posthoc.txt")
