"""A simulated feeder board running the real firmware: controller.py and main.py's FeederHw.

main.py is executed on stand-in `machine` and `time` modules, so the board layer under test is the one that would be
flashed (tach interrupts, ESC loop, feed gate, axes). Only the physics is invented here, and it is an assumption, not
a measurement: each launcher wheel spins up as a first-order lag toward `WHEEL_MAX_RPM` x the ESC command, the
turntable follows the step pulses exactly (no lost steps), and the elevation actuator moves at the configured speeds
(timed) or reports its true stroke through the pot (pot). The feed shuttle moves toward the end its servo pulse
asks for at the CAD's loaded stroke times (`SHUTTLE_OUT_S`, `SHUTTLE_BACK_S`, from cad `Feeder.shuttle_drive`), and a
ball is released when it reaches the wheels with a ball in its pocket; the pocket refills after it has sat under the
column for `SHUTTLE_DROP_S`, while balls remain (`balls`: None is a bottomless hopper, an int is how many wait
behind the pocket's). A released ball takes its momentum from the wheels (2026-11-16): each wheel's speed drops by
J R / I at that instant, J from the ball's exit speed and spin in `tennisbots.launcher.WheelLauncher` (its own copy of
the model, so the firmware's `launch_dips` is checked against it) and I = `wheel_inertia` (the CAD's 0.00155 kg m^2
by default). The serial line is two byte queues. The contactor's coil (sensed on GPIO 15 since
2026-11-14) is on unless the wired e-stop is pressed or the wireless fob has cut it (`fob_cut`).
"""

import importlib.util
import os
import random
import shutil
import sys
import tempfile
import types
import weakref

from tennisbots import ballistics, launcher, protocol

FW = os.path.join(os.path.dirname(__file__), "..", "firmware", "esp32")
sys.path.insert(0, FW)
sys.modules.setdefault("protocol", protocol)
import controller  # noqa: E402

WHEEL_MAX_RPM = 9000.0
WHEEL_TAU_S = 0.4
SHUTTLE_OUT_S = 0.76      # cad Feeder.shuttle_drive, loaded forward stroke (assumed servo and friction)
SHUTTLE_BACK_S = 0.68
SHUTTLE_DROP_S = 0.14


class SimFeeder:
    def __init__(self, elev_mode="pot", az_start_deg=12.0, wheel_tau_s=WHEEL_TAU_S, wheel_max_rpm=WHEEL_MAX_RPM,
                 rpm_full=None, jam_log=None, balls=None, wheel_inertia=0.00155, launch_eff=1.0,
                 true_launcher=None, tach_jitter_us=0.0, esc_tau_s=0.0, seed=0):
        self.us = 1_000_000            # board clock, microseconds
        self.rx = bytearray()          # Pi -> board
        self.tx = bytearray()          # board -> Pi
        self.estop_button = False
        self.fob_cut = False           # wireless e-stop: drops the contactor's coil, the board sees no switch (2026-11-14)
        self.drop_cmd = None           # set to a command byte to lose the next such frame on the wire
        self.pot_broken = False
        self.pot_pickup = None         # f(duty, read index) -> volts added to each pot reading (tests/pot_pickup_sweep.py)
        self.elev_jammed = False       # the actuator does not move whatever the duty
        self.lift_over = False         # the lift's shunt comparator (GPIO 0, low = over the trip current; 2026-11-15)
        self.pack_mv = 25630           # battery reading; above REGEN_BRAKE_MAX_MV the wheels coast down (2026-11-14)
        self.brake_rise_mv = 0         # added to the reading while an ESC brakes: the charge current across the pack-side
                                       # resistance (cad Feeder.regen_guard: about 260 mV)
        state = self
        sim = self

        class Pin:
            IN, OUT, PULL_UP, IRQ_RISING, IRQ_FALLING = 0, 1, 2, 4, 8

            def __init__(self, n, *a, **k):
                self.n, self.v = n, k.get("value", 1)

            def value(self, v=None):
                if v is None:
                    if self.n == 4:
                        return 1 if sim.estop_button else 0
                    if self.n == 0:
                        return 0 if sim.lift_over else 1
                    if self.n == 15:           # contactor coil sense, low while energised: the wired e-stop and the
                        return 1 if sim.estop_button or sim.fob_cut else 0   # wireless fob are both in its series
                    return self.v
                self.v = v

            def irq(self, *a, **k):
                pass

        class PWM:
            def __init__(self, pin, freq=0, duty_u16=0):
                self.duty = duty_u16

            def duty_u16(self, d):
                self.duty = d

        class ADC:
            ATTN_11DB = 3

            def __init__(self, pin, atten=None):
                self.pin = pin
                self._n = 0

            def read_u16(self):
                cfg = state.cfg
                if state.pot_broken:
                    return 0
                lo, hi = cfg.ELEV_POT_RAW_RETRACTED, cfg.ELEV_POT_RAW_EXTENDED
                raw = lo + state.elev_true / cfg.ELEV_STROKE_MM * (hi - lo)
                if state.pot_pickup is not None:   # the pot spans its 3.3 V supply over the calibrated counts
                    raw += state.pot_pickup(state.hw.elev.duty, self._n) * (hi - lo) / 3.3
                    self._n += 1
                return int(min(max(raw, 0), 65535))

            def read_uv(self):          # GPIO 36, the battery divider (100k/10k)
                return int((sim.pack_mv + (sim.brake_rise_mv if sim.braking() else 0)) * 1000 / 11)

        machine = types.SimpleNamespace(Pin=Pin, PWM=PWM, ADC=ADC, UART=object)
        fake_time = types.SimpleNamespace(sleep_us=lambda us: None, sleep_ms=lambda ms: None,
                                          ticks_ms=lambda: state.us // 1000, ticks_us=lambda: state.us,
                                          ticks_diff=lambda a, b: a - b)
        spec = importlib.util.spec_from_file_location("fw_config", os.path.join(FW, "config.py"))
        self.cfg = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.cfg)
        self.cfg.ELEV_MODE = elev_mode
        if rpm_full is not None:
            self.cfg.WHEEL_RPM_FULL = rpm_full
        # The board's flash: the lift's jam count (LIFT_JAM_LOG). Each sim gets its own file unless a test passes one,
        # which is how a test power-cycles the board: a second SimFeeder on the same path.
        if jam_log is None:
            flash = tempfile.mkdtemp(prefix="otr-flash-")
            weakref.finalize(self, shutil.rmtree, flash, True)
            jam_log = os.path.join(flash, "lift_jams.json")
        self.cfg.LIFT_JAM_LOG = jam_log
        with open(os.path.join(FW, "main.py")) as f:
            src = f.read().rstrip()
        src = src[:-len("run()")]
        saved = {k: sys.modules.get(k) for k in ("machine", "time", "config")}
        sys.modules.update(machine=machine, time=fake_time, config=self.cfg)
        try:
            ns = {"__name__": "fw_main"}
            exec(compile(src, os.path.join(FW, "main.py"), "exec"), ns)
            self.hw = ns["FeederHw"]()
        finally:
            for k, v in saved.items():
                if v is None:
                    sys.modules.pop(k, None)
                else:
                    sys.modules[k] = v
        hw = self.hw
        # Turntable: true angle follows the step pulses; the switch closes at or below the home angle.
        self.az_true = az_start_deg
        k = hw.azim.k

        class Turntable:
            def home_closed(self):
                return state.az_true <= state.cfg.AZ_HOME_DEG

            def pulse(self, n):
                state.az_true += n / k

        hw.azim_pins = Turntable()
        self.elev_true = 60.0          # actuator stroke at power-up, mm (unknown to timed mode)
        self.wheel = [0.0, 0.0]
        self.rev = [0.0, 0.0]
        self.wheel_tau = wheel_tau_s
        self.wheel_max = wheel_max_rpm
        self.released = []             # (time s, elevation deg, azimuth deg, rpm top, rpm bottom, target) as each ball
        self.shuttle = 0.0             # reaches the wheels; shuttle position, 0 retracted .. 1 at the wheels
        self.loaded = True             # a ball sits in the pocket
        self.balls = balls             # balls behind the pocket's (column, hose and tub); None never runs out
        self.wheel_inertia = wheel_inertia
        self.launch_eff = launch_eff   # scales the ball's take from the wheels (a ball that slips through, 0..1)
        # the build's real efficiencies (tests/launch_fit_sweep.py); None is the planner's own WheelLauncher()
        self.true_launcher = true_launcher or launcher.WheelLauncher()
        self.exits = []                # (speed m/s, topspin rad/s) of each released ball: what a radar gun would read
        # Plants that are not the first-order lag (2026-11-16, tests/loop_residual_sweep.py): each tach edge moved by a
        # normal error of `tach_jitter_us`, and an ESC whose own speed control lags its command by `esc_tau_s`.
        self.tach_jitter_us, self.esc_tau = tach_jitter_us, esc_tau_s
        self._drive = [0.0, 0.0]
        self._rng = random.Random(seed)
        self._under_col_ms = 0
        self.shuttle_out_s, self.shuttle_back_s = SHUTTLE_OUT_S, SHUTTLE_BACK_S
        self.ctl = controller.Controller(hw, controller.ROLE_FEEDER, self.us // 1000)
        self._last_update_ms = self.us // 1000

    def braking(self):
        """An ESC brakes when it is driven (non-zero throttle) slower than its wheel turns; zero throttle coasts."""
        return any(0 < c and self.wheel_max * c < w - 1.0 for c, w in zip(self.hw.esc_cmd, self.wheel))

    # -- the Pi's side of the cable
    def write(self, data):
        if self.drop_cmd is not None and len(data) > 1 and data[1] == self.drop_cmd:
            self.drop_cmd = None
            return
        self.rx.extend(data)

    def read(self):
        out, self.tx = bytes(self.tx), bytearray()
        return out

    def clock(self):
        return self.us / 1e6

    def sleep(self, s):
        self.run_ms(max(1, round(s * 1000)))

    # -- physics and the firmware main loop, 1 ms at a time
    def run_ms(self, ms):
        hw = self.hw
        for _ in range(ms):
            t0 = self.us
            for i, tach in enumerate((hw.tach_top, hw.tach_bottom)):
                if self.esc_tau:
                    self._drive[i] += (hw.esc_cmd[i] - self._drive[i]) * 0.001 / self.esc_tau
                else:
                    self._drive[i] = hw.esc_cmd[i]
                target = self.wheel_max * self._drive[i]
                self.wheel[i] += (target - self.wheel[i]) * 0.001 / self.wheel_tau
                before = self.rev[i]
                self.rev[i] += self.wheel[i] / 60000.0
                if int(self.rev[i]) > int(before):   # one pulse per revolution, timed within the millisecond
                    frac = (int(self.rev[i]) - before) / (self.rev[i] - before)
                    self.us = t0 + int(frac * 1000)
                    if self.tach_jitter_us:
                        self.us += int(round(self._rng.gauss(0.0, self.tach_jitter_us)))
                    tach._p(None)
            self.us = t0 + 1000
            if hw.elev.mode != controller.ELEV_RC and not self.elev_jammed:
                d = hw.elev.duty
                v = self.cfg.ELEV_SPEED_EXT_MM_S if d > 0 else self.cfg.ELEV_SPEED_RET_MM_S
                self.elev_true = min(max(self.elev_true + v * d * 0.001, 0.0), self.cfg.ELEV_STROKE_MM)
            now = self.us // 1000
            out = self.ctl.tick(bytes(self.rx), now)
            self.rx = bytearray()
            self.tx.extend(out)
            if now - self._last_update_ms >= 10:
                if not (self.ctl.estop or self.ctl.watchdog_tripped):
                    hw.update(now - self._last_update_ms, now)
                self._last_update_ms = now
            mid_us = (self.cfg.GATE_LO_US + self.cfg.GATE_HI_US) / 2
            gate_out = hw.gate.pwm.duty > int(mid_us / 20000 * 65535)
            if gate_out:
                self.shuttle = min(1.0, self.shuttle + 0.001 / self.shuttle_out_s)
                if self.shuttle >= 1.0 and self.loaded:
                    self.loaded = False
                    stroke = self.elev_true + self.cfg.ELEV_CLOSED_MM
                    self.released.append((self.clock(), hw.elev.geom.elev(stroke), self.az_true,
                                          self.wheel[0], self.wheel[1], tuple(hw.target_rpm)))
                    self._take_momentum()
            else:
                self.shuttle = max(0.0, self.shuttle - 0.001 / self.shuttle_back_s)
            if self.shuttle <= 0.0 and not self.loaded:
                self._under_col_ms += 1
                if self._under_col_ms >= SHUTTLE_DROP_S * 1000 and (self.balls is None or self.balls > 0):
                    self.loaded, self._under_col_ms = True, 0
                    if self.balls is not None:
                        self.balls -= 1
            else:
                self._under_col_ms = 0

    def _take_momentum(self):
        """The ball leaves with the launcher model's speed and spin for the wheels' speeds now; the wheels lose the
        momentum it carries (a thin shell: I_b = 2/3 m r^2), split by the spin."""
        lm = self.true_launcher
        ball = ballistics.DEFAULT_BALL
        v, spin = lm.exit(max(self.wheel[0], 0.0), max(self.wheel[1], 0.0))
        self.exits.append((v, spin))
        lin = ball.mass * v
        rot = 2.0 / 3.0 * ball.mass * ball.radius * spin
        for i, j in enumerate(((lin + rot) / 2, (lin - rot) / 2)):
            dw = self.launch_eff * j * lm.wheel_radius / self.wheel_inertia * 30 / 3.141592653589793
            self.wheel[i] = max(0.0, self.wheel[i] - dw)
