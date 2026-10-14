"""Thermostat gate vs fixed states vs an oracle schedule when the metabolic rate steps once (rest <-> walking).
The two-node model is in ../garment-twonodeoptics (its `met_fn` callback gives the changing activity); the gate is
`garment-twonodeswitch`'s; scoring and the oracle follow `garment-twonodestep`."""
import itertools, os, sys
_here = os.path.dirname(__file__)
for p in ("garment-twonodeoptics", "garment-twonodeswitch"):
    sys.path.insert(0, os.path.join(_here, "..", "..", "..", p, "src"))
from garment_twonodeoptics import flex  # noqa: E402
from garment_twonodeswitch import switch as sw  # noqa: E402

OURS, REF, CLOSED, OPEN, Gate = sw.OURS, sw.REF, sw.CLOSED, sw.OPEN, sw.Gate
NEUTRAL_TSK = 33.7
# (room air temperature C, met before, met after); the step is at minute 90 of 180
SCENARIOS = {"rest->walk 20C": (20.0, 1.0, 2.0), "rest->walk 24C": (24.0, 1.0, 2.0),
             "rest->walk 28C": (28.0, 1.0, 2.0), "walk->rest 24C": (24.0, 2.0, 1.0)}


def simulate(ta, m0, m1, opts, gate, minutes=180, step=90):
    """0.5 clo, 50% rh, 0.1 m/s, constant room `ta`; metabolic rate m0 then m1 from minute `step`.
    Returns (end state, trace of (minute, tau, tsk, tcr))."""
    tr = []
    r = flex.run(m0, 0.5, ta, 50, v=0.1, opts=opts, minutes=minutes, gate=gate, trace=tr,
                 met_fn=lambda m: m0 if m < step else m1)
    return r, tr


def discomfort(trace):
    """Proxy, not a comfort index: mean |skin temperature - 33.7 C| over the run, in C."""
    return sum(abs(t - NEUTRAL_TSK) for _, _, t, _ in trace) / len(trace)


def fixed(tau):
    return lambda m, tsk, tcr: tau


def schedule(t0, t1, step=90):
    return lambda m, tsk, tcr: t0 if m < step else t1


def oracle(ta, m0, m1, opts):
    """Best of the four open/closed schedules (one choice per phase, known in advance, no lag)."""
    best = None
    for t0, t1 in itertools.product((CLOSED, OPEN), repeat=2):
        d = discomfort(simulate(ta, m0, m1, opts, schedule(t0, t1))[1])
        if best is None or d < best[0]:
            best = (d, t0, t1)
    return best
