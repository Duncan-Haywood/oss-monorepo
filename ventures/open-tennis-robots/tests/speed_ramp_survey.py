"""The ramp-then-PI drop fit on the speed-loop survey's builds (2026-11-18, firmware/esp32/README.md "A ramp-then-PI drop
fit for a speed-mode ESC").

The same 16 builds and 24-ball drills as tests/speed_loop_survey.py (ESC PI loops at 2-20 Hz, damping 0.4 and 0.7,
drag 0.2 and 0.8 s, the current limit at the motor's stall acceleration 9,000 / tau rpm/s; exact and 5 us tachs).
Each build first spins up from rest at its current limit for 3 s, logged on the same tach, and `spinup_fit` reads its
limit a and drag tau from that. Then, as the ESC-lag survey does, the loop (frequency, damping) is picked from the
drill's own balls (least summed squared rms on a grid, then refined around the pick) with that a and tau, and each ball's drop is read at the pick.

    PYTHONPATH=src:tests:firmware/esp32 python tests/speed_ramp_survey.py [--quick] [--true-only] [--heldout] [--step]

`--heldout` swaps in 12 other builds (3, 7 and 14 Hz; damping 0.5 and 0.85; drag 0.3 and 0.5 s) and 24 other balls
(1,200-5,000 rpm, 4-12% drops), none of which any choice in the fit was made on. `--step` picks the loop from a step train instead (STEP_N setpoint steps of STEP_DU, up and back, at STEP_RPM, on the
free wheel; `speed_ramp_fit.loop_from_steps`), with no use of the balls. `--true-only` reads each ball told the true loop and the spin-up's a and tau, skipping the survey. Plants are
assumptions, not measurements of a real ESC.
"""

import math
import random
import sys
from multiprocessing import Pool

from loop_residual_sweep import wheel
from feeder_sim import controller     # noqa: E402
import speed_ramp_fit as R     # noqa: E402

QUICK = "--quick" in sys.argv
TRUE_ONLY = "--true-only" in sys.argv
STEP = "--step" in sys.argv          # pick the loop from a setpoint step train instead of the drill's balls
STEP_RPM, STEP_DU, STEP_N, STEP_MS = 1500.0, 0.02, 8, 400
ESCS = [(f, z, tau) for f in (2, 5, 10, 20) for z in (0.4, 0.7) for tau in (0.2, 0.8)]
BALLS = [(rpm, drop, ph) for rpm in (1500, 2500, 4000, 6000) for drop in (0.06, 0.10) for ph in (0.1, 0.45, 0.8)]
HZ = tuple(round(math.exp(i * math.log(40.0) / 23), 3) for i in range(24))      # 1-40 Hz
ZETA = tuple(round(0.2 + 0.05 * i, 2) for i in range(16))                       # 0.2-0.95
if QUICK:
    HZ, ZETA = HZ[::2], ZETA[::2]
# --heldout: builds and balls none of the fit's choices (SEEN_MIN included) were made on
if "--heldout" in sys.argv:
    ESCS = [(f, z, tau) for f in (3, 7, 14) for z in (0.5, 0.85) for tau in (0.3, 0.5)]
    BALLS = [(rpm, drop, ph) for rpm in (1200, 2000, 3200, 5000) for drop in (0.04, 0.08, 0.12)
             for ph in (0.25, 0.65)]


def spinup(tau_s, a_rpm_s, jitter_us=0.0, seconds=3.0, seed=99, start_phase=0.37):
    """Tach periods of a wheel spun up from rest at the current limit, dw/dt = a - w / tau (0.1 ms steps, as the
    speed-loop ESC's plant), and the time from the command to the first edge. The magnet starts `start_phase` of a
    revolution before the sensor."""
    rng = random.Random(seed)
    w, rev, t = 0.0, start_phase, 0.0
    edges = []
    for i in range(int(seconds * 10000)):
        w0 = w
        w += (a_rpm_s - w / tau_s) * 0.0001
        before = rev
        rev += (w0 + w) / 2 / 60.0 * 0.0001
        if int(rev) > int(before):
            frac = (int(rev) - before) / (rev - before)
            e = i * 100.0 + frac * 100.0
            edges.append(e + (rng.gauss(0, jitter_us) if jitter_us else 0.0))
    edges = [round(e) for e in edges]
    return [edges[i + 1] - edges[i] for i in range(len(edges) - 1)], float(edges[0])


class StepTrain:
    """A stand-in for the board's loop that holds STEP_RPM and moves the command up by STEP_DU and back every STEP_MS,
    STEP_N steps in all, from 310 ms (the drill the builder runs to read the loop; the board's own trim off)."""

    def __init__(self):
        self.c0, self.n, self.i = STEP_RPM / 9000.0, 0, 0.0

    def update(self, *a):
        self.n += 1
        t = self.n * 10
        k = int((t - 310) // STEP_MS) if t > 310 else -1
        return self.c0 * (1 + STEP_DU) if 0 <= k < STEP_N and k % 2 == 0 else self.c0


def step_pick(f, z, tau, jitter):
    """The loop read from a step train on the build: (f, z, rms)."""
    ps, tk = wheel(STEP_RPM, 0.0, tau, ball_ms=300, seed=1, speed_loop=(f, z, 9000.0 / tau), loop=StepTrain(),
                   jitter_us=jitter, total_ms=400 + STEP_MS * STEP_N + 500)
    T = [0.0]
    for p in ps:
        T.append(T[-1] + p)
    prev, st = None, []
    for c, since, u in tk:
        if prev is not None and u != prev:
            st.append((T[c] + since, (u - prev) * 9000.0 / STEP_RPM))
        prev = u
    return R.loop_from_steps(ps, 0.0, st, tau)


def wheels(f, z, tau, jitter):
    out = []
    for i, (rpm, drop, ph) in enumerate(BALLS):
        ps, tk = wheel(rpm, drop, tau, ball_ms=1500.0 + ph * 10, seed=i, speed_loop=(f, z, 9000.0 / tau),
                       jitter_us=jitter)
        out.append((drop, ps, tk))
    return out


def score(ws, a, tau, hz, zt):
    tot, n = 0.0, 0
    for _, ps, tk in ws:
        r = R.drop_from_speed_ramp(ps, tk, a, tau, hz=(hz,), zetas=(zt,), levels=2)
        if r is not None:
            tot += r[4] ** 2
            n += 1
    return n, tot


def survey(ws, a, tau, refine=2):
    """The grid's least summed squared rms, then `refine` rounds of a 5 x 5 search around it, each at half the last
    spacing (the grid's 1.90 Hz next to a 2 Hz loop read up to 8% off on its own)."""
    best = None
    for hz in HZ:
        for zt in ZETA:
            n, tot = score(ws, a, tau, hz, zt)
            if n and (best is None or (n, -tot) > (best[0], -best[1])):
                best = (n, tot, hz, zt)
    if best is None:
        return None
    rh = math.log(HZ[1] / HZ[0])
    dz = ZETA[1] - ZETA[0]
    for _ in range(refine):
        rh, dz = rh / 2, dz / 2
        h0, z0 = best[2], best[3]
        for i in range(-2, 3):
            for j in range(-2, 3):
                if i == 0 and j == 0:
                    continue
                hz, zt = h0 * math.exp(i * rh / 2), z0 + j * dz / 2
                if zt <= 0.05:
                    continue
                n, tot = score(ws, a, tau, hz, zt)
                if n and (n, -tot) > (best[0], -best[1]):
                    best = (n, tot, hz, zt)
    return best


def marked(r):
    """The board's "unsure" bit for a ramp fit: the drop's standard error over LOOP_SE_MAX, or too little of the ball
    seen by the revolutions (speed_ramp_fit.SEEN_MIN)."""
    return r[5] > controller.LOOP_SE_MAX or r[7] < R.SEEN_MIN


def read(ws, a, tau, hz, zt):
    errs = []
    for drop, ps, tk in ws:
        r = R.drop_from_speed_ramp(ps, tk, a, tau, hz=(hz,), zetas=(zt,), levels=4)
        errs.append(None if r is None else ((r[0] / drop - 1) * 100, marked(r)))
    return errs


def summary(errs):
    ok = [e for e in errs if e is not None]
    if not ok:
        return "no fit"
    a = [abs(e) for e, _ in ok]
    um = [abs(e) for e, m in ok if not m] or [0.0]
    return (f"{sum(a) / len(a):5.2f} / {max(a):6.2f} {len(ok):2d}/{len(errs)} {sum(m for _, m in ok):2d}"
            f" {max(um):6.2f}")


def one(job):
    f, z, tau, jit = job
    a_true = 9000.0 / tau
    sp, start = spinup(tau, a_true, jitter_us=jit)
    fit = R.spinup_fit(sp, start)
    a, tf = fit[0], fit[1]
    ws = wheels(f, z, tau, jit)
    at_true = read(ws, a, tf, f, z)
    if TRUE_ONLY:
        return (f, z, tau, jit, a, tf, None, None, None, at_true)
    if STEP:
        hz, zt, _ = step_pick(f, z, tau, jit)
        return (f, z, tau, jit, a, tf, hz, zt, read(ws, a, tf, hz, zt), at_true)
    n, tot, hz, zt = survey(ws, a, tf)
    return (f, z, tau, jit, a, tf, hz, zt, read(ws, a, tf, hz, zt), at_true)


def main():
    jobs = [(f, z, tau, jit) for f, z, tau in ESCS for jit in (0, 5)]
    print("columns: mean / worst |error| %, fitted of the drill, marked, worst unmarked |error| %")
    print(f"{'ESC':20} {'tach':5} {'spin-up a, tau err %':>21} {'picked Hz, z':>12}  {'at the step pick' if STEP else 'at the survey pick':34}"
          f" {'at the true loop'}")
    rows = []
    with Pool() as pool:
        for row in pool.imap(one, jobs):
            f, z, tau, jit, a, tf, hz, zt, got, tru = row
            rows.append(row)
            pick = f"{hz:6.2f} {zt:5.2f}  {summary(got):34}" if got is not None else f"{'-':>12}  {'-':34}"
            print(f"{f:3d} Hz z{z:<4} tau {tau:<4} {jit:2d} us {(a * tau / 9000 - 1) * 100:9.2f} "
                  f"{(tf / tau - 1) * 100:9.2f}  {pick} {summary(tru)}", flush=True)
    for label, idx in (("at the true loop", 9), ("at the step train's pick" if STEP else "at the survey pick", 8)):
        ok = [e for r in rows if r[idx] is not None for e in r[idx] if e is not None]
        tot = sum(len(r[idx]) for r in rows if r[idx] is not None)
        if not tot:
            continue
        bad = [e for e in ok if abs(e[0]) > 2]
        good = [e for e in ok if abs(e[0]) <= 1]
        um = [abs(e[0]) for e in ok if not e[1]] or [0.0]
        print(f"{label}: {len(ok)} drops read of {tot}; more than 2% off {len(bad)}, marked {sum(m for _, m in bad)};"
              f" within 1% {len(good)}, marked {sum(m for _, m in good)}; worst unmarked {max(um):.2f}%")


if __name__ == "__main__":
    main()
