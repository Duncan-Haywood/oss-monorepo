"""Sweep accel-plane's three engines over P = 1..32 on the iCE40 UP5K, with and without DSP mapping.

    python3 experiments/run.py      # about 6 min; writes results.json and results.txt
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from accel_planefpga import flow  # noqa: E402

PS = (1, 2, 4, 8, 16, 32)


def main():
    rows = []
    for eng in flow.ENGINES:
        for p in PS:
            for dsp in (False, True):
                r = flow.run(eng, p, dsp)
                r.update(eng=eng, p=p, dsp=dsp, cycles=flow.cycles(eng, p), wrapper_luts=flow.wrapper_luts(eng, p))
                rows.append(r)
                print(eng, p, dsp, r.get("pnr_lc"), r.get("pnr_dsp"), r.get("fmax"), flush=True)
    json.dump({"tool": "Yosys synth_ice40 + nextpnr-ice40, UP5K sg48, 60 MHz target, seeds 1-3, median Fmax", "rows": rows},
              open(os.path.join(HERE, "results.json"), "w"), indent=1)
    lines = ["eng |  P | DSP-map | cycles | LC  | DSP | Fmax MHz | latency us | fits"]
    for r in rows:
        if r["fits"]:
            lat = r["cycles"] / r["fmax"]
            lines.append(f"{r['eng']:3} | {r['p']:2} | {'yes' if r['dsp'] else 'no ':3}     | {r['cycles']:6} | {r['pnr_lc']:4}"
                         f" | {r['pnr_dsp']:2}  | {r['fmax']:7.1f}  | {lat:9.1f}  | yes")
        else:
            lines.append(f"{r['eng']:3} | {r['p']:2} | {'yes' if r['dsp'] else 'no ':3}     | {r['cycles']:6} |  -   |  -  |    -     |     -      | no: {r['why']}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
