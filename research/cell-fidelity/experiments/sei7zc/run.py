"""Milestone 7zc: 7zb's SEI-only drift ladder with the SEI film resistance switched off.

    WORKERS=3 OMP_NUM_THREADS=1 python experiments/sei7zc/run.py control  # wrapper with nothing changed vs 7p's probe
    WORKERS=3 OMP_NUM_THREADS=1 python experiments/sei7zc/run.py probe    # plating off, film resistance off, 7 g x 4 designs
    python experiments/sei7zc/run.py choose                              # 7zb's SEI probe rule -> choose.json (stdlib)
    WORKERS=3 OMP_NUM_THREADS=1 python experiments/sei7zc/run.py bench    # the kept condition, 56 designs to cycle 100
    python experiments/sei7zc/run.py rows                                # 7p's rows code via 7r
    python experiments/sei7zc/run.py report                              # 7r's report, 7za's rules, H367 to H371

7zb found that no SEI solvent-diffusivity multiplier g makes plating-free Marquis2019@2x fade like the committed sets:
the film's resistance (Marquis2019's 2e5 Ohm m) ends each charge at the voltage cut-off before lithium loss reaches the
band, so the cell fails by impedance. This step changes one thing: the SEI resistivity is multiplied by RHO (0, fixed in
the plan), so the film still consumes lithium but adds no resistance. Everything else, ladder, probe rule, bench, rows,
rules and hypotheses, is 7zb's code run from this directory. Plan in ../../LOG.md (7zc plan).
"""
import importlib.util
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
RHO_KEY = "SEI resistivity [Ohm.m]"
RHO = 0.0                                        # fixed in the plan: film resistance off


def _mod(name, path):
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


B = _mod("sei7zb_run", EXP / "sei7zb" / "run.py")
B.HERE = HERE                                    # every 7zb command reads and writes this directory


def scaled(pv, g, control=B.CONTROL):
    """7zb's lever (plating exchange current x 0, SEI solvent diffusivity x g) plus SEI resistivity x RHO. Pure on a
    dict-like parameter set, so it is tested without PyBaMM. g == control leaves everything as shipped."""
    if g == control:
        return pv
    v = pv[B.PL_KEY]
    pv.update({B.PL_KEY: (lambda c_e, c_Li, T, _v=v: 0.0 * _v(c_e, c_Li, T)) if callable(v) else 0.0})
    pv.update({B.SEI_KEY: g * float(pv[B.SEI_KEY]), RHO_KEY: RHO * float(pv[RHO_KEY])})
    return pv


def child(job, cycles):
    c, j, x, g = job
    D = B._mod("depth_run", EXP / "depth" / "run.py")
    D.CYCLES = cycles
    fc = D.B._fc()
    TR = fc.G.TR
    orig = TR.params

    def params(xx, s, _o=orig):
        pv, copied, cur = _o(xx, s)
        return scaled(pv, g), copied, cur

    TR.params = params
    D.B._fc = lambda: fc
    out = D.simulate((c, j, x))
    out["mult"] = g
    return out


def report():
    B.report()
    s = json.loads((HERE / "summary.json").read_text())
    V = s.pop("verdicts_7zb")                    # same tests, renumbered for this step
    s["verdicts_7zc"] = {f"H{int(k[1:]) + 5}": v for k, v in V.items()}
    s["extra_7zc"] = s.pop("extra_7zb")
    s["rho_mult"] = RHO
    (HERE / "summary.json").write_text(json.dumps(s, indent=1, default=str) + "\n")
    with (HERE / "results.txt").open("a") as fh:
        fh.write(f"\n7zc: SEI resistivity x {RHO:g}; the H362 to H366 lines above are this step's H367 to H371 "
                 f"(same tests): " + ", ".join(f"{k} {v}" for k, v in s["verdicts_7zc"].items()) + "\n")
    print(s["verdicts_7zc"])


if __name__ == "__main__":
    if sys.argv[1] == "child":
        B._point_here()
        print(json.dumps(child(json.loads(sys.argv[2]), int(sys.argv[3]))))
    else:
        {"control": B.control, "probe": B.probe, "choose": B.choose_cmd, "bench": B.bench, "rows": B.rows,
         "report": report}[sys.argv[1]]()
