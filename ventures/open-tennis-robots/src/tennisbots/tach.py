"""A tach's edge jitter from logged periods, and what it means for the board's fits (2026-11-18, firmware/esp32/README.md
"The take survey's jitter limit").

The board times each launcher-wheel revolution between two pulses of a once-per-revolution sensor
(controller.PeriodTach). If each pulse's time carries an independent error of standard deviation s (the sensor's edge,
the interrupt's latency, ticks_us()'s whole microseconds), a period carries the difference of two such errors. A wheel
that is speeding up or slowing down changes its period too, so the estimate uses differences that cancel a steady
change of speed: the second difference of the periods, p[i+1] - 2 p[i] + p[i-1], is the third difference of the edge
times, e[i+2] - 3 e[i+1] + 3 e[i] - e[i-1], whose variance is (1 + 9 + 9 + 1) s^2 = 20 s^2 for white edge errors.
Periods far from their neighbours (a missed or doubled pulse) are dropped, and differences beyond six robust standard
deviations are cut before the variance is taken.

On the simulator (tests/take_survey_jitter.py, design and held-out sets) the board's contact-time survey named and
advised 14 of 18 spread takes with no jitter, 4 at 0.5 us, 1 at 1 us and none from 1.5 us; the drop fits themselves lose accuracy more
slowly (README "When the wheel is not a first-order lag": 5 us took the calibration drill's spin error from 1.6% to
5.3%). Simulated only: a real sensor's errors may be lumpier than Gaussian or tied to the wheel's angle.
"""

from __future__ import annotations

import math

MAD_TO_SD = 1.4826            # a normal distribution's standard deviation per median absolute deviation
THIRD_DIFF_VAR = 20.0         # var(e[i+2] - 3 e[i+1] + 3 e[i] - e[i-1]) / var(e) for independent edge errors
MIN_PERIODS = 40
# Where the contact-time survey stands at a given estimate (README "The take survey's jitter limit"), on this
# estimator's own scale. It reads the board's whole-microsecond clock as well as the sensor: the simulator's edges at
# 0, 0.5, 1, 1.5, 2 and 3 us of jitter read 0.40, 0.69, 1.14, 1.59, 2.09 and 3.09 here (a perfect sensor still reads
# about 0.4). The bands' edges sit between those readings.
# Both sets (design and held out, 18 spread-take builds per jitter): named and advised 14 at 0 us, 4 at 0.5, 1 at 1 and
# 0 of 54 at 1.5, 2 and 3 us; no instant build advised at any jitter. The "speaks" edge was set after the held-out set
# (pre-registered: about 1 us), because 0.5 us advised only 1 of 9 there.
SURVEY_SPEAKS_US = 0.55       # below: the simulator's clean tach (reads 0.40)
SURVEY_BLIND_US = 1.35        # from here: 1.5 us and up (reads 1.59 and more), none advised


def read_periods(path: str) -> list[int]:
    """Periods in microseconds from a text file: whitespace- or comma-separated integers (tach_log.py's output), lines
    starting with '#' skipped."""
    out = []
    with open(path) as f:
        for line in f:
            line = line.split("#", 1)[0]
            for tok in line.replace(",", " ").split():
                out.append(int(float(tok)))
    return out


def _median(xs):
    s = sorted(xs)
    n = len(s)
    return s[n // 2] if n % 2 else 0.5 * (s[n // 2 - 1] + s[n // 2])


def edge_jitter(periods: list[float]) -> dict:
    """The edge jitter's standard deviation in us (gross outliers cut), the uncut estimate beside it, the wheel's mean rpm
    and the number of periods used. Periods more than 30% from their neighbours' median (a missed or doubled pulse)
    are dropped first."""
    p = [float(x) for x in periods if x > 0]
    if len(p) < MIN_PERIODS:
        raise ValueError(f"{len(p)} periods; log at least {MIN_PERIODS} revolutions")
    kept = []
    for i, x in enumerate(p):
        ref = _median(p[max(0, i - 3):i + 4])
        if abs(x - ref) <= 0.3 * ref:
            kept.append(x)
    dropped = len(p) - len(kept)
    d2 = [kept[i + 1] - 2 * kept[i] + kept[i - 1] for i in range(1, len(kept) - 1)]
    med = _median(d2)
    mad = _median([abs(v - med) for v in d2])
    # The periods are whole microseconds, so below about 1 us the MAD itself is a small integer and reads coarse; it
    # only sets the cut for gross outliers, and the estimate is the plain variance of what is inside the cut.
    cut = max(6.0 * MAD_TO_SD * mad, 6.0)
    inside = [v for v in d2 if abs(v - med) <= cut]
    mean = sum(inside) / len(inside)
    trimmed = math.sqrt(sum((v - mean) ** 2 for v in inside) / max(1, len(inside) - 1) / THIRD_DIFF_VAR)
    mean_a = sum(d2) / len(d2)
    plain = math.sqrt(sum((v - mean_a) ** 2 for v in d2) / max(1, len(d2) - 1) / THIRD_DIFF_VAR)
    mean_p = sum(kept) / len(kept)
    return {"jitter_us": round(trimmed, 2), "jitter_us_untrimmed": round(plain, 2), "outliers": len(d2) - len(inside), "rpm": round(60e6 / mean_p),
            "periods": len(kept), "dropped": dropped}


def jitter_advice(jitter_us: float) -> str:
    """One line: what the contact-time survey can do at this edge jitter (the simulator's bands)."""
    if jitter_us < SURVEY_SPEAKS_US:
        return (f"edge jitter {jitter_us:g} us: the contact-time survey can name a spread take (on the simulator a "
                f"clean tach, reading 0.4 us, named and advised 14 of 18 spread takes); trust its TAKE_US advice")
    if jitter_us < SURVEY_BLIND_US:
        return (f"edge jitter {jitter_us:g} us: the contact-time survey is near its limit (on the simulator it advised "
                f"4 of 18 spread takes reading 0.7 us, 1 of 18 reading 1.1 us); a 'keep TAKE_US = 0' may only mean it "
                f"cannot see")
    return (f"edge jitter {jitter_us:g} us: the contact-time survey cannot see a 3-6 ms contact time (0 of 54 spread takes "
            f"advised on the simulator reading 1.6 us or more); its 'keep' means 'cannot tell'. A cleaner edge (a Hall sensor with a "
            f"Schmitt input, shielded leads, a timer capture in place of the pin interrupt) helps more than any setting")
