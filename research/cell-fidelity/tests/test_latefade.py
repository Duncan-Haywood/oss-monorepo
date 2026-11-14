import importlib.util
import math
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "latefade"
spec = importlib.util.spec_from_file_location("latefade_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


def _row(j, f, t100=100.0):
    wh = [f(n) for n in range(1, 101)]
    return dict(j=j, wh=wh, m=1.0, score=wh[99], t100=t100)


def test_lsq_recovers_a_line():
    a, b = run.lsq([1, 2, 3, 4], [3, 5, 7, 9])
    assert abs(a - 1) < 1e-12 and abs(b - 2) < 1e-12


def test_sqrt_extrapolation_is_exact_on_a_sqrt_fade_curve():
    curve = [20 - 0.5 * math.sqrt(n) for n in range(1, 101)]
    assert abs(run.extrapolate(curve) - curve[99]) < 1e-9
    log_curve = [20 - 0.5 * math.log(n) for n in range(1, 101)]
    assert abs(run.extrapolate(log_curve, form="log") - log_curve[99]) < 1e-9


def test_union_keeps_a_design_that_starts_low_and_fades_slowly():
    # designs 0-3 lead at cycle 10 but fade fast; design 4 starts lowest and fades slowest, so it wins at cycle 100
    rows = [_row(j, lambda n, j=j: 20 + j - 1.2 * math.sqrt(n)) for j in range(4)]
    rows.append(_row(4, lambda n: 15 - 0.1 * math.sqrt(n)))
    rows.append(_row(5, lambda n: 10.0))
    fixed_gap, _, _ = run.H.fixed(rows, 10, 3)
    assert fixed_gap > 0
    gap, picked, t = run.union_screen(rows, m=1)
    assert gap == 0.0 and 4 in picked and 3 in picked and len(picked) == 2
    # every design to cycle 10 (k/100 charge), the two picked to 100
    assert abs(t - (6 * 10 + 2 * 90)) < 1e-9


def test_verdicts_follow_the_registered_bars():
    C = {"Ai2020@0.275x": dict(gap=0.0, t_ratio=0.28, rho_raw10=0.3, rho_ext10=0.7, ladder=dict(gap=0.02)),
         "Ai2020@0.35x": dict(gap=0.005, t_ratio=0.25, rho_raw10=0.6, rho_ext10=0.8, ladder=dict(gap=0.0)),
         "NCA_Kim2011@1.25x": dict(gap=0.0, t_ratio=0.2, rho_raw10=0.95, rho_ext10=-0.5, ladder=dict(gap=0.0))}
    v = run.verdicts(C, ["Ai2020@0.275x", "Ai2020@0.35x"])
    assert v == dict(H87="supported", H88="supported", H89="supported", H90="mixed", H91="supported")
    C["Ai2020@0.35x"]["gap"] = 0.04
    assert run.verdicts(C, ["Ai2020@0.275x", "Ai2020@0.35x"])["H87"] == "refuted"
