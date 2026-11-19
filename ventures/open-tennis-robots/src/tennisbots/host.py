"""Pi side of the feeder link: run a drill on the ball machine over the serial protocol (2026-11-11).

Until now the repository had both ends' parts but nothing that drove a drill: the planner (`launcher.aim`) said
what each shot needs and the ESP32 firmware obeyed single commands. This module is the loop between them:

1. plan every shot first (`plan_drill`), so a bad drill fails before a wheel turns;
2. per shot, send the wheel speeds and the aim;
3. wait until a telemetry frame that is certainly newer than the command shows the aim settled
   (`FLAG_AIM_SETTLING` clear, azimuth homed) and the wheels held at speed (`FLAG_WHEELS_SETTLING` clear);
4. send `FEED 1` and wait until the firmware's released-ball counter moves, so the next re-aim can never carry a
   queued ball to the wrong place;
5. re-aim for the next shot straight away, but feed no sooner than the drill's interval after the last release.

Since 2026-11-16 the firmware judges every feed stroke by the launcher wheels' speed drop (a ball takes its momentum
from them; firmware `controller.LaunchCheck`) and sets `FLAG_HOPPER_EMPTY` when a stroke put no ball through. The
runner stops there and reports the shot that went dry and how many flew, instead of carrying on with an empty pocket
(it used to count the stroke as a shot) or ending on a release timeout. After the last shot it waits for that shot's
verdict before reporting the drill done.

Every verdict also comes with a record (the LAUNCH frame, 2026-11-16, firmware/esp32/README.md "Shot log"): each
wheel's speed just before the ball and how far it fell. `DrillResult.launches` collects them, `tennisbots run
--shot-log` appends them to a file, and `launcher.fit_from_drops` reads the launcher's efficiencies from them.

Heartbeats go out every 100 ms throughout (the firmware stops everything after 300 ms of silence). Any fault flag
(e-stop, watchdog, elevation fault), a lost link or a step that overruns its time limit aborts the drill: the runner
sends `ESTOP`, which also drops any ball still queued, and reports why.

Transport and clock are injected: `port` needs `write(bytes)` and a non-blocking `read() -> bytes` (pyserial's
`Serial(..., timeout=0)` with `read(256)` wrapped, see `SerialPort`), `clock()` returns seconds and `sleep(s)`
waits. The tests run it against the real firmware code on a simulated board.
"""

from __future__ import annotations

import json
import math
import time
from dataclasses import dataclass, field, replace

from . import ballistics as bl
from . import launcher
from . import protocol as P

HEARTBEAT_S = 0.1
# A telemetry frame can be in flight when a command goes out (frames every 100 ms, plus serial and loop latency),
# so only frames received this long after a command are taken to reflect it.
FRESH_S = 0.25
RPM_TOL = 0.05                 # the firmware's own feed-gate tolerance
MAX_WHEEL_RPM = 7000
# Below this a wheel never settles or its ball goes unseen (2026-11-16, simulated feeder: 5,000 rpm over 200 or 300 rpm
# timed out waiting for the wheels; over 400 the launch check read the ball as no ball; 500 and up ran clean).
MIN_WHEEL_RPM = 500
FAULT_FLAGS = {P.FLAG_ESTOP: "e-stop", P.FLAG_WATCHDOG: "watchdog (heartbeats missed)",
               P.FLAG_ELEV_FAULT: "elevation actuator fault",
               P.FLAG_BUS_OFF: "switched bus off (contactor open: wireless e-stop, RESET not yet pressed at the "
                               "feeder, its coil wire or the timer)"}
# Since 2026-11-18 the motors get power back only when someone presses and lets go of RESET on the feeder after the
# e-stop and the fob are released (hardware/electronics.md "Reset at the machine"); no command can do it.
RESET_HINT = ("the motors have no power: release the e-stop and the fob, then press and let go of RESET on the feeder "
              "(no command can power them)")
# Reported once and the drill goes on: the hopper still holds balls, only their return has stopped (2026-11-15).
WARN_FLAGS = {P.FLAG_LIFT_JAM: "ball lift jammed and off after its retry: balls stop returning to the hopper; clear the "
                               "jam, then press and release the e-stop",
             P.FLAG_LIFT_HUB_DUE: "lift slip hub due a re-set (LIFT_SLIP_JAMS jams since its last set, or the count in "
                                  "flash was lost): check its slip on the scale and set it again (cad/README.md \"Slip "
                                  "hub wear\"), then run `tennisbots lift-hub-reset`"}


# The firmware's verdict on a stroke lands LAUNCH_CHECK_MS (250 ms) after the stroke's end, which is when the release
# is counted; frames this long after the release carry it.
VERDICT_S = 0.25 + FRESH_S
# The loop-command fit the board makes after a verdict, one step a control tick (about 72 ticks for both wheels), may
# take this long before the record comes again with its drops; past it the parabola's stand.
LOOP_FIT_S = 3.0              # 2.0 until a slow wheel's watch past the verdict (up to 1.2 s) came before the fit
# After a shot with a turning wheel slower than this, the next shot's wheel speeds wait for the verdict (2026-11-16,
# firmware/esp32/README.md "The 1,000 rpm floor retested"): the board freezes its pulse snapshot at a speed change, so
# a slow wheel whose next target came straight after the release had one or two revolutions after its ball, too few
# for the loop-command fit, and its drop fell back to the parabola (0.62-0.78 of the true drop at 510-710 rpm on the
# simulator). 0 never waits. Raised to 3,000 (2026-11-16 later, README "The 1.48x wheel"): with no hold the snapshot
# ends about 0.16 s after the ball, three revolutions at 1,107 rpm, and a fit on three read one wheel's drop 1.48x;
# 3,000 rpm turns the fit's eight revolutions in that time.
HOLD_RPM = 3000.0
# How long after the release a held wheel's drop needs (2026-11-16, firmware/esp32/README.md "Slow wheels watched past
# the verdict"): the ball meets the wheels BALL_LEAD_S before the release is counted, the loop fit anchors on the first
# whole revolution after it and wants LOOP_AFTER_REVS more (the firmware's constant), and the board watches a slow wheel
# past its verdict for them, up to its EXTEND_MS (1.2 s). Under about 1,500 rpm that is longer than the verdict.
BALL_LEAD_S = 0.14
LOOP_AFTER_REVS = 8
HOLD_MAX_S = 0.25 + 1.2
# Set when the board runs with controller.LOOP_THROUGH_CHANGE (2026-11-17, firmware/esp32/README.md "The fit floor on
# held-out builds"; off by default, like the board's): its slow wheel's watch goes on through the next shot's speed
# change, so the next shot's speeds go out straight after the release instead of after hold_s. The hold before the
# drill's final stop stays (a stop ends the watch), and a re-planned drill still waits for the verdict.
LOOP_THROUGH_CHANGE = False
HOPPER_EMPTY = ("hopper empty: the feed stroke put no ball through the wheels (the launcher wheels did not slow); "
                "refill the tub, or check the outlet for a bridge of balls and the hose for a stuck one")


class HopperEmpty(Exception):
    pass


@dataclass
class PlannedShot:
    index: int
    elevation_cdeg: int
    azimuth_cdeg: int
    rpm_top: int
    rpm_bottom: int
    landing: tuple
    interval_s: float
    speed: float = 0.0             # the ball's planned exit speed (m/s) and spin: what the re-planner keeps when it
    topspin_rpm: float = 0.0       # changes the wheel speeds (rewheel)
    sidespin_rpm: float = 0.0


@dataclass
class Telemetry:
    t: float
    flags: int
    base_y_mm: int
    rpm_top: int
    rpm_bottom: int
    battery_mv: int
    balls_fed: int


@dataclass
class ShotResult:
    index: int
    ready_s: float             # command to aim settled and wheels at speed
    released_at: float         # clock time the firmware reported the ball gone
    rpm: tuple                 # wheel speeds in the last frame before the feed


@dataclass
class DrillResult:
    shots: list = field(default_factory=list)
    aborted: str | None = None
    link_errors: int = 0
    warnings: list = field(default_factory=list)
    dry_shot: int | None = None    # index of the shot whose stroke carried no ball (FLAG_HOPPER_EMPTY), if any
    launches: list = field(default_factory=list)   # one dict per judged stroke of this run (LAUNCH frames), shot index
                                                    # included: the input to launcher.fit_from_drops
    fed: list = field(default_factory=list)        # the PlannedShot each FEED was sent with (re-planned speeds included)
    refits: list = field(default_factory=list)     # Refitter.events, when the run re-planned from its own shots
    esc_survey: dict | None = None  # the board's ESC-lag survey at the drill's end (ESC_SURVEY frame), if it sent one
    esc_tau_ms: int | None = None   # the ESC lag the board's drop fit ran with (ESC_TAU frame), if it reports one
    take_survey: dict | None = None  # the board's contact-time survey at the drill's end (TAKE_SURVEY frame), if any
    survey_wait_s: float = 0.0       # how long the drill held its balls for the board's contact-time survey
    held: bool = False              # stopped before the first ball by the ESC-lag check (`aborted` says why); no e-stop

    @property
    def ok(self) -> bool:
        return self.aborted is None


def plan_drill(spec: dict, wheels: launcher.WheelLauncher | None = None) -> list:
    """Every shot of a drill file as machine settings; raises ValueError naming the first shot that cannot be made.
    `wheels` overrides the drill file's "launcher" block (the re-planner passes a fitted one)."""
    m = spec.get("machine", {})
    origin = launcher.default_origin(m.get("y", 0.0), m.get("height", 1.0))
    wheels = wheels or launcher.WheelLauncher(**spec.get("launcher", {}))
    default_gap = float(spec.get("interval", 3.0))
    out = []
    for i, s in enumerate(spec["shots"]):
        try:
            shot = launcher.aim(origin, (s["x"], s["y"]), s["speed"], s.get("topspin", 0.0), s.get("sidespin", 0.0))
            top, bottom = wheels.wheel_rpm(shot.speed, shot.topspin_rpm * bl.RPM)
        except ValueError as exc:
            raise ValueError(f"shot {i}: {exc}") from None
        elev, az = round(shot.elevation_deg * 100), round(shot.azimuth_deg * 100)
        if not (-1500 <= elev <= 4500 and -3000 <= az <= 3000):
            raise ValueError(f"shot {i}: aim {elev / 100:.1f} deg up, {az / 100:.1f} deg across is outside the "
                             "head's range (-15..45 up, -30..30 across)")
        _check_rpm(i, top, bottom)
        out.append(PlannedShot(i, elev, az, round(top), round(bottom), shot.landing,
                               float(s.get("interval", default_gap)), shot.speed, shot.topspin_rpm,
                               shot.sidespin_rpm))
    return out


def _check_rpm(i, top, bottom):
    if max(top, bottom) > MAX_WHEEL_RPM or min(top, bottom) < MIN_WHEEL_RPM:
        raise ValueError(f"shot {i}: wheels {top:.0f}/{bottom:.0f} rpm are outside {MIN_WHEEL_RPM}..{MAX_WHEEL_RPM} "
                         "rpm (below it the tach cannot hold the wheel's speed or see a ball's drop; less spin, or "
                         "more speed)")


def rewheel(shots: list, wheels: launcher.WheelLauncher, origin=None) -> tuple:
    """The same shots with the wheel speeds a different launcher model needs for each one's planned speed and spin.
    The aim does not move: it depends only on the ball's speed and spin, which the drill fixes.

    A shot the model can make only with a wheel outside MIN_WHEEL_RPM..MAX_WHEEL_RPM (heavy spin on a launcher whose
    spin efficiency turned out low) keeps its speed and gets the most spin both wheels can give, re-aimed at the same
    spot, when `origin` is given; otherwise, or if even its speed is out of reach, it keeps its old wheel speeds.
    Returns (shots, notes), a note per shot that was not re-planned as asked."""
    out, notes = [], []
    for p in shots:
        try:
            top, bottom = wheels.wheel_rpm(p.speed, p.topspin_rpm * bl.RPM)
            _check_rpm(p.index, top, bottom)
            out.append(replace(p, rpm_top=round(top), rpm_bottom=round(bottom)))
            continue
        except ValueError as exc:
            why = str(exc)
        less = _most_spin(p, wheels, origin) if origin is not None else None
        if less is None:
            notes.append(f"shot {p.index}: kept its old wheel speeds ({why.removeprefix(f'shot {p.index}: ')})")
            out.append(p)
        else:
            notes.append(f"shot {p.index}: spin cut from {p.topspin_rpm:.0f} to {less.topspin_rpm:.0f} rpm, the most "
                         f"this launcher gives at {p.speed:.0f} m/s with both wheels in {MIN_WHEEL_RPM}..{MAX_WHEEL_RPM} "
                         "rpm; re-aimed")
            out.append(less)
    return out, notes


def _most_spin(p: PlannedShot, wheels: launcher.WheelLauncher, origin) -> PlannedShot | None:
    per = 1 / (bl.RPM * wheels.wheel_radius)
    total = 2 * p.speed / wheels.speed_efficiency * per            # rpm_top + rpm_bottom
    room = 0.99 * min(total - 2 * MIN_WHEEL_RPM, 2 * MAX_WHEEL_RPM - total)
    if room <= 0:
        return None
    diff = math.copysign(room, p.topspin_rpm)
    spin_rpm = diff / per * wheels.spin_efficiency / (2 * wheels.ball_radius) / bl.RPM
    try:
        shot = launcher.aim(origin, p.landing, p.speed, spin_rpm, p.sidespin_rpm)
    except ValueError:
        return None
    elev, az = round(shot.elevation_deg * 100), round(shot.azimuth_deg * 100)
    if not (-1500 <= elev <= 4500 and -3000 <= az <= 3000):
        return None
    return replace(p, rpm_top=round((total + diff) / 2), rpm_bottom=round((total - diff) / 2), elevation_cdeg=elev,
                   azimuth_cdeg=az, landing=shot.landing, topspin_rpm=spin_rpm)


def landing_with(shot: PlannedShot, wheels: launcher.WheelLauncher, origin) -> tuple:
    """Where `shot`, fed at its planned wheel speeds and aim, lands if the launcher is really `wheels`."""
    speed, spin = wheels.exit(shot.rpm_top, shot.rpm_bottom)
    f = launcher._fly(origin, speed, math.radians(shot.elevation_cdeg / 100), math.radians(shot.azimuth_cdeg / 100),
                      spin, shot.sidespin_rpm * bl.RPM, bl.DEFAULT_BALL)
    b = f.first_bounce
    return None if f.hit_net or b is None else (b.pos[0], b.pos[1])


class Refitter:
    """Re-plan a drill's remaining shots from the launcher efficiencies its own shots show (2026-11-16, firmware/esp32/
    README.md "Re-planning a drill from its own shots").

    `run_drill(..., replan=Refitter(spec, ...))` calls it before each shot with the run's launch records so far. After
    `after` launched shots, and again after each further `after`, it fits `launcher.fit_from_drops` to this run's
    records and, when the fit moves the speed efficiency more than `speed_tol` or the spin efficiency more than
    `spin_tol` (relative, about the fit's own error) from the one being planned with, changes that one and returns the remaining shots' new wheel speeds. Each such event is kept in `events`: the fit, and how
    far each remaining shot would have landed from its target on the old wheel speeds if the fit is right (the landing
    shift).

    A drill's shots are usually all at a few speeds, too few to fit the tach's recovery time (`fit_from_drops`), and
    then slow shots read low; pass `recovery_s` from a calibration drill's fit (`tennisbots run --shot-log` reads it from
    the log). Fits outside `SANE` are refused and logged, never adopted."""

    SANE = {"speed_efficiency": (0.3, 1.0), "spin_efficiency": (0.05, 1.0)}

    def __init__(self, spec: dict, *, after: int = 4, recovery_s: float | None = None,
                 inertia: float = launcher.WHEEL_INERTIA_KGM2, speed_tol: float = 0.02, spin_tol: float = 0.15,
                 log=None):
        if after < 2:
            raise ValueError("refit after at least 2 shots: one shot's drops cannot separate speed from spin")
        m = spec.get("machine", {})
        self.origin = launcher.default_origin(m.get("y", 0.0), m.get("height", 1.0))
        self.wheels = launcher.WheelLauncher(**spec.get("launcher", {}))
        self.after, self.recovery_s, self.inertia, self.log = after, recovery_s, inertia, log
        self.speed_tol, self.spin_tol = speed_tol, spin_tol
        self.events: list = []
        self._next = after

    def __call__(self, launches: list, remaining: list) -> list | None:
        went = [r for r in launches if r.get("launched")]
        if len(went) < self._next or not remaining:
            return None
        self._next = (len(went) // self.after + 1) * self.after
        try:
            fit = launcher.fit_from_drops(went, inertia=self.inertia, base=self.wheels, recovery_s=self.recovery_s)
        except ValueError as exc:
            return self._skip(len(went), f"no fit: {exc}")
        for name, (lo, hi) in self.SANE.items():
            v = getattr(fit, name)
            if v is not None and not lo <= v <= hi:
                return self._skip(len(went), f"fit refused: {name} {v:.3f} is outside {lo}..{hi} (a wheel inertia far "
                                             "off, or a stuck tach?)")
        # Each efficiency is changed only when the fit moved it further than the fit's own error (README "Shot log":
        # 3.9% speed, 11.7% spin over 18 simulated builds; 1.9% and 6.6% after the pulse-time drops; 0.6% and 7.7%
        # since the ball mass was made one, README "Slow wheels and one ball mass", 2026-11-16): speed_tol went from
        # 5% to 2%, which re-planned builds 2.4-3.5% off from about 1 m off target to 0.11 m or less and left a build
        # already right alone. When the fit's error was 3.9%, a 3% correction from a 4-shot fit was as likely noise.
        se, sp = self.wheels.speed_efficiency, self.wheels.spin_efficiency
        if abs(fit.speed_efficiency / se - 1) > self.speed_tol:
            se = fit.speed_efficiency
        if fit.spin_efficiency is not None and abs(fit.spin_efficiency / sp - 1) > self.spin_tol:
            sp = fit.spin_efficiency
        if (se, sp) == (self.wheels.speed_efficiency, self.wheels.spin_efficiency):
            return self._skip(len(went), f"fit within {self.speed_tol:.0%} (speed) and {self.spin_tol:.0%} (spin) of "
                                         "the plan's launcher, inside its own error: no change", fit=fit)
        new = replace(self.wheels, speed_efficiency=se, spin_efficiency=sp)
        out, problems = rewheel(remaining, new, self.origin)
        if all(o is p for o, p in zip(out, remaining)):
            return self._skip(len(went), f"fit not used: the fitted launcher can make none of the shots left "
                                         f"({problems[0]})", fit=fit)
        shifts = []
        for p in remaining:
            land = landing_with(p, new, self.origin)
            shifts.append(None if land is None else
                          {"shot": p.index, "short_m": round(p.landing[0] - land[0], 2),
                           "off_m": round(math.dist(land, p.landing), 2)})
        ev = {"after_shots": len(went), "used": True, "fit": _fit_dict(fit),
              "was": {"speed_efficiency": self.wheels.speed_efficiency, "spin_efficiency": self.wheels.spin_efficiency},
              "landing_shift": shifts, "kept": problems}
        self.events.append(ev)
        self.wheels = new
        if self.log:
            worst = max((s["off_m"] for s in shifts if s), default=0.0)
            self.log(f"re-planned after {len(went)} shots: speed efficiency {ev['was']['speed_efficiency']:.3f} -> "
                     f"{new.speed_efficiency:.3f}, spin {ev['was']['spin_efficiency']:.3f} -> {new.spin_efficiency:.3f}; "
                     f"the {len(remaining)} shots left would have landed up to {worst:.2f} m off target")
            for why in problems:
                self.log(f"  {why}")
        return out

    def _skip(self, n, why, fit=None):
        self.events.append({"after_shots": n, "used": False, "why": why, "fit": fit and _fit_dict(fit)})
        if self.log:
            self.log(f"after {n} shots: {why}")
        return None


def _fit_dict(fit: launcher.DropFit) -> dict:
    r = lambda v: None if v is None else round(v, 4)
    return {"speed_efficiency": r(fit.speed_efficiency), "spin_efficiency": r(fit.spin_efficiency),
            "recovery_s": r(fit.recovery_s), "rms_drop": r(fit.rms), "shots": fit.shots, "note": fit.note}


ESC_SURVEY_GRID_MS = (0, 20, 50, 100, 150, 200, 400)   # the firmware's ESC_SURVEY_GRID_US, in ms (150 since 2026-11-18)
# How long the drill's end waits for the board's surveys of the last balls. 4 s until 2026-11-18: the survey's refined
# fits (36 steps, about 2.2 s a wheel) now queue behind the strokes (controller.SURVEY_QUEUE, 3 since 2026-11-18), and the
# wait ends sooner once no count has risen for SURVEY_QUIET_S (README "The ESC-lag survey's search, traced").
ESC_SURVEY_S = 20.0
SURVEY_QUIET_S = 3.0          # longer than one wheel's ESC-lag survey, so the wait does not stop between two wheels
ESC_SURVEY_MIN_WHEELS = 16    # fewer wheels than this and the survey's pick is reported but not advised


def survey(link, clock, sleep, tick_s, timeout=ESC_SURVEY_S):
    """Poll until the board's ESC_SURVEY and TAKE_SURVEY wheel counts stop rising for SURVEY_QUIET_S (the last balls'
    surveys are done or there were none), or `timeout`."""
    def count():
        return (link.esc_survey["wheels"] if link.esc_survey else -1,
                link.take_survey["wheels"] if link.take_survey else -1)
    start = last = clock()
    n = count()
    while clock() - start < timeout and clock() - last < SURVEY_QUIET_S:
        link.poll()
        m = count()
        if m != n:
            n, last = m, clock()
        sleep(tick_s)


def esc_tau_matches(pick_ms: float, board_ms: float) -> bool:
    """Whether a board running with `board_ms` of ESC lag agrees with a survey's refined pick: 0 only for 0, else within
    15% (the survey's refined lag came within 10% of the true one on the simulator, 30-150 ms)."""
    if not pick_ms:
        return not board_ms
    return abs(pick_ms - board_ms) <= 0.15 * pick_ms


def esc_lag_check(sv: dict | None, board_ms: int | None) -> str | None:
    """Before a drill: why the board's ESC_TAU_US should change first, or None. `sv` is the last survey from the shot
    log (`last_survey_from_log`), `board_ms` what the board reports now (ESC_TAU frame; None from older firmware).
    firmware/esp32/README.md "Checked before a calibration drill" (tests/esc_lag_check_sweep.py): on the simulator an
    untold 30-150 ms lag read the calibration drill's spin 8.7-16.1% off at worst, a first-order build told 50 ms
    12.0%, and told the survey's pick every build came within 1.9%; the slow-wheel hold makes an untold lag worse
    ("The 1.48x wheel")."""
    if not sv or (sv.get("wheels") or 0) < ESC_SURVEY_MIN_WHEELS:
        return None
    pick = sv["refined_ms"]
    if pick >= ESC_SURVEY_GRID_MS[-1]:
        return None        # the grid's last lag names no number to set (esc_survey_advice says to scope the ESC)
    when = f" ({sv['wheels']} wheels{', ' + sv['at'] if sv.get('at') else ''})"
    if board_ms is None:
        return (f"the board does not report its ESC_TAU_US (firmware older than 2026-11-16): the last survey{when} picks "
                f"{pick} ms; check config.py says {pick * 1000}")
    if esc_tau_matches(pick, board_ms):
        return None
    return (f"the board runs ESC_TAU_US = {board_ms * 1000} but the last survey{when} picks {pick} ms: set ESC_TAU_US = "
            f"{pick * 1000} in config.py and re-flash, or this drill's drop fits read spin far off")


TAKE_SURVEY_MS = (0, 1.5, 2.5, 3, 4, 5, 6, 7, 8)   # the firmware's TAKE_SURVEY_GRID_US, in ms (7 added 2026-11-19; 1.5 and
#                                                   2.5 in place of 2 later that day, README "Short takes on a second held-out set")
TAKE_SURVEY_S = 16.0          # a contact-time survey (5 t0 levels a fit, 2026-11-18) is the board's work after the last ball
# Advise a contact time only when the survey's best candidate misses by at most this share of the step's rms (README
# "The contact time surveyed on the board"): on the simulator 4 of 6 builds with an instant take picked 1.5-2.5 ms at
# 0.66-0.76 of the step's rms and read worse told it, while most spread takes fell to 0.29-0.6. Chosen on wheel lag 0.3 s,
# checked on 0.6 s (eval/take-survey-heldout-2026-11-17.txt).
TAKE_ADVISE_RATIO = 0.6
# The fewest wheels the take survey must have summed, after the take-blind ones were left out (controller.TAKE_SURVEY_BLIND),
# before the Pi advises a contact time (2026-11-18, firmware/esp32/README.md "The take survey's verdict needs two
# informative wheels"). ESC_SURVEY_MIN_WHEELS still counts every wheel surveyed. On the twelve stored sets a verdict that
# rested on one summed wheel was wrong 12 times in 37, on two 3 in 67, so 2 was pre-registered; on the fresh held-out
# set the six one-wheel verdicts were all right while 6 of 146 others were wrong, so by its rule it ships at 0 (off:
# the count is reported, nothing is held; tests/take_survey_kept.py, eval/take-survey-kept-2026-11-18.md). Older
# firmware sends no such count. Counted by drill on six more fresh sets (2026-11-19,
# eval/take-survey-kept-drills-2026-11-19.md): 6 of 432 drills ever rested a verdict on one kept wheel, too few for
# its pre-registered rule, so it stays 0 for simulated sets; reopen on a real wheel's logs.
TAKE_SURVEY_MIN_KEPT = 0
# The longest a calibration drill holds a ball for the last one's surveys: 8 s until the take survey's refits went to 5
# t0 levels (2026-11-18, README "The first-order take misfit traced"), about 10 s of control ticks a two-wheel ball;
# 14 s since the nine-point short-take grid (2026-11-19, README "Short takes on a second held-out set"): one more
# refit a wheel, and 12 s cut the test drill's surveys short.
TAKE_WAIT_S = 14.0


# The bound named when the Pi says TAKE_US = 0 (2026-11-19, firmware/esp32/README.md "Short takes that read 0: no ball
# saw them"): the first grid contact time whose mean rms is more than this share over the step's. A take shorter than
# a revolution shows only on balls whose contact straddles a revolution's edge; on 11 of the 17 short builds off by
# more than 1 ms no kept wheel did, and those balls fit an instant take as well as the true one. On five stored sets
# the true take was at most the bound on every build told TAKE_US = 0 (tests/take_shelf_bound.py), held out on set O.
TAKE_BOUND_TOL = 0.02
# ... and at least this many ppm over it (2026-11-19, README "A ppm floor on the bound"): the frame carries whole ppm, so
# at a 16-20 ppm step one ppm of rounding is 5-6% and cleared 2% alone (set O's two misses). Held out on set P: 48 of
# 48 within the bound against 46 of 48 at 2% alone, the instant builds still at 1.5 ms on 4 of 6.
TAKE_BOUND_FLOOR_PPM = 2
# The grid each frame length carries (older firmware: eight candidates before the short-take grid, seven before 7 ms)
TAKE_SURVEY_GRIDS_MS = {9: TAKE_SURVEY_MS, 8: (0, 2, 3, 4, 5, 6, 7, 8), 7: (0, 2, 3, 4, 5, 6, 8)}


def take_survey_bound(sv: dict | None) -> float | None:
    """The longest contact time, in ms, the survey's balls cannot tell from an instant one: the first grid candidate
    whose mean rms is more than TAKE_BOUND_TOL, and at least TAKE_BOUND_FLOOR_PPM, over the step's (0 ms). None without rms, or when every candidate fits
    within the tolerance (the balls bound nothing)."""
    rms = list((sv or {}).get("rms_ppm") or ())
    grid = TAKE_SURVEY_GRIDS_MS.get(len(rms))
    if not grid or not rms[0] or any(v is None for v in rms):
        return None
    for g, r in zip(grid[1:], rms[1:]):
        if r > max(rms[0] * (1 + TAKE_BOUND_TOL), rms[0] + TAKE_BOUND_FLOOR_PPM):
            return float(g)
    return None


def _bound_note(sv: dict) -> str:
    b = take_survey_bound(sv)
    if b is None:
        return ""
    return (f" (these balls cannot tell an instant take from one up to {b:g} ms: only a ball whose contact crosses a "
            f"revolution's edge shows a short one, so more balls narrow it)")


def _take_count(link) -> int:
    return link.take_survey["wheels"] if link.take_survey else 0


def take_survey_advice(sv: dict | None) -> str | None:
    """One line on the board's contact-time survey (firmware/esp32/README.md "The contact time surveyed on the board"):
    the contact time its balls pick and whether config.TAKE_US should change. None without a survey. Times are in ms;
    the frame carries 0.1 ms. The pick is rounded to 0.5 ms: on the simulator the drop's scatter was flat within
    0.02 points over +-0.5 ms of the true time (tests/take_fit.py's 5 and 6 ms candidates on a 6 ms take)."""
    if not sv:
        return None
    n = sv.get("wheels") or 0
    pick = round(2 * sv["refined_ms10"] / 10) / 2
    board = (sv.get("board_ms10") or 0) / 10
    if n < ESC_SURVEY_MIN_WHEELS:
        return (f"contact-time survey: {n} wheels so far pick {pick:g} ms; run more balls ({ESC_SURVEY_MIN_WHEELS} "
                f"wheels) before setting TAKE_US")
    rms = [v for v in (sv.get("rms_ppm") or ()) if v is not None]
    kept = sv.get("kept")
    if kept is not None and 0 < kept < TAKE_SURVEY_MIN_KEPT and any(rms):
        return (f"contact-time survey: {n} wheels, but only {kept} told the contact times apart (it picks {pick:g} ms); "
                f"run more balls ({TAKE_SURVEY_MIN_KEPT} such wheels) before setting TAKE_US")
    if rms and not any(rms):
        # every wheel was take-blind (controller.TAKE_SURVEY_BLIND): no ball's fit told the contact times apart
        return (f"contact-time survey: {n} wheels, none told the contact times apart (each ball's contact fitted "
                f"inside one revolution); keep TAKE_US = {int(board * 1000)} and run more balls")
    gain = min(rms) / rms[0] if rms and rms[0] else 0.0
    if pick > 0 and gain > TAKE_ADVISE_RATIO:
        return (f"contact-time survey: {n} wheels pick {pick:g} ms, but its fits miss only {1 - gain:.0%} less than the "
                f"step's (an instant take's builds reached 34% on the simulator): " +
                ("keep TAKE_US = 0" if board == 0 else "set TAKE_US = 0 in config.py and re-flash") + _bound_note(sv))
    if pick == 0:
        return f"contact-time survey: {n} wheels pick an instant take; " + (
            "keep TAKE_US = 0" if board == 0 else "set TAKE_US = 0 in config.py and re-flash") + _bound_note(sv)
    if pick >= TAKE_SURVEY_MS[-1]:
        # the grid's last contact time: no candidate above it to refine against (2026-11-18, firmware/esp32/README.md
        # "The take survey's pick between contact times": every simulated 7 ms take read 8 ms)
        end = TAKE_SURVEY_MS[-1]
        return (f"contact-time survey: {n} wheels pick the grid's last contact time, {end:g} ms: the balls' contact "
                f"lasts about {end - 1:g} ms or longer and this survey cannot name it more closely; " +
                (f"TAKE_US already matches ({board:g} ms)" if abs(end - board) <= 0.5 else
                 f"set TAKE_US = {int(end * 1000)} in config.py and re-flash"))
    if abs(pick - board) <= 0.5:
        return f"contact-time survey: {n} wheels pick {pick:g} ms; TAKE_US already matches ({board:g} ms)"
    return (f"contact-time survey: {n} wheels pick {pick:g} ms (least on the grid {sv['least_ms10'] / 10:g} ms); "
            f"set TAKE_US = {int(pick * 1000)} in config.py and re-flash")


def esc_survey_advice(sv: dict | None, esc_tau_ms: float = 0.0) -> str | None:
    """One line on the board's ESC-lag survey (firmware/esp32/README.md "The ESC lag surveyed on the board"): the lag
    its balls pick and whether config.ESC_TAU_US should change. None without a survey. The survey sums each wheel's
    fit residual at seven lags (150 ms added 2026-11-18, README "The ESC-lag survey between 100 and 200 ms"); on the
    simulator its refined lag came within 15% of the true one up to 150 ms and 0 on a wheel with no ESC lag; 165-300 ms
    on slow wheels read 20-60% off on some drills until the board's refits read 16 revolutions after the ball, not 8
    (2026-11-18, README "Long ESC lags: the survey read too little of the recovery"): then 70 of 70 simulated drills
    with ESC lags of 0-250 ms came within 15%. A pick at the grid's last lag (400 ms) only says the lag is long.
    `esc_tau_ms` is what the board ran with: the survey refits from the raw commands, so its
    pick does not depend on it."""
    if not sv or not sv.get("wheels"):
        return None
    n, pick = sv["wheels"], sv["refined_ms"]
    if n < ESC_SURVEY_MIN_WHEELS:
        return (f"ESC lag survey: {n} wheels so far pick {pick} ms; run more balls ({ESC_SURVEY_MIN_WHEELS} wheels, "
                f"8 two-wheel shots) before setting ESC_TAU_US")
    if pick == 0:
        return f"ESC lag survey: {n} wheels pick no ESC lag; keep ESC_TAU_US = 0" + (
            f" (the board ran with {esc_tau_ms:g} ms: set it back to 0)" if esc_tau_ms else "")
    if pick >= ESC_SURVEY_GRID_MS[-1]:
        return (f"ESC lag survey: {n} wheels pick the grid's last lag, {pick} ms: the ESC's lag is long and this survey "
                f"cannot name it; log the ESC's step response on a scope before setting ESC_TAU_US")
    same = esc_tau_ms and esc_tau_matches(pick, esc_tau_ms)
    return (f"ESC lag survey: {n} wheels pick {pick} ms (least on the grid {sv['least_ms']} ms)"
            + ("; ESC_TAU_US already matches" if same else f"; set ESC_TAU_US = {pick * 1000} in config.py and re-flash"))


class FeederLink:
    """Frames out, telemetry in, heartbeats kept up whenever `poll()` runs."""

    def __init__(self, port, clock):
        self.port, self.clock = port, clock
        self.decoder = P.Decoder()
        self.last: Telemetry | None = None
        self._hb = -1e9
        self.launch_log: list = []    # (clock when first seen, record dict) per new LAUNCH seq
        self._seq = None
        self._flags = None
        self.esc_survey: dict | None = None   # the last ESC_SURVEY frame (firmware/esp32/README.md "The ESC lag surveyed
                                              # on the board"), with the clock it came at
        self.esc_tau_ms: int | None = None    # the board's ESC_TAU_US in ms (ESC_TAU frame); None until one arrives
        self.take_survey: dict | None = None  # the last TAKE_SURVEY frame (README "The contact time surveyed on the
                                              # board"), with the clock it came at

    def send(self, cmd, *values):
        self.port.write(P.encode(cmd, *values))

    def poll(self) -> Telemetry | None:
        now = self.clock()
        if now - self._hb >= HEARTBEAT_S:
            self._hb = now
            self.send(P.HEARTBEAT)
        for cmd, vals in self.decoder.feed(self.port.read() or b""):
            if cmd == P.TELEMETRY:
                self.last = Telemetry(now, *vals)
            elif cmd == P.ESC_TAU:
                self.esc_tau_ms = vals[0]
            elif cmd == P.TAKE_SURVEY:
                # the frame's length says how many candidates it carries: firmware before 2026-11-19 sent seven, and
                # before that day's short-take grid eight (always with the summed-wheel byte)
                times = {5 + P.TAKE_SURVEY_TIMES: P.TAKE_SURVEY_TIMES,
                         5 + P.EIGHT_TAKE_SURVEY_TIMES: P.EIGHT_TAKE_SURVEY_TIMES}.get(len(vals), P.OLDER_TAKE_SURVEY_TIMES)
                nt = 4 + times
                self.take_survey = {"t": now, "wheels": vals[0], "least_ms10": vals[1], "refined_ms10": vals[2],
                                    "board_ms10": vals[3], "rms_ppm": [None if v == 65535 else v for v in vals[4:nt]],
                                    "kept": vals[nt] if len(vals) > nt else None}   # None: firmware before 2026-11-18
            elif cmd == P.ESC_SURVEY:
                self.esc_survey = {"t": now, "wheels": vals[0], "least_ms": vals[1], "refined_ms": vals[2],
                                   "rms_ppm": [None if v == 65535 else v for v in vals[3:]]}
            elif cmd == P.LAUNCH and (vals[0] != self._seq or vals[5] != self._flags):
                # Repeated every period until the next verdict. The same seq with new flags is that verdict's record
                # with the loop-command drops the board finished fitting after it (2026-11-16, firmware/esp32/README.md
                # "A recovery shaped by the loop's own commands"): it replaces the record in place.
                rec = {"seq": vals[0], "rpm_top": vals[1], "rpm_bottom": vals[2],
                       "drop_top": vals[3] / 1e4, "drop_bottom": vals[4] / 1e4,
                       "launched": bool(vals[5] & 1), "fit_top": bool(vals[5] & 2),
                       "fit_bottom": bool(vals[5] & 4), "loop_top": bool(vals[5] & 8),
                       "loop_bottom": bool(vals[5] & 16), "loop_pending": bool(vals[5] & 32),
                       "unsure_top": bool(vals[5] & 64), "unsure_bottom": bool(vals[5] & 128)}
                if vals[0] == self._seq and self.launch_log:
                    self.launch_log[-1][1].clear()
                    self.launch_log[-1][1].update(rec)
                else:
                    self.launch_log.append((now, rec))
                self._seq, self._flags = vals[0], vals[5]
        return self.last

    @property
    def errors(self) -> int:
        return self.decoder.errors


class Abort(Exception):
    pass


# Flags under which the board's feed gate stays shut: a queued FEED waits for them to clear (main.py's feed gate).
GATE_SHUT = P.FLAG_WHEELS_SETTLING | P.FLAG_AIM_SETTLING


def _wheels_ok(t: Telemetry, shot: PlannedShot) -> bool:
    """The firmware's own verdict (wheels held within 3% for 150 ms) and, as a check that the frame belongs to this
    shot's speeds rather than the last one's, the reported rpm within 5% of this shot's."""
    return not t.flags & P.FLAG_WHEELS_SETTLING and all(
        want and abs(r - want) < RPM_TOL * want for r, want in ((t.rpm_top, shot.rpm_top), (t.rpm_bottom, shot.rpm_bottom)))


def _faults(t: Telemetry, ignore=0) -> str | None:
    bad = [name for bit, name in FAULT_FLAGS.items() if t.flags & bit & ~ignore]
    return ", ".join(bad) or None


def _slow_wheel(shot) -> bool:
    """True when a turning wheel of `shot` is under HOLD_RPM: its drop needs the revolutions up to the verdict."""
    return any(0 < w < HOLD_RPM for w in (shot.rpm_top, shot.rpm_bottom))


def hold_s(shot) -> float:
    """Seconds after `shot`'s release before its wheels' targets may change: VERDICT_S for a shot with a wheel under
    HOLD_RPM, longer while its slowest wheel's ball still lacks the loop fit's revolutions (the board watches it past
    the verdict), at most HOLD_MAX_S + FRESH_S; 0 when no wheel needs a hold."""
    if not _slow_wheel(shot):
        return 0.0
    w = min(r for r in (shot.rpm_top, shot.rpm_bottom) if r > 0)
    revs = (LOOP_AFTER_REVS + 2) * 60.0 / w - BALL_LEAD_S
    return max(VERDICT_S, min(revs, HOLD_MAX_S) + FRESH_S)


def run_drill(link: FeederLink, shots: list, sleep, *, first_timeout_s=30.0, ready_timeout_s=10.0,
              release_timeout_s=2.0, link_timeout_s=0.5, tick_s=0.01, log=None, replan=None, prior_survey=None,
              hold_on_esc_lag=False, take_survey=False) -> DrillResult:
    """Run planned shots on the feeder. The first shot gets longer to be ready: the axes home at power-up.

    `prior_survey` (the last ESC_SURVEY from the shot log) is checked against the lag the board reports once it is
    connected (`esc_lag_check`): a mismatch is a warning, and with `hold_on_esc_lag` (a calibration drill) the run
    stops before its first ball with `held` set, the wheels never spun and no e-stop sent.

    `take_survey` (a calibration drill) asks the board to survey the ball's contact time too (SURVEY_TAKE) and turns it
    off again at the end; the drill's last TAKE_SURVEY frame is kept in `take_survey`.

    `replan(launches, remaining) -> list | None` (a `Refitter`), if given, is called before each shot after the first
    with this run's launch records so far and the shots not yet fed; a list it returns replaces them."""
    res = DrillResult()
    clock = link.clock
    fed_at = None                 # FLAG_HOPPER_EMPTY speaks for this run only in frames sent after its first FEED
                                  # (a FEED clears it; an older frame may still carry the last run's verdict)
    fed_shots = []                # shot index of each FEED, in order: the n-th LAUNCH record of the run is its verdict

    def launches():
        fresh = [rec for t, rec in link.launch_log if t >= fed_at + FRESH_S]
        return [dict(rec, shot=fed_shots[k]) for k, rec in enumerate(fresh[:len(fed_shots)])]

    def loop_fits(timeout=LOOP_FIT_S):
        """Wait (without failing) for a loop-command fit the board is still working through to come in: the record of
        the last verdict says so in its flags (firmware/esp32/README.md "A recovery shaped by the loop's own
        commands"). A board that never finishes costs `timeout`, and the record keeps the parabola's drops."""
        start = clock()
        while link.launch_log and link.launch_log[-1][1].get("loop_pending") and clock() - start < timeout:
            link.poll()
            sleep(tick_s)

    def wait(until, timeout, what, ignore=0, gate_cap=None):
        """Poll until `until(frame)`. With `gate_cap`, `timeout` runs from the last frame whose flags show the feed
        gate shut (wheels or aim settling), for up to `gate_cap` after the call: a release only starts once the gate opens."""
        start = first = clock()
        while True:
            t = link.poll()
            now = clock()
            if t is not None:
                for bit, text in WARN_FLAGS.items():
                    if t.flags & bit and text not in res.warnings:
                        res.warnings.append(text)
                        if log:
                            log(f"warning: {text}")
                if fed_at is not None and t.t >= fed_at + FRESH_S and t.flags & P.FLAG_HOPPER_EMPTY:
                    raise HopperEmpty()
                bad = _faults(t, ignore)
                if bad:
                    raise Abort(f"{what}: firmware reports {bad}")
                if now - t.t > link_timeout_s:
                    raise Abort(f"{what}: no telemetry for {now - t.t:.2f} s (cable, baud rate or board reset?)")
                if until(t):
                    return t
                if gate_cap is not None and t.flags & GATE_SHUT and now - first < gate_cap:
                    start = now
            elif now - start > link_timeout_s:
                raise Abort(f"{what}: no telemetry at all (wrong port, baud rate or role?)")
            if now - start > timeout:
                last = link.last
                if what == "connect" and last is not None and last.flags & P.FLAG_BUS_OFF:
                    raise Abort(f"{what}: {RESET_HINT}")
                raise Abort(f"{what}: not done in {timeout:.1f} s")
            sleep(tick_s)

    try:
        # The watchdog has usually tripped before the Pi starts talking; the first heartbeats clear it.
        start = clock()
        # The switched bus comes up 0.5 s after the e-stop's release plus the firmware's settle time: wait for it too.
        t0 = wait(lambda t: t.t >= start + FRESH_S and not t.flags & (P.FLAG_WATCHDOG | P.FLAG_BUS_OFF), 2.0, "connect",
                  ignore=P.FLAG_WATCHDOG | P.FLAG_BUS_OFF)
        fed = t0.balls_fed
        # The ESC_TAU frame rides with every telemetry frame; give an older board's silence three periods.
        waited = clock()
        while link.esc_tau_ms is None and clock() - waited < 0.35:
            link.poll()
            sleep(tick_s)
        res.esc_tau_ms = link.esc_tau_ms
        why = esc_lag_check(prior_survey, link.esc_tau_ms)
        if why:
            if hold_on_esc_lag and link.esc_tau_ms is not None:
                res.held = True
                res.aborted = f"calibration drill not started: {why} (pass --esc-lag-ok to run it anyway)"
                res.link_errors = link.errors
                return res
            res.warnings.append(why)
            if log:
                log(f"warning: {why}")
        if take_survey:
            link.send(P.SURVEY_TAKE, 1)
        last_release = None
        shots = list(shots)
        for k in range(len(shots)):
            if replan is not None and fed_at is not None:
                # The last stroke's verdict lands VERDICT_S after its release: wait for it, so the re-planner sees every
                # shot fed so far (half a second of the interval, which the next shot spends waiting anyway).
                h = max(VERDICT_S, hold_s(shots[k - 1]))
                wait(lambda t: t.t >= last_release + h, h + 1.0, f"shot {shots[k - 1].index}'s launch check")
                loop_fits()
                new = replan(launches(), shots[k:])
                if new is not None:
                    shots[k:] = new
            shot = shots[k]
            if k > 0 and last_release is not None and replan is None and _slow_wheel(shots[k - 1]) \
                    and not LOOP_THROUGH_CHANGE:
                h = hold_s(shots[k - 1])
                wait(lambda t: t.t >= last_release + h, h + 1.0, f"shot {shots[k - 1].index}'s launch check")
            link.send(P.SET_WHEELS, shot.rpm_top, shot.rpm_bottom)
            link.send(P.SET_AIM, shot.elevation_cdeg, shot.azimuth_cdeg)
            sent = clock()
            label = f"shot {shot.index}"
            ready = wait(lambda t: (t.t >= sent + FRESH_S and not t.flags & (P.FLAG_AIM_SETTLING | P.FLAG_AZ_UNHOMED)
                                    and _wheels_ok(t, shot)),
                         first_timeout_s if k == 0 else ready_timeout_s, f"{label} aim and wheels")
            ready_s = clock() - sent
            if last_release is not None:
                due = last_release + shot.interval_s
                ready = wait(lambda t: clock() >= due and _wheels_ok(t, shot), shot.interval_s + ready_timeout_s,
                             f"{label} interval")
                if take_survey:
                    # The board's surveys of the last ball take about 7 s of control ticks after its verdict and a
                    # new stroke cuts them, so a calibration drill feeds once the contact-time count has risen by the
                    # last shot's turning wheels (README "The contact time surveyed on the board"), or after
                    # TAKE_WAIT_S more; a wheel whose fit failed is never counted, hence the cap.
                    need = surveyed + sum(1 for r in (res.fed[-1].rpm_top, res.fed[-1].rpm_bottom) if r > 0)
                    held = clock()
                    ready = wait(lambda t: (_take_count(link) >= need or clock() >= held + TAKE_WAIT_S)
                                 and _wheels_ok(t, shot), TAKE_WAIT_S + ready_timeout_s, f"{label} survey")
                    res.survey_wait_s += clock() - held
            surveyed = _take_count(link)
            link.send(P.FEED, 1)
            fed_shots.append(shot.index)
            res.fed.append(shot)
            if fed_at is None:
                fed_at = clock()
            fed = (fed + 1) & 0xFF
            # The board strokes only once its gate holds the wheels steady again (SteadyGate restarts its 6-revolution
            # hold when a reading slips out of the 3% band), so the release timeout counts from the gate's last shut
            # frame (firmware/esp32/README.md "The slow drill's release timeout").
            gone = wait(lambda t: t.balls_fed == fed, release_timeout_s, f"{label} release",
                        gate_cap=ready_timeout_s + release_timeout_s)
            last_release = gone.t
            res.shots.append(ShotResult(shot.index, ready_s, gone.t, (ready.rpm_top, ready.rpm_bottom)))
            if log:
                log(f"{label}: ready in {ready_s:.2f} s, released at {gone.t:.2f} s")
        if last_release is not None and res.fed and _slow_wheel(res.fed[-1]):
            # the stop freezes the last stroke's snapshot too: a slow last wheel waits for its revolutions first
            h = hold_s(res.fed[-1])
            wait(lambda t: t.t >= last_release + h, h + 1.0, "last shot's launch check")
        link.send(P.SET_WHEELS, 0, 0)
        if last_release is not None:  # the last stroke's verdict (the stop above freezes it, it cannot fake a ball)
            wait(lambda t: t.t >= last_release + VERDICT_S, VERDICT_S + 1.0, "last shot's launch check")
            loop_fits()
            survey(link, clock, sleep, tick_s, TAKE_SURVEY_S if take_survey else ESC_SURVEY_S)
            if link.esc_survey is not None and link.esc_survey["t"] >= fed_at:
                res.esc_survey = {k: v for k, v in link.esc_survey.items() if k != "t"}
            if link.take_survey is not None and link.take_survey["t"] >= fed_at:
                res.take_survey = {k: v for k, v in link.take_survey.items() if k != "t"}
        if take_survey:
            link.send(P.SURVEY_TAKE, 0)
    except HopperEmpty:
        # Not a fault: nothing is queued (one FEED at a time) and nothing is wrong with the machine, so the wheels are
        # stopped without latching the e-stop; refill and run the drill again.
        link.send(P.SET_WHEELS, 0, 0)
        dry = res.shots.pop() if res.shots else None
        res.dry_shot = dry.index if dry else None
        res.aborted = (f"shot {dry.index}: " if dry else "") + HOPPER_EMPTY + f" ({len(res.shots)} shot{'' if len(res.shots) == 1 else 's'} flew)"
    except Abort as exc:
        link.send(P.ESTOP)            # halts the wheels and drops any queued ball
        res.aborted = str(exc)
    res.link_errors = link.errors
    if fed_at is not None:
        link.poll()
        res.launches = launches()
    return res


class SerialPort:
    """pyserial wrapped as the non-blocking port `FeederLink` wants (`pip install tennisbots[serial]`)."""

    def __init__(self, device, baud=115200):
        import serial  # optional dependency
        self.s = serial.Serial(device, baud, timeout=0)

    def write(self, data):
        self.s.write(data)

    def read(self):
        return self.s.read(256)


def reset_lift_hub(link: FeederLink, sleep, *, timeout_s=2.0, tick_s=0.01) -> str | None:
    """Tell the feeder the lift's slip hub was re-set on the bench, so its jam count in flash starts again
    (RESET_LIFT_HUB, 2026-11-16). Returns None once a fresh telemetry frame shows FLAG_LIFT_HUB_DUE clear, else why not."""
    clock = link.clock
    start = clock()
    t = None
    while clock() - start < timeout_s:              # heartbeats first: the watchdog drops commands until they arrive
        t = link.poll()
        if t is not None and t.t >= start + FRESH_S and not t.flags & P.FLAG_WATCHDOG:
            break
        sleep(tick_s)
    else:
        return "no telemetry from the feeder (wrong port, baud rate or role?)"
    if t.flags & (P.FLAG_ESTOP | P.FLAG_BUS_OFF):
        return "the e-stop is pressed or the bus is off: release it, then try again"
    link.send(P.RESET_LIFT_HUB, P.RESET_LIFT_HUB_KEY)
    sent = clock()
    while clock() - sent < timeout_s:
        t = link.poll()
        if t is not None and t.t >= sent + FRESH_S:
            if not t.flags & P.FLAG_LIFT_HUB_DUE:
                return None
        sleep(tick_s)
    return "the feeder still reports the hub due (firmware older than 2026-11-16, or its flash will not take a write)"


def reset_lift_hub_port(device) -> str | None:
    return reset_lift_hub(FeederLink(SerialPort(device), time.monotonic), time.sleep)


def append_shot_log(path, res: DrillResult, drill: str = "") -> int:
    """Append this run's launch records to a JSON-lines file (one object per judged stroke), then the board's ESC-lag
    survey as one line of its own (`{"esc_survey": ...}`, with the lag the board ran) when it sent one; returns how
    many launch records."""
    stamp = time.strftime("%Y-%m-%dT%H:%M:%S")
    with open(path, "a") as fh:
        for rec in res.launches:
            fh.write(json.dumps(dict(rec, at=stamp, drill=drill)) + "\n")
        if res.esc_survey:
            fh.write(json.dumps({"esc_survey": res.esc_survey, "esc_tau_ms": res.esc_tau_ms, "at": stamp,
                                 "drill": drill}) + "\n")
        if res.take_survey:
            fh.write(json.dumps({"take_survey": res.take_survey, "at": stamp, "drill": drill}) + "\n")
    return len(res.launches)


def _read_log_lines(path) -> list:
    with open(path) as fh:
        return [json.loads(line) for line in fh if line.strip()]


def read_shot_log(path) -> list:
    """The launch records of a shot log (survey lines left out)."""
    return [r for r in _read_log_lines(path) if "esc_survey" not in r and "take_survey" not in r]


def last_take_survey_from_log(path) -> dict | None:
    """The newest contact-time survey a shot log holds (the TAKE_SURVEY dict plus `at` and `drill`), or None."""
    try:
        lines = _read_log_lines(path)
    except (OSError, ValueError):
        return None
    for r in reversed(lines):
        if isinstance(r.get("take_survey"), dict):
            return dict(r["take_survey"], at=r.get("at"), drill=r.get("drill"))
    return None


def last_survey_from_log(path) -> dict | None:
    """The newest ESC-lag survey a shot log holds, as the ESC_SURVEY dict plus `at`, `drill` and the `esc_tau_ms` the
    board ran with; None if the file is missing or holds none. The board refits from its raw commands, so the pick
    does not depend on the lag it ran with, and the board's sums run from power-up, so the newest line holds the most
    wheels."""
    try:
        lines = _read_log_lines(path)
    except (OSError, ValueError):
        return None
    for r in reversed(lines):
        if isinstance(r.get("esc_survey"), dict):
            return dict(r["esc_survey"], at=r.get("at"), drill=r.get("drill"), esc_tau_ms=r.get("esc_tau_ms"))
    return None


def recovery_from_log(path, inertia: float = launcher.WHEEL_INERTIA_KGM2) -> float | None:
    """The tach's recovery time constant fitted from a shot log, if the log spans speeds enough to fit it (a
    calibration drill's does); None if the file is missing or the fit cannot say. It is a property of the wheel's
    speed loop, not of the felt or the balls, so an older log's figure still holds."""
    try:
        recs = read_shot_log(path)
        return launcher.fit_from_drops(recs, inertia=inertia).recovery_s
    except (OSError, ValueError):
        return None


def is_calibration(spec: dict) -> bool:
    """A drill whose shots feed the launcher fit (`"calibration": true`, as drill.calibration.json)."""
    return bool(spec.get("calibration"))


def run_file(path, device, log=print, *, refit_after: int | None = None, recovery_s: float | None = None,
             inertia: float = launcher.WHEEL_INERTIA_KGM2, prior_survey: dict | None = None,
             esc_lag_ok: bool = False) -> DrillResult:
    with open(path) as fh:
        spec = json.load(fh)
    shots = plan_drill(spec)
    link = FeederLink(SerialPort(device), time.monotonic)
    refit = Refitter(spec, after=refit_after, recovery_s=recovery_s, inertia=inertia, log=log) if refit_after else None
    res = run_drill(link, shots, time.sleep, log=log, replan=refit, prior_survey=prior_survey,
                    hold_on_esc_lag=is_calibration(spec) and not esc_lag_ok, take_survey=is_calibration(spec))
    res.refits = refit.events if refit else []
    return res
