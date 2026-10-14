"""Thermostat gate vs fixed states vs an oracle schedule when the room temperature steps once.
The two-node model is in ../garment-twonodeoptics (its `env` callback gives the changing room); the gate is
`garment-twonodeswitch`'s."""
import itertools, os, sys
_here = os.path.dirname(__file__)
for p in ("garment-twonodeoptics", "garment-twonodeswitch"):
    sys.path.insert(0, os.path.join(_here, "..", "..", "..", p, "src"))
from garment_twonodeoptics import flex  # noqa: E402
from garment_twonodeswitch import switch as sw  # noqa: E402

OURS, REF, CLOSED, OPEN, Gate = sw.OURS, sw.REF, sw.CLOSED, sw.OPEN, sw.Gate
NEUTRAL_TSK = 33.7                     # the model's neutral skin temperature
SCENARIOS = {"hot->cool": (31.0, 16.0), "cool->hot": (16.0, 31.0), "mild->hot": (24.0, 31.0), "hot->mild": (31.0, 24.0)}


def simulate(ta0, ta1, opts, gate, minutes=180, step=90):
    """Run the person (1.2 met, 0.5 clo, 50% rh, 0.1 m/s) in a room that jumps from ta0 to ta1 at `step`.
    `gate(minute, tsk, tcr)` gives the transmittance. Returns (end state, trace of (minute, tau, tsk, tcr))."""
    tr = []
    r = flex.run(1.2, 0.5, ta0, 50, v=0.1, opts=opts, minutes=minutes, gate=gate, trace=tr,
                 env=lambda m: ta0 if m < step else ta1)
    return r, tr


def discomfort(trace):
    """Proxy, not a comfort index: mean |skin temperature - 33.7 C| over the run, in C."""
    return sum(abs(t - NEUTRAL_TSK) for _, _, t, _ in trace) / len(trace)


def fixed(tau):
    return lambda m, tsk, tcr: tau


def schedule(t0, t1, step=90):
    return lambda m, tsk, tcr: t0 if m < step else t1


def oracle(ta0, ta1, opts):
    """Best of the four open/closed schedules (one choice per phase, known in advance, no lag)."""
    best = None
    for t0, t1 in itertools.product((CLOSED, OPEN), repeat=2):
        _, tr = simulate(ta0, ta1, opts, schedule(t0, t1))
        d = discomfort(tr)
        if best is None or d < best[0]:
            best = (d, t0, t1)
    return best
