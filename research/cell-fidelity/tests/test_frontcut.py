import importlib.util
import math
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "frontcut"
spec = importlib.util.spec_from_file_location("frontcut_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


def _row(j, f, u, rkt, t100=100.0):
    wh = [f(n) for n in range(1, 101)]
    return dict(j=j, wh=wh, m=1.0, score=wh[99], t100=t100, u=u, rkt=rkt)


def _pool():
    # designs 0-3: high energy U, fade fast; 4: low U, high r_kt, fades slowest (the 100-cycle best);
    # 5 and 6: salt-starved (r_kt far below 0), lead at cycle 10 only on paper
    rows = [_row(j, lambda n, j=j: 20 + j - 1.2 * math.sqrt(n), u=200 + j, rkt=0.1 + 0.01 * j) for j in range(4)]
    rows.append(_row(4, lambda n: 15 - 0.1 * math.sqrt(n), u=150, rkt=0.5))
    rows.append(_row(5, lambda n: 30 - 2.5 * math.sqrt(n), u=260, rkt=-0.6))
    rows.append(_row(6, lambda n: 9.0, u=255, rkt=-0.3))
    return rows


def test_floor_drops_starved_designs_and_keeps_the_answer():
    rows = _pool()
    gap, picked, t, keep = run.floor_union(rows, tau=-0.2, m=1)
    assert keep == [0, 1, 2, 3, 4]
    assert gap == 0.0 and 4 in picked
    # five designs to cycle 10 (k/100 charge), two resumed to 100
    assert abs(t - (5 * 10 + 2 * 90)) < 1e-9
    _, _, t2, _ = run.floor_union(rows, tau=-0.2, m=1, t_pred=0.5)
    assert abs(t2 - t - 0.5 * len(rows)) < 1e-9   # r_kt charged on every design, kept or not


def test_floor_at_minus_infinity_is_the_union_screen():
    rows = _pool()
    g, p, t, keep = run.floor_union(rows, tau=-math.inf)
    gu, pu, tu = run.N.union_screen(rows)
    assert keep == list(range(len(rows))) and (g, sorted(p), t) == (gu, pu, tu)


def test_front_cut_loses_the_low_energy_slow_fader():
    # a high-U, high-r_kt design that fades fast dominates the best design (4) in (U, r_kt), so a 1-layer cut drops it
    rows = _pool()
    rows.append(_row(7, lambda n: 25 - 2.0 * math.sqrt(n), u=210, rkt=0.6))
    assert run.layer_of(rows, 4) > 1
    g, _, _, keep = run.cut_union(rows, layers=1)
    assert 4 not in keep and g > 0


def test_verdicts_follow_the_registered_bars():
    def c(gap, t, ugap, ut, rkt):
        return dict(floor=dict(gap=gap, t_ratio=t), union=dict(gap=ugap, t_ratio=ut), best_rkt=rkt)
    v = run.verdicts({"a": c(0.0, 0.1, 0.0, 0.2, 0.1), "b": c(0.005, 0.15, 0.0, 0.2, -0.1)})
    assert v == dict(H92="supported", H93="supported", H94="supported", H95="mixed")
    v = run.verdicts({"a": c(0.04, 0.2, 0.0, 0.2, -0.3)})
    assert v == dict(H92="refuted", H93="refuted", H94="refuted", H95="refuted")
