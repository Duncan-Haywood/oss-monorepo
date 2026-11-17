"""Two-wheel launcher: wheel speeds <-> ball speed and spin, and aiming at a target.

The launcher pinches the ball between two counter-rotating wheels stacked
vertically. If the wheels did not slip, the ball would leave at the mean of
the two surface speeds and spin at (v_top - v_bottom) / (2 r). Real machines
lose some of both to slip and ball compression, so two efficiencies scale
them. Measure them on your build with `calibrate`.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from . import ballistics as bl
from . import court


@dataclass(frozen=True)
class WheelLauncher:
    wheel_radius: float = 0.075      # m (150 mm wheels)
    speed_efficiency: float = 0.85   # exit speed / mean wheel surface speed
    spin_efficiency: float = 0.5     # exit spin / no-slip spin
    max_rpm: float = 7000.0
    ball_radius: float = bl.DEFAULT_BALL.radius

    def exit(self, rpm_top: float, rpm_bottom: float) -> tuple[float, float]:
        """(speed m/s, topspin rad/s) for the given wheel speeds."""
        vt = rpm_top * bl.RPM * self.wheel_radius
        vb = rpm_bottom * bl.RPM * self.wheel_radius
        speed = self.speed_efficiency * (vt + vb) / 2
        spin = self.spin_efficiency * (vt - vb) / (2 * self.ball_radius)
        return speed, spin

    def wheel_rpm(self, speed: float, topspin: float) -> tuple[float, float]:
        """(rpm_top, rpm_bottom) that produce `speed` m/s and `topspin` rad/s.

        Raises ValueError if either wheel would need to exceed `max_rpm` or
        turn backwards.
        """
        total = 2 * speed / self.speed_efficiency
        diff = 2 * self.ball_radius * topspin / self.spin_efficiency
        vt, vb = (total + diff) / 2, (total - diff) / 2
        per = 1 / (bl.RPM * self.wheel_radius)
        rt, rb = vt * per, vb * per
        if min(rt, rb) < 0:
            raise ValueError(f"spin too high for this speed: a wheel would turn backwards ({rt:.0f}, {rb:.0f} rpm)")
        if max(rt, rb) > self.max_rpm:
            raise ValueError(f"needs {max(rt, rb):.0f} rpm, above the {self.max_rpm:.0f} rpm limit")
        return rt, rb


def calibrate(samples: list[tuple[float, float, float, float | None]],
              base: WheelLauncher = WheelLauncher()) -> WheelLauncher:
    """Fit the two efficiencies from measured shots.

    Each sample is (rpm_top, rpm_bottom, measured_speed_mps, measured_topspin_rpm or None).
    Speed comes from a radar gun or a slow-motion video over a known
    distance; spin from slow-motion video of a marked ball. Least squares
    through the origin, one parameter each.
    """
    num_s = den_s = num_w = den_w = 0.0
    for rt, rb, v, w_rpm in samples:
        vt = rt * bl.RPM * base.wheel_radius
        vb = rb * bl.RPM * base.wheel_radius
        mean = (vt + vb) / 2
        num_s += mean * v
        den_s += mean * mean
        if w_rpm is not None:
            nominal = (vt - vb) / (2 * base.ball_radius)
            num_w += nominal * w_rpm * bl.RPM
            den_w += nominal * nominal
    if den_s == 0:
        raise ValueError("need at least one sample with non-zero wheel speed")
    spin_eff = num_w / den_w if den_w else base.spin_efficiency
    return WheelLauncher(base.wheel_radius, num_s / den_s, spin_eff, base.max_rpm, base.ball_radius)


# The feeder firmware's model numbers (firmware/esp32/config.py; tests check they agree).
WHEEL_INERTIA_KGM2 = 0.00155       # one wheel and its motor's rotor, cad Feeder.launch_wheel_kgm2
BALL_KG = 0.0577                   # = ballistics.DEFAULT_BALL.mass; the fit's efficiencies scale with it
TRIM = 0.25                        # fit_from_drops sets aside wheel readings this far (share of the fitted drop) off
# fit_from_drops sets aside wheels slower than this (2026-11-16, firmware/esp32/README.md "Slow wheels"): a revolution
# over 60 ms leaves too few pulses before the verdict for the pulse-time fit (a 523 rpm wheel got 3 and showed 70-78%
# of its drop), and a 30-40% drop on a wheel still braking to its new speed showed 54%. No simulated wheel under
# 1,000 rpm was in the sweep that validated the pulse-time drops. Retested on the loop-command drops (2026-11-16,
# README "The 1,000 rpm floor retested", tests/min_fit_rpm_sweep.py): with the Pi holding its next speeds until the
# verdict (host.HOLD_RPM), 750-1,000 rpm wheels read within 1.1% (first-order and jittery plants) but 500-750 rpm ones
# still missed by up to 32%, and a 750 floor was no better than this one across the plants (spin worst 0.72 / 3.18 /
# 2.29% against 0.52 / 4.16 / 2.15%), so it stays. With the board watching slow wheels past the verdict (README "Slow
# wheels watched past the verdict") 500-750 rpm wheels read 0.992-1.009 of their drop and no floor gave the lower
# worst spin error on three plants of four, but the means were mixed: a held-out sweep should decide it. It did
# (2026-11-17, README "The fit floor on held-out builds", tests/min_fit_heldout.py, rule committed before the run): 18
# builds on launchers, lags, plants and slow targets none of the earlier sweeps used; pooled spin error 0.57% at 500
# against 0.56% at 1,000, and the worst ESC build 2.33% against 1.47%, so it stays.
MIN_FIT_RPM = 1000.0
# The spin efficiency comes from the difference between a spin shot's two drops, a small part of each, so one wheel's
# reading error moves it several times as far as it moves the speed fit, and the slowest wheels read worst. On the
# simulator's held-out builds the old calibration drill (spin shots with a wheel at 1,062-1,961 rpm) read the spin
# efficiency up to 16.6% off; the current one (every spin-shot wheel 2,500 rpm or more) 7.8% (tests/spin_drill_sweep.py,
# firmware/esp32/README.md "Spin from fast wheels"). A log with a spin shot below this gets a note.
SPIN_FIT_RPM = 2000.0


@dataclass(frozen=True)
class DropFit:
    """What the wheels' speed drops say about the launcher (`fit_from_drops`)."""
    speed_efficiency: float          # exit speed / mean wheel surface speed, if the wheel inertia is the one assumed
    spin_efficiency: float | None    # None when every shot was flat (no spin to fit from)
    recovery_s: float | None         # the wheel loop's recovery time constant seen by the tach; None: not fitted
    rms: float                       # residual of the drops, as a fraction of wheel speed
    shots: int                       # launched shots used
    note: str = ""
    unsure: int = 0                  # wheel readings the firmware marked unsure (LAUNCH flags bits 6 / 7)

    def launcher(self, base: WheelLauncher = WheelLauncher()) -> WheelLauncher:
        spin = base.spin_efficiency if self.spin_efficiency is None else self.spin_efficiency
        return WheelLauncher(base.wheel_radius, self.speed_efficiency, spin, base.max_rpm, base.ball_radius)


def _tach_share(rev_s: float, recovery_s: float | None) -> float:
    """Expected share of a wheel's true speed drop that its lowest single-revolution reading shows, when the speed loop
    pulls the wheel back with time constant `recovery_s`. The first whole revolution after the ball starts a uniformly
    random part of a revolution later, and averages the recovering deficit over its own length: ((1 - e^-x) / x)^2,
    x = rev_s / recovery_s. About 1 - x for a short revolution; None means no recovery (1)."""
    if recovery_s is None:
        return 1.0
    x = rev_s / recovery_s
    return ((1.0 - math.exp(-x)) / x) ** 2 if x > 1e-9 else 1.0


# Warn when at least this share of a drill's wheel readings (and at least two) came marked unsure by the firmware
# (2026-11-16, firmware/esp32/README.md "When the wheel is not a first-order lag").
UNSURE_WARN = 0.1


def _drop_rows(records, inertia, ball_kg, wheel_radius):
    """One row per wheel per launched record: (measured drop, revolution s, speed-eff coefficient, spin-eff
    coefficient, whole). Model (firmware controller.launch_dips, written to be linear in the efficiencies):
    drop_i = m R^2 / (I w_i) [se (w_t + w_b) / 4 +/- sp (w_t - w_b) / 6], + for the top wheel. `whole` is True when
    the firmware fitted the drop from the pulse times (`fit_top` / `fit_bottom`, 2026-11-16): the whole drop, so the
    tach's recovery share does not apply to it. `unsure` (2026-11-16 later, firmware/esp32/README.md "When the wheel is
    not a first-order lag"): the firmware's loop fit says its own misses leave that drop uncertain (`unsure_top` /
    `unsure_bottom`, LAUNCH flags bits 6 / 7)."""
    rows = []
    for r in records:
        if not r.get("launched"):
            continue
        wt, wb = float(r["rpm_top"]), float(r["rpm_bottom"])
        for w, d, sign, whole, unsure in ((wt, r["drop_top"], 1.0, r.get("fit_top", False), r.get("unsure_top", False)),
                                          (wb, r["drop_bottom"], -1.0, r.get("fit_bottom", False),
                                           r.get("unsure_bottom", False))):
            if w < MIN_FIT_RPM:
                continue
            k = ball_kg * wheel_radius ** 2 / (inertia * w)       # rpm cancels: the drop is a ratio
            rows.append((float(d), 60.0 / w, k * (wt + wb) / 4, sign * k * (wt - wb) / 6, bool(whole), bool(unsure)))
    return rows


def _share(row, recovery_s):
    return 1.0 if row[4] else _tach_share(row[1], recovery_s)


def _solve(rows, recovery_s, fit_spin):
    sxx = sxy = syy = sxd = syd = 0.0
    for row in rows:
        d, rev, a, b = row[:4]
        g = _share(row, recovery_s)
        a, b = a * g, b * g
        sxx += a * a
        sxd += a * d
        if fit_spin:
            sxy += a * b
            syy += b * b
            syd += b * d
    if fit_spin:
        det = sxx * syy - sxy * sxy
        se = (sxd * syy - syd * sxy) / det
        sp = (syd * sxx - sxd * sxy) / det
    else:
        se, sp = sxd / sxx, None
    sse = 0.0
    for row in rows:
        d, rev, a, b = row[:4]
        pred = _share(row, recovery_s) * (a * se + (b * sp if sp is not None else 0.0))
        sse += (d - pred) ** 2
    return se, sp, sse


def fit_from_drops(records, *, inertia: float = WHEEL_INERTIA_KGM2, ball_kg: float = BALL_KG,
                   base: WheelLauncher = WheelLauncher(), recovery_s: float | None = None) -> DropFit:
    """Fit the launcher's efficiencies from the feeder's per-shot wheel speed drops (2026-11-16,
    firmware/esp32/README.md "Shot log"), with no radar gun.

    A ball squeezed through the wheels takes its momentum from them, so each wheel slows by J R / I, J being its share
    of the ball's momentum and spin. The drops are therefore a momentum meter: with the wheel inertia known they give
    the exit speed, so the speed efficiency, and with topspin or backspin shots in the log the spin efficiency too.

    `records` are dicts as `host` logs them: rpm_top, rpm_bottom (targets), drop_top, drop_bottom (fractions) and
    launched. The tach reports the lowest single-revolution speed, which shows less than the whole drop because the
    speed loop is already pulling the wheel back during that revolution, more so at low speed. When the log spans
    speeds (fastest wheel at least 1.6x the slowest) the recovery time constant is fitted alongside (a grid of 0.03 to
    30 s and none); otherwise pass `recovery_s` if known, or the slow shots read low.

    Efficiencies scale with inertia: the fit is right for `inertia`; a true wheel that is k times heavier means the
    true efficiencies are k times these. `inertia_from_radar` turns one radar-gun calibration into the true inertia."""
    rows = _drop_rows(records, inertia, ball_kg, base.wheel_radius)
    if not rows:
        raise ValueError(f"no launched shots with a wheel at {MIN_FIT_RPM:.0f} rpm or more in the log")
    # Drops the firmware marked unsure (its loop fit's own misses give a standard error over 1% of the drop) are a
    # warning about the build, not readings to drop: on the simulator setting them aside did not improve the fit
    # (tests/plant_drill_sweep.py; with a 5 us tach jitter it made the spin error worse, 7.2% against 5.3%), but no
    # wheel of the first-order plant was ever marked and every plant that broke the model marked 30-96% of its wheels.
    unsure = sum(1 for r in rows if r[5])
    slow = sum(1 for r in records if r.get("launched")
               for w in (float(r["rpm_top"]), float(r["rpm_bottom"])) if 0 < w < MIN_FIT_RPM)
    fit_spin = max(abs(r[3]) for r in rows) > 0.05 * max(r[2] for r in rows)
    revs = [r[1] for r in rows if not r[4]]
    shots = sum(1 for r in records if r.get("launched"))
    note = ""
    if not revs:
        grid = [None]                 # every drop is the firmware's pulse-time fit: whole drops, nothing to recover
    elif recovery_s is not None:
        grid = [recovery_s]
    elif max(revs) >= 1.6 * min(revs):
        grid = [0.03 * 10 ** (k / 40) for k in range(121)] + [None]
    else:
        grid = [None]
        note = ("every shot at about one speed: the tach's recovery cannot be fitted, so slow shots read low; "
                "log shots at two or more speeds, or pass recovery_s")
    def best_of(rows):
        best = None
        for tau in grid:
            se, sp, sse = _solve(rows, tau, fit_spin)
            if best is None or sse < best[3] - 1e-15:
                best = (tau, se, sp, sse)
        return best

    tau, se, sp, sse = best_of(rows)
    # One trimming pass: a wheel still settling when the ball came (braked from a faster shot, its loop pushing it back
    # up) shows a fraction of its drop; on the simulator one such wheel in 24 read half. Rows more than TRIM off the
    # fitted drop are set aside and the rest refitted, if enough remain.
    keep = [r for r in rows
            if abs(r[0] - _share(r, tau) * (r[2] * se + (r[3] * sp if sp is not None else 0.0)))
            <= TRIM * _share(r, tau) * (r[2] * se + (r[3] * sp if sp is not None else 0.0))]
    trimmed = len(rows) - len(keep)
    if trimmed and len(keep) >= max(4, len(rows) // 2):
        rows = keep
        tau, se, sp, sse = best_of(rows)
    else:
        trimmed = 0
    notes = [note] if note else []
    if slow:
        notes.append(f"{slow} wheel reading{'s' if slow > 1 else ''} under {MIN_FIT_RPM:.0f} rpm set aside (too few "
                     "revolutions before the verdict to read the whole drop)")
    slow_spin = sum(1 for r in records if r.get("launched")
                    for wt, wb in [(float(r["rpm_top"]), float(r["rpm_bottom"]))]
                    if abs(wt - wb) > 0.05 * (wt + wb) and MIN_FIT_RPM <= min(wt, wb) < SPIN_FIT_RPM)
    if not fit_spin:
        notes.append("flat shots only: spin efficiency not fitted")
    elif slow_spin:
        notes.append(f"{slow_spin} spin shot{'s' if slow_spin > 1 else ''} with a wheel under {SPIN_FIT_RPM:.0f} rpm: "
                     "spin read from slow wheels was up to 17% off on the simulator, against 8% with both wheels at "
                     "2,500 rpm or more (drill.calibration.json's spin shots)")
    if unsure >= max(2, UNSURE_WARN * len(rows)):
        notes.append(f"{unsure} of {len(rows)} wheel readings marked unsure by the firmware: its model of the wheel "
                     "(a simple lag of the ESC command, timed by the tach) does not fit this build, and on the simulator "
                     "such builds read the spin efficiency 5-24% off. Check the tach (sensor gap, magnet, a soft "
                     "interrupt) and the ESC's mode (a closed speed loop of its own) before trusting this fit")
    if trimmed:
        notes.append(f"{trimmed} wheel reading{'s' if trimmed > 1 else ''} more than {TRIM:.0%} off the fit set aside "
                     "(a wheel still settling when the ball came)")
    return DropFit(se, sp, tau, math.sqrt(sse / len(rows)), shots, "; ".join(notes), unsure)


def inertia_from_radar(drop_fit: DropFit, radar_speed_efficiency: float,
                       inertia: float = WHEEL_INERTIA_KGM2) -> float:
    """The wheel's true inertia, from a drop fit made assuming `inertia` and a speed efficiency measured with a radar gun
    (`calibrate`): the drops fix efficiency / inertia, the radar fixes efficiency. Put it in config.py's
    WHEEL_INERTIA_KGM2, and from then on the drops alone track the efficiency (worn felt, a soft batch of balls)."""
    return inertia * radar_speed_efficiency / drop_fit.speed_efficiency


@dataclass(frozen=True)
class Shot:
    speed: float            # m/s at the wheels
    topspin_rpm: float
    sidespin_rpm: float
    elevation_deg: float
    azimuth_deg: float      # 0 = straight down the court (+x)
    landing: tuple[float, float]
    net_clearance: float | None
    flight_time: float      # launch to first bounce, s


def _fly(origin: bl.Vec, speed: float, elev: float, az: float, top: float, side: float,
         ball: bl.BallModel) -> bl.Flight:
    v = bl.launch_velocity(speed, elev, az)
    return bl.simulate(origin, v, bl.spin_vector(v, top, side), ball=ball, max_bounces=0)


def aim(origin: bl.Vec, target: tuple[float, float], speed: float, topspin_rpm: float = 0.0,
        sidespin_rpm: float = 0.0, ball: bl.BallModel = bl.DEFAULT_BALL, *,
        min_net_clearance: float = 0.15) -> Shot:
    """Elevation and azimuth that land a ball of the given speed and spin on `target`.

    Takes the low arc (the flatter of the two solutions), which is what a
    ball machine feeding groundstrokes wants. Raises ValueError if the
    target is out of reach at this speed or the shot would not clear the net
    by `min_net_clearance` metres.
    """
    top = topspin_rpm * bl.RPM
    side = sidespin_rpm * bl.RPM
    tx, ty = target
    ox, oy, _ = origin
    want = math.hypot(tx - ox, ty - oy)
    az = math.atan2(ty - oy, tx - ox)

    def dist(elev: float, az: float) -> tuple[float, bl.Flight]:
        f = _fly(origin, speed, elev, az, top, side, ball)
        b = f.first_bounce
        if f.hit_net or b is None:
            return -1.0, f
        return math.hypot(b.pos[0] - ox, b.pos[1] - oy), f

    elev = None
    flight = None
    for _ in range(6):
        lo = math.radians(-20)
        d_lo, _ = dist(lo, az)
        bracket = None
        e = lo
        while e < math.radians(50):
            e2 = e + math.radians(2)
            d2, _ = dist(e2, az)
            if d_lo <= want <= d2:
                bracket = (e, e2)
                break
            e, d_lo = e2, d2
        if bracket is None:
            raise ValueError(f"target {target} is out of reach at {speed:.1f} m/s")
        a, b = bracket
        for _ in range(40):
            m = (a + b) / 2
            dm, _ = dist(m, az)
            if dm < want:
                a = m
            else:
                b = m
        elev = (a + b) / 2
        d, flight = dist(elev, az)
        if abs(d - want) > 0.1:
            # The bracket spanned a jump, not a crossing: just below it the ball hits the net, just above it lands
            # past the target (too fast to come down short of it over the net). Seen at 80 m/s, 2026-11-11.
            raise ValueError(f"target {target} cannot be reached at {speed:.1f} m/s: every arc that clears the net "
                             "lands beyond it; slow the shot or add topspin")
        land = flight.first_bounce.pos
        err = math.atan2(ty - oy, tx - ox) - math.atan2(land[1] - oy, land[0] - ox)
        if abs(err) < 1e-5:
            break
        az += err
    land = flight.first_bounce.pos
    clearance = flight.net_clearance
    if clearance is not None and clearance < min_net_clearance:
        raise ValueError(f"shot clears the net by only {clearance:.2f} m; add speed, lift or depth")
    return Shot(speed, topspin_rpm, sidespin_rpm, math.degrees(elev), math.degrees(az),
                (land[0], land[1]), clearance, flight.first_bounce.t)


def default_origin(y: float = 0.0, height: float = 1.0) -> bl.Vec:
    """Launch point for a machine standing 0.5 m behind the robot-side baseline."""
    return (-court.HALF_LENGTH - 0.5, y, height)
