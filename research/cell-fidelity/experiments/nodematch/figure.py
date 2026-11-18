"""Write experiments/nodematch/nodematch.svg: each design's own late gain at the separator-side anode node (20)
against its anode thickness, one line per parameter set (designs sorted by thickness), from the committed rows.json
and summary.json (never retyped). The per-node thickness line L is fitted to exactly these points, design held out.

    python experiments/nodematch/figure.py
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    rs = json.loads((HERE / "rows.json").read_text())
    S = json.loads((HERE / "summary.json").read_text())["sets"]
    series = []
    for st in S:
        t = sorted((r["L_n_um"], r["h"][-1]) for r in rs if r["set"] == st)
        series.append((st, [a for a, _ in t], [b for _, b in t]))
    write_lines(HERE, "nodematch.svg", "Late gain at the separator-side anode node against anode thickness",
                "Line plot, one line per PyBaMM parameter set, of each design's own late (cycles 3 to 99) gain on the "
                "uniform stoichiometry shift at the anode node next to the separator, against the design's anode "
                "thickness in micrometres. Set-median cycle-99 forecast error, uniform lever NS, set-median profile "
                "NT, 3-nearest-neighbour profile NK, thickness line NL: "
                + "; ".join(f"{k} {100 * d['e']['NS']:.1f}, {100 * d['e']['NT']:.1f}, {100 * d['e']['NK']:.1f}, "
                            f"{100 * d['e']['NL']:.1f}%" for k, d in S.items()) + ".",
                "anode thickness (um)", "late gain at node 20", series)


if __name__ == "__main__":
    main()
