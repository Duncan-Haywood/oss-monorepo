"""Experiments for robofab-cell-fescsweep: where the decomposition's error peaks as inspection speed varies.

Same cell as robofab-cell-fesc (load 2 min, unload 2 min, one inspector, Erlang-4 print time), but the
inspection time is swept from 0.1 to 100 min. For each cell the knee t* = 1 / H(N) is the inspection time at
which the inspector alone matches the arm-and-printers subsystem's full-population rate H(N). Deterministic.
"""
import json, pathlib, sys
import numpy as np
here = pathlib.Path(__file__).parent
sys.path.insert(0, str(here.parent / "src"))
from robofab_cell_fescsweep.ctmc import throughput
from robofab_cell_fescsweep.fesc import fesc_rate, subsystem_rate

LOAD, UNLOAD, K = 2.0, 2.0, 4
INSP = [0.1, 0.3, 0.6, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 30, 40, 60, 100]
lines = []
def say(s=""):
    lines.append(s); print(s)

say("Percent error of the decomposition against the exact chain as the inspection time varies (Erlang-4 print).")
say("t* = 1/H(N): inspection time at which the inspector alone caps the cell at the subsystem's rate H(N).\n")
cells, out = [], []
for tp in (20, 60):
    for P in (2, 4, 6):
        for N in sorted({P + 2, 2 * P}):
            H = subsystem_rate(N, P, K, tp, LOAD, UNLOAD)[0]
            tstar = 1.0 / H
            errs = []
            for ti in INSP:
                e = throughput(N, P, K, tp, LOAD, UNLOAD, ti)[0]
                f = fesc_rate(N, P, K, tp, LOAD, UNLOAD, ti)[0]
                errs.append(100 * (f - e) / e)
            errs = np.array(errs)
            j = int(np.argmin(errs))
            cell = dict(print=tp, P=P, N=N, H=60 * H, tstar=tstar, insp=INSP, err=errs.tolist(),
                        peak_err=float(errs[j]), peak_insp=INSP[j], peak_ratio=INSP[j] / tstar,
                        max_over=float(errs.max()), err_fast=float(errs[0]), err_slow=float(errs[-1]))
            out.append(cell)
            say(f"print {tp:2d} P={P} N={N:2d}  H(N) {60*H:6.2f}/h  t* {tstar:5.1f} min  peak error {errs[j]:+5.2f}% at inspect {INSP[j]:>4} min "
                f"(= {INSP[j]/tstar:4.2f} t*)  error at 0.1 min {errs[0]:+.3f}%, at 100 min {errs[-1]:+.3f}%, largest positive {errs.max():+.3f}%")
say()
peak = np.array([c["peak_err"] for c in out]); ratio = np.array([c["peak_ratio"] for c in out])
say(f"{len(out)} cells: peak error {peak.min():+.2f}% to {peak.max():+.2f}% (mean {peak.mean():+.2f}%); "
    f"peak at {ratio.min():.2f} to {ratio.max():.2f} t* (median {np.median(ratio):.2f}); "
    f"|error| at 0.1 min <= {max(abs(c['err_fast']) for c in out):.3f}%, at 100 min <= {max(abs(c['err_slow']) for c in out):.3f}%; "
    f"largest positive error anywhere {max(c['max_over'] for c in out):+.3f}%")
(here / "results.txt").write_text("\n".join(lines) + "\n")
(here / "results.json").write_text(json.dumps(dict(cells=out), indent=1))
