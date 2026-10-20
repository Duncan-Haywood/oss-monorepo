"""A rig of cameras that record only on a trigger: one detector per camera, or detectors shared over the rig.

Builds on capture-trigger (one camera, one trigger). Here N cameras film the same events. A strategy says which
cameras run a detector and whether a firing detector wakes the others over a radio. Events arrive as a Poisson
process; a detector misses an event with probability `miss`, of which a share `common` is shared by every detector
(a quiet subject that nothing hears) and the rest is independent per detector. All device figures are ASSUMED
(see README). Standard library only.
"""
import random
from dataclasses import dataclass

DAY_H = 16.0


@dataclass(frozen=True)
class Mode:
    name: str
    idle_w: float
    rec_w: float
    latency_s: float         # wake -> recording starts
    preroll_s: float         # seconds back-filled from a buffer


@dataclass(frozen=True)
class Trigger:
    delay_s: float = 1.0
    miss: float = 0.1        # marginal probability one detector misses an event
    common: float = 0.0      # probability of a miss that every detector shares (0 <= common <= miss)
    false_per_h: float = 2.0
    hold_s: float = 15.0
    radio_s: float = 0.5     # a firing detector -> another camera's wake line


@dataclass(frozen=True)
class Strategy:
    name: str
    detectors: tuple         # indices of cameras that run a detector
    shared: bool             # a fire wakes every camera (False: each camera records on its own detector only)
    modes: tuple             # one Mode per camera


STBY = Mode("standby + pre-roll", 0.9, 5.0, 2.0, 10.0)
SLEEP = Mode("sleep", 0.15, 5.0, 6.0, 0.0)


def strategies(n):
    return [
        Strategy("independent", tuple(range(n)), False, (STBY,) * n),
        Strategy("sentinel + sleepers", (0,), True, (STBY,) + (SLEEP,) * (n - 1)),
        Strategy("sentinel + standby", (0,), True, (STBY,) * n),
        Strategy("any-of-N + standby", tuple(range(n)), True, (STBY,) * n),
    ]


def independent_miss(trig):
    """Per-detector miss probability once the shared (common) part is taken out."""
    if trig.common >= 1.0:
        return 0.0
    return max(0.0, (trig.miss - trig.common) / (1.0 - trig.common))


def p_detect(trig, k):
    """Probability that at least one of k detectors fires on an event."""
    return (1.0 - trig.common) * (1.0 - independent_miss(trig) ** k)


def radio_hop(st, j, trig):
    """Extra seconds before camera j hears of a fire: none for a sole detector or an unshared camera."""
    if not st.shared or st.detectors == (j,):
        return 0.0
    return trig.radio_s


def expected(st, trig, events_per_h, event_s, day_h=DAY_H):
    """Closed form for non-overlapping events: (rig Wh, mean per-camera captured share, mean recording hours)."""
    n = len(st.modes)
    k = 1 if not st.shared else len(st.detectors)
    pd = p_detect(trig, 1 if not st.shared else k)
    false_rate = trig.false_per_h * (len(st.detectors) if st.shared else 1)
    wh = share = rec = 0.0
    for j, m in enumerate(st.modes):
        x = radio_hop(st, j, trig)
        head = min(max(0.0, trig.delay_s + x + m.latency_s - m.preroll_s), event_s)
        s = pd * (event_s - head) / event_s
        per_event = pd * (event_s - head + trig.hold_s)
        per_false = trig.hold_s + x + m.latency_s
        rec_h = min(day_h, day_h * (events_per_h * per_event + false_rate * per_false) / 3600.0)
        wh += m.rec_w * rec_h + m.idle_w * (day_h - rec_h)
        share += s
        rec += rec_h
    return wh, share / n, rec / n


def simulate(st, trig, events_per_h, event_s, seed, day_h=DAY_H):
    """One day at 1 s: (rig Wh, mean per-camera share, share of event seconds on every camera, on at least one)."""
    rng = random.Random(seed)
    n_s = int(day_h * 3600)
    n = len(st.modes)
    spans = []
    t = rng.expovariate(events_per_h / 3600.0) if events_per_h > 0 else n_s
    while t < n_s:
        d = max(3.0, rng.gauss(event_s, event_s * 0.25))
        spans.append((int(t), min(n_s, int(t + d))))
        t += d + rng.expovariate(events_per_h / 3600.0)
    event = [False] * n_s
    for a, b in spans:
        for i in range(a, b):
            event[i] = True
    rec = [[False] * n_s for _ in range(n)]

    def record(j, a, b):
        for i in range(max(0, a), min(n_s, b)):
            rec[j][i] = True

    mi = independent_miss(trig)
    for a, b in spans:
        hard = rng.random() < trig.common
        fires = [(not hard) and rng.random() >= mi for _ in st.detectors]
        for j, m in enumerate(st.modes):
            if st.shared:
                if not any(fires):
                    continue
            elif j not in st.detectors or not fires[st.detectors.index(j)]:
                continue
            x = radio_hop(st, j, trig)
            record(j, int(a + trig.delay_s + x + m.latency_s - m.preroll_s), int(b + trig.hold_s))
    for di, d in enumerate(st.detectors):
        k = rng.expovariate(trig.false_per_h / 3600.0) if trig.false_per_h > 0 else n_s
        while k < n_s:
            for j, m in enumerate(st.modes):
                if st.shared or j == d:
                    x = radio_hop(st, j, trig)
                    record(j, int(k + x + m.latency_s - m.preroll_s), int(k + x + m.latency_s + trig.hold_s))
            k += rng.expovariate(trig.false_per_h / 3600.0)
    ev = sum(event)
    wh = sum(m.rec_w * sum(rec[j]) + m.idle_w * (n_s - sum(rec[j])) for j, m in enumerate(st.modes)) / 3600.0
    if not ev:
        return wh, 1.0, 1.0, 1.0
    per = [sum(1 for i in range(n_s) if event[i] and rec[j][i]) / ev for j in range(n)]
    every = sum(1 for i in range(n_s) if event[i] and all(rec[j][i] for j in range(n))) / ev
    anyc = sum(1 for i in range(n_s) if event[i] and any(rec[j][i] for j in range(n))) / ev
    return wh, sum(per) / n, every, anyc


def mean_sim(st, trig, events_per_h, event_s, seeds):
    rs = [simulate(st, trig, events_per_h, event_s, s) for s in seeds]
    return tuple(sum(r[k] for r in rs) / len(rs) for k in range(4))


def packs_needed(energy_wh, per_pack_wh=99.0):
    """Whole packs (each under the 100 Wh carry-on limit) if the rig's energy is split across packs."""
    full, rem = divmod(energy_wh, per_pack_wh)
    return int(full) + (1 if rem > 1e-9 else 0)
