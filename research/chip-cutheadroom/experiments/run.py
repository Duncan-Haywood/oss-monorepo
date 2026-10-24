"""Run every design through three ABC flows and measure exact-rewrite headroom. Writes results.txt, results.json."""
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from chip_cutheadroom import netlist as N  # noqa: E402
from chip_cutheadroom.designs import DESIGNS  # noqa: E402


def main():
    rep, cost = N.class_costs()
    rows = []
    for name, (src, top) in DESIGNS.items():
        for flow in N.FLOWS:
            t0 = time.time()
            ins, outs, gates = N.synth(src, top, flow)
            r = N.analyse(ins, outs, gates, rep, cost)
            r.update(design=name, flow=flow)
            rows.append(r)
            print(name, flow, r, f"{time.time() - t0:.1f}s", file=sys.stderr)
    with open(os.path.join(HERE, "results.json"), "w") as fh:
        json.dump(rows, fh, indent=1)
    lines = ["Yosys 0.33. gates = 2-input gates (inverters free); removable = gates an exact 4-input rewriter",
             "could remove in one disjoint pass (existence by the exact costs; circuits not constructed).",
             "w/room = gates whose best 4-cut cone beats the exact minimum; cone>=3 = gates with a 4-cut cone of >=3",
             "exclusive gates that already sits at the exact minimum.",
             f"{'design':8s} {'flow':11s} {'gates':>6s} {'roots':>6s} {'w/room':>6s} {'cone>=3':>7s} {'removable':>9s} {'%':>6s}"]
    for r in rows:
        lines.append(f"{r['design']:8s} {r['flow']:11s} {r['gates']:6d} {r['roots']:6d} "
                     f"{r['roots_with_headroom']:6d} {r['roots_with_cone3_all_exact']:7d} {r['removable_disjoint']:9d} "
                     f"{100 * r['removable_disjoint'] / max(r['gates'], 1):6.1f}")
    with open(os.path.join(HERE, "results.txt"), "w") as fh:
        fh.write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
