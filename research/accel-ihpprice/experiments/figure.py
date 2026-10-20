"""Write experiments/thresholds.svg: the weight-fetch cost (in idle-flop-cycles) that ungated and gated WS need, against
the packed SRAM macros of IHP SG13G2 and SKY130, as a function of batch B on the 64x70 layer. From results.json only.

    python experiments/figure.py
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

R = json.loads((HERE / "results.json").read_text())


def main():
    pts = [m for m in R["min_e_weight"] if m["shape"] == "L1 64x70"]
    bs = [p["B"] for p in pts]
    e_flop, e_icg = R["e_flop_pj"], R["e_icg_pj"]
    g24 = [(e_icg / 24 + R["points"][1]["flop_leak_pj"]) / p["ratio"] / e_flop for p in pts]
    ihp = [m["packed_flop_cycles"] for m in R["macros"]]
    sky = R["sky130_packed_flop_cycles"]
    flat = lambda v: [v] * len(bs)
    series = [
        ("ungated WS needs more than", bs, [p["ungated_flop_cycles"] for p in pts]),
        ("gate per 24 flops needs more than", bs, g24),
        ("IHP packed macros, dearest", bs, flat(max(ihp))),
        ("IHP packed macros, cheapest", bs, flat(min(ihp))),
    ]
    sky_note = f"SKY130 packed macros span {min(sky):.0f} to {max(sky):.0f}, below every IHP macro"
    write_lines(HERE, "thresholds.svg", "Weight fetch cost WS needs, in idle-flop-cycles (IHP SG13G2, 64x70 layer)",
                "Line plot against batch size B: the cost of one packed 4-bit weight fetch, in idle flop clock cycles, that "
                "ungated and clock-gated weight-stationary scheduling need to beat output-stationary, with the cheapest and "
                "dearest IHP SG13G2 packed SRAM macro as flat lines. " + sky_note,
                "batch B", "weight fetch, in idle-flop-cycles", series, logx=True, logy=True)


if __name__ == "__main__":
    main()
