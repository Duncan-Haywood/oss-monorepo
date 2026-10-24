"""Where to put the sentinel camera in a ring when the subject has a favourite facing direction.

Builds on capture-wake (one sentinel wakes the rest; misses assumed independent between detectors). Here the miss
rate of a detector depends on the angle between the way the subject faces and the way the camera looks back at them:
a camera in front of the subject sees the face and mouth (low miss), one behind sees a back (high miss). The
subject's facing at each moment is von Mises distributed around a favourite direction (a view, a landmark, the
direction of travel). That makes misses CORRELATED across cameras, which capture-wake assumed away. All figures are
ASSUMED (see README). Standard library only.
"""
import math
import random
from dataclasses import dataclass

DAY_H = 16.0


@dataclass(frozen=True)
class Detector:
    miss_front: float = 0.03     # miss probability when the subject faces the camera
    miss_back: float = 0.40      # ... and when the subject faces directly away


@dataclass(frozen=True)
class ZoneDetector:
    """Miss probability in three zones of the angle between the subject's facing and the camera.

    Measured detector recall (capture-detectors section F) has two bins, near-frontal and turned, so the curve is a
    step: `miss_front` up to `front_deg`, `miss_turned` up to `away_deg`, `miss_away` beyond. How a landmark turn
    proxy maps to a body angle is not measured, so front_deg and miss_away are swept, not fitted.
    """
    miss_front: float
    miss_turned: float
    miss_away: float
    front_deg: float = 45.0
    away_deg: float = 120.0


def ring_angles(n):
    """Camera azimuths (degrees) around the subject, camera 0 at the favourite facing direction."""
    return [360.0 * i / n for i in range(n)]


def miss_at(det, delta_rad):
    """Miss probability for a camera whose bearing is delta_rad away from the subject's facing direction."""
    if isinstance(det, ZoneDetector):
        d = abs(math.degrees(math.atan2(math.sin(delta_rad), math.cos(delta_rad))))
        return det.miss_front if d <= det.front_deg else det.miss_turned if d <= det.away_deg else det.miss_away
    return det.miss_front + (det.miss_back - det.miss_front) * (1.0 - math.cos(delta_rad)) / 2.0


def bessel_ratio(kappa):
    """A(kappa) = I1/I0, the mean cosine of a von Mises angle, by power series."""
    if kappa <= 0:
        return 0.0
    i0 = i1 = 0.0
    term0, term1 = 1.0, kappa / 2.0
    for m in range(200):
        i0 += term0
        i1 += term1
        term0 *= (kappa / 2.0) ** 2 / ((m + 1) ** 2)
        term1 *= (kappa / 2.0) ** 2 / ((m + 1) * (m + 2))
    return i1 / i0


def expected_miss(det, cam_deg, kappa):
    """Mean miss probability of one camera, averaged over the subject's facing (closed form; numerical for zones)."""
    if isinstance(det, ZoneDetector):
        xs, ws = facing_grid(kappa)
        return sum(w * miss_at(det, x - math.radians(cam_deg)) for x, w in zip(xs, ws))
    a = bessel_ratio(kappa)
    return det.miss_front + (det.miss_back - det.miss_front) * (1.0 - a * math.cos(math.radians(cam_deg))) / 2.0


def facing_grid(kappa, steps=3600):
    """(angle_rad, weight) over a circle for a von Mises(0, kappa) facing, weights sum to 1."""
    xs = [2.0 * math.pi * (i + 0.5) / steps - math.pi for i in range(steps)]
    ws = [math.exp(kappa * (math.cos(x) - 1.0)) for x in xs]
    z = sum(ws)
    return xs, [w / z for w in ws]


def miss_all(det, cams_deg, kappa, steps=3600):
    """Probability that EVERY camera in cams_deg misses an event (misses share the subject's facing)."""
    xs, ws = facing_grid(kappa, steps)
    total = 0.0
    for x, w in zip(xs, ws):
        p = 1.0
        for c in cams_deg:
            p *= miss_at(det, x - math.radians(c))
        total += w * p
    return total


def miss_all_independent(det, cams_deg, kappa):
    """The same probability if each camera's miss were independent with its own marginal (capture-wake's assumption)."""
    p = 1.0
    for c in cams_deg:
        p *= expected_miss(det, c, kappa)
    return p


def best_sentinel(det, cams_deg, kappa):
    """(index, miss) of the single camera with the lowest mean miss."""
    ms = [expected_miss(det, c, kappa) for c in cams_deg]
    i = min(range(len(ms)), key=ms.__getitem__)
    return i, ms[i]


def rig_energy_wh(n_cams, n_detectors, p_fire, events_per_h=6.0, event_s=30.0, false_per_h=2.0, hold_s=15.0,
                  idle_w=0.9, rec_w=5.0, day_h=DAY_H):
    """Rig Wh for standby cameras all woken by any detector: each camera records for every fire and false alarm.

    A simplified form of capture-wake's closed form (no latency or pre-roll term): enough to compare detector
    counts, not to size a battery.
    """
    rec_s = events_per_h * day_h * p_fire * (event_s + hold_s) + false_per_h * n_detectors * day_h * hold_s
    rec_h = min(day_h, rec_s / 3600.0)
    return n_cams * (rec_w * rec_h + idle_w * (day_h - rec_h))


def simulate_miss(det, cams_deg, kappa, events, seed, mode="sentinel", sentinel=0):
    """Fraction of simulated events that the chosen detectors all miss.

    mode 'sentinel': only camera `sentinel` listens. mode 'any': every camera listens and one fire is enough.
    """
    rng = random.Random(seed)
    missed = 0
    listen = [sentinel] if mode == "sentinel" else range(len(cams_deg))
    for _ in range(events):
        facing = rng.vonmisesvariate(0.0, kappa) if kappa > 0 else rng.uniform(-math.pi, math.pi)
        if all(rng.random() < miss_at(det, facing - math.radians(cams_deg[i])) for i in listen):
            missed += 1
    return missed / events
