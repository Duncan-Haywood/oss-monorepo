"""Trigger-based recording against continuous recording, on a synthetic day.

A camera either records all the time, or sleeps/idles and records when a trigger fires. Interesting moments
(events) arrive as a Poisson process; each has a duration. The trigger detects an event after a delay, misses it
with some probability, and fires false alarms at a fixed rate. Standby with a pre-roll buffer can back-fill the
seconds before the trigger; deep sleep cannot, and wakes slowly. All device figures are ASSUMED (see README).
Standard library only.
"""
import random
from dataclasses import dataclass

DAY_H = 16.0                 # waking hours filmed
CARRY_ON_WH = 100.0          # per-battery carry-on limit used across track 13


@dataclass(frozen=True)
class Mode:
    name: str
    idle_w: float            # draw while not recording
    rec_w: float             # draw while recording
    latency_s: float         # trigger fires -> recording starts
    preroll_s: float         # seconds before the recording start that are back-filled from a buffer
    triggered: bool = True


@dataclass(frozen=True)
class Trigger:
    delay_s: float = 1.0     # event start -> trigger fires
    miss: float = 0.1        # probability an event is not detected at all
    false_per_h: float = 2.0
    hold_s: float = 15.0     # keep recording this long after the last trigger


# Assumed figures, labelled as such in the README.
MODES = [
    Mode("continuous", 5.0, 5.0, 0.0, 0.0, triggered=False),
    Mode("sleep + trigger", 0.15, 5.0, 6.0, 0.0),
    Mode("standby + pre-roll", 0.9, 5.0, 2.0, 10.0),
]


def lost_head_s(mode, trig):
    """Seconds at the start of a detected event that no recording covers."""
    return max(0.0, trig.delay_s + mode.latency_s - mode.preroll_s)


def expected(mode, trig, events_per_h, event_s, day_h=DAY_H):
    """Closed form: (energy Wh, captured share of event seconds, recording hours). Events assumed non-overlapping."""
    if not mode.triggered:
        return mode.rec_w * day_h, 1.0, day_h
    head = min(lost_head_s(mode, trig), event_s)
    share = (1.0 - trig.miss) * (event_s - head) / event_s
    rec_s_per_event = (1.0 - trig.miss) * (event_s - head + trig.hold_s)
    rec_s_per_false = trig.hold_s + mode.latency_s
    rec_h = day_h * (events_per_h * rec_s_per_event + trig.false_per_h * rec_s_per_false) / 3600.0
    rec_h = min(rec_h, day_h)
    energy = mode.rec_w * rec_h + mode.idle_w * (day_h - rec_h)
    return energy, share, rec_h


def simulate(mode, trig, events_per_h, event_s, seed, day_h=DAY_H):
    """One synthetic day at 1 s resolution: (energy Wh, captured share of event seconds, recording hours)."""
    rng = random.Random(seed)
    n = int(day_h * 3600)
    event = [False] * n
    spans = []
    t = rng.expovariate(events_per_h / 3600.0) if events_per_h > 0 else n
    while t < n:
        d = max(3.0, rng.gauss(event_s, event_s * 0.25))
        spans.append((int(t), min(n, int(t + d))))
        t += d + rng.expovariate(events_per_h / 3600.0)
    for a, b in spans:
        for i in range(a, b):
            event[i] = True
    rec = [False] * n
    if not mode.triggered:
        rec = [True] * n
    else:
        def record(a, b):
            for i in range(max(0, a), min(n, b)):
                rec[i] = True
        for a, b in spans:
            if rng.random() < trig.miss:
                continue
            fire = a + trig.delay_s
            record(int(fire + mode.latency_s - mode.preroll_s), int(b + trig.hold_s))
        k = rng.expovariate(trig.false_per_h / 3600.0) if trig.false_per_h > 0 else n
        while k < n:
            record(int(k + mode.latency_s - mode.preroll_s), int(k + mode.latency_s + trig.hold_s))
            k += rng.expovariate(trig.false_per_h / 3600.0)
    ev = sum(event)
    got = sum(1 for i in range(n) if event[i] and rec[i])
    rec_s = sum(rec)
    energy = mode.rec_w * rec_s / 3600.0 + mode.idle_w * (n - rec_s) / 3600.0
    return energy, (got / ev if ev else 1.0), rec_s / 3600.0


def mean_sim(mode, trig, events_per_h, event_s, seeds):
    rs = [simulate(mode, trig, events_per_h, event_s, s) for s in seeds]
    return tuple(sum(r[k] for r in rs) / len(rs) for k in range(3))


def breakeven_rate(mode, trig, event_s, day_h=DAY_H):
    """Events per hour at which this mode's energy equals continuous recording's (None if it never does)."""
    cont = expected(MODES[0], trig, 0.0, event_s, day_h)[0]
    lo, hi = 0.0, 3600.0 / event_s
    if expected(mode, trig, hi, event_s, day_h)[0] < cont:
        return None
    for _ in range(60):
        mid = (lo + hi) / 2
        if expected(mode, trig, mid, event_s, day_h)[0] < cont:
            lo = mid
        else:
            hi = mid
    return lo


def packs_needed(energy_wh):
    """Whole 99 Wh packs (each under the carry-on limit) to carry for one day of this energy."""
    full, rem = divmod(energy_wh, 99.0)
    return int(full) + (1 if rem > 1e-9 else 0)
