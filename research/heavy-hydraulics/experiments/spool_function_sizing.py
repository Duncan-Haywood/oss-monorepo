"""Milestone 5q: 5p's PVG 32 full-travel floor with each open-centre section sized once per
function (boom, arm, bucket, swing) instead of per actuator-phase.

A real valve section is chosen for the largest flow its function must pass, so light phases run on
an oversized spool whose full-travel floor is small. Functions are a reading of the phase names in
`physics_cycle.py` (dig = arm + bucket, lift/lower = boom, swing/swing_back = swing, dump = bucket),
not sourced. Rules: "envelope" sizes each function for the largest flow the model can ever give it
(single function at the full 45 L/min pump; the arm only works in dig, at half the dig flow);
"per cycle" sizes it for its largest demand in that cycle. Everything else is 2n/5p
(`spool_floor_synthetic.py`). Predictions F1 to F5 were written in LOG.md (5q) before this ran.
Stdlib, seeded.

    python3 experiments/spool_function_sizing.py   (writes spool_function_sizing_results.txt)
"""
import os
import random
import statistics

import spool_floor_synthetic as sf
from spool_floor_synthetic import pc, cycle_energy, W_PER_BAR_LPM, useful_power, crossing, TABLE, PN, ETA, LF, QSB, DPLS
from heavy_hydraulics.spool_floor import size_spool, floor_drop, oc_pressure

here = os.path.dirname(os.path.abspath(__file__))
FUNCS = {"dig": ("arm", "bucket"), "lift": ("boom",), "swing": ("swing",), "dump": ("bucket",),
         "swing_back": ("swing",), "lower": ("boom",)}
# largest flow the model can ask of each function: k <= 1.0 of the 45 L/min pump, dig shares 0.5/0.5
ENVELOPE = {"arm": 0.5 * pc.Q_PUMP, "bucket": pc.Q_PUMP, "boom": pc.Q_PUMP, "swing": pc.Q_PUMP}


def design_flows(c, rule):
    if rule == "envelope":
        return ENVELOPE
    d = {}
    for ph in c:
        for f, a in zip(FUNCS[ph.name], ph.actuators):
            d[f] = max(d.get(f, 0.0), a.flow)
    return d


def oc_work(c, rule, law="orifice", const=None):
    """Open-centre hydraulic energy of the moving phases (J, before eta) and the energy-weighted
    extra drop (bar*J). const: a constant drop in bar instead of the spool floor."""
    qd = design_flows(c, rule)
    e = wd = 0.0
    for ph in c:
        pmax = max(a.pressure for a in ph.actuators)
        if const is not None:
            p = pmax + const
        else:
            p = oc_pressure([(a.pressure, floor_drop(a.flow, size_spool(qd[f], TABLE), law))
                             for f, a in zip(FUNCS[ph.name], ph.actuators)])
        h = pc.Q_PUMP * p * W_PER_BAR_LPM * ph.seconds
        e += h
        wd += h * (p - pmax)
    return e, wd


def ratio(dp_ls, **kw):
    """As spool_floor_synthetic.ratio: (median, 5%, 95%, % LS worse, energy-weighted extra drop)."""
    out, num, den = [], 0.0, 0.0
    for s in pc.SEEDS:
        for i in range(600):
            rng = random.Random(s * 7919 + i)
            c, _, _, dpm = pc.one(rng)
            peak = max(useful_power(p) for p in c)
            t_idle = max(0.0, sum(useful_power(p) * p.seconds for p in c) / (LF * peak) - sum(p.seconds for p in c))
            p_i, q_i = rng.uniform(10, 25), rng.uniform(2, 8)
            ls = cycle_energy(c, "load_sensing", pump_flow=pc.Q_PUMP, dp_ls=dp_ls, dp_m=dpm, eta_pump=ETA)["shaft_J"]
            h, wd = oc_work(c, **kw)
            oc = h / ETA + pc.Q_PUMP * PN * W_PER_BAR_LPM * t_idle / ETA
            ls += (q_i * (p_i + dp_ls) + QSB * dp_ls) * W_PER_BAR_LPM * t_idle / ETA
            out.append(ls / oc)
            num, den = num + wd, den + h
    srt = sorted(out)
    q = lambda f: srt[min(len(srt) - 1, int(f * len(srt)))]  # noqa: E731
    return statistics.median(out), q(.05), q(.95), 100 * sum(x > 1 for x in out) / len(out), num / den


def breakeven(**kw):
    ys = [ratio(float(d), **kw)[0] for d in DPLS]
    return crossing(DPLS, ys), ys


def check():
    """Constant 6 bar reproduces 5p's constant path; per-cycle sizing never picks a smaller
    spool than per-phase sizing for any actuator (so its floor is never higher)."""
    c, *_ = pc.one(random.Random(7919))
    assert abs(oc_work(c, "cycle", const=6.0)[0] - sf.oc_work(c, None)[0]) < 1e-6
    for i in range(200):
        c, *_ = pc.one(random.Random(i))
        qd = design_flows(c, "cycle")
        for ph in c:
            for f, a in zip(FUNCS[ph.name], ph.actuators):
                assert size_spool(qd[f], TABLE)["rated"] >= size_spool(a.flow, TABLE)["rated"]
                assert size_spool(ENVELOPE[f], TABLE)["rated"] >= size_spool(qd[f], TABLE)["rated"]


def main():
    check()
    out = []
    p = out.append
    p(f"pump {pc.Q_PUMP:g} L/min; p_n {PN:.2f} bar; load factor {LF}; LS standby {QSB:g} L/min; eta {ETA}; "
      "3,000 cycles per cell, same cycles as 2n and 5p")
    p("envelope spools: " + ", ".join(f"{f} {size_spool(q, TABLE)['spool']} ({q:g} L/min)" for f, q in ENVELOPE.items()))
    res = {}
    for label, kw in [("per function, envelope, orifice", dict(rule="envelope")),
                      ("per function, envelope, power law", dict(rule="envelope", law="power")),
                      ("per function, per cycle, orifice", dict(rule="cycle")),
                      ("per function, per cycle, power law", dict(rule="cycle", law="power"))]:
        x, ys = breakeven(**kw)
        r14, r25 = ratio(14.0, **kw), ratio(25.0, **kw)
        res[label] = (x, r14, r25)
        p("")
        p(f"{label}: energy-weighted extra OC drop while moving {r14[4]:.2f} bar; break-even dp_ls = "
          + (f"{x:.1f} bar" if x else "none in range"))
        p("  " + " ".join(f"{d}:{y:.3f}" for d, y in zip(DPLS, ys)))
        for d, r in ((14, r14), (25, r25)):
            p(f"  dp_ls {d}: LS/OC median {r[0]:.3f} ({r[1]:.3f} to {r[2]:.3f}); LS worse in {r[3]:.1f}% of cycles")
    p("")
    p("constant open-centre drop while moving (bar) -> break-even dp_ls (bar)")
    cs, xs = [0, 1, 2, 3, 4, 5, 6, 8], []
    for cst in cs:
        x, _ = breakeven(rule="cycle", const=float(cst))
        xs.append(x)
        p(f"  {cst}: {x:.1f}")
    # drop at which break-even = 25 (linear interpolation on the sweep)
    d25 = next(cs[i] + (25 - xs[i]) * (cs[i + 1] - cs[i]) / (xs[i + 1] - xs[i])
               for i in range(len(cs) - 1) if xs[i] <= 25 <= xs[i + 1])
    p(f"  drop at which the break-even margin is 25 bar: {d25:.2f} bar "
      f"(slope {(xs[-1] - xs[0]) / (cs[-1] - cs[0]):.2f} bar of margin per bar of drop)")
    e = res["per function, envelope, orifice"]
    pc_ = res["per function, per cycle, orifice"]
    p("")
    p(f"F1 {'HOLDS' if e[0] and 21.5 <= e[0] <= 24.0 else 'REFUTED'} (envelope break-even 21.5 to 24.0: {e[0]:.1f})")
    p(f"F2 {'HOLDS' if 0.5 <= e[1][4] <= 2.5 else 'REFUTED'} (envelope extra drop 0.5 to 2.5 bar: {e[1][4]:.2f})")
    p(f"F3 {'HOLDS' if min(e[0], 26.5) < pc_[0] < max(e[0], 26.5) else 'REFUTED'} "
      f"(per-cycle break-even strictly between {e[0]:.1f} and 26.5: {pc_[0]:.1f})")
    p(f"F4 {'HOLDS' if e[2][0] > 1 and e[1][0] < 0.9 else 'REFUTED'} "
      f"(envelope LS/OC > 1 at 25 bar: {e[2][0]:.3f}; < 0.9 at 14 bar: {e[1][0]:.3f})")
    p(f"F5 {'HOLDS' if 3 <= d25 <= 4.5 else 'REFUTED'} (drop for a 25 bar break-even 3 to 4.5 bar: {d25:.2f})")
    return "\n".join(out)


if __name__ == "__main__":
    text = main()
    print(text)
    with open(os.path.join(here, "spool_function_sizing_results.txt"), "w") as fh:
        fh.write(text + "\n")
