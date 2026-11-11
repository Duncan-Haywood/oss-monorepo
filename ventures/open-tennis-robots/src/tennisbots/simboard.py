"""A simulated feeder board: the real firmware (firmware/esp32/main.py and controller.py) on stand-in pins.

The firmware's `machine` and `time` modules are replaced by stubs wired to a small plant model, so the bytes the
Pi sends go through the same Controller, FeederHw, Tach, StepDir and LinearAxis code that would run on the
ESP32. What the plant models, and what it assumes rather than measures:

- azimuth: exact, one step pulse is 1/k deg (open-loop stepper, no lost steps); the home switch closes at
  `AZ_HOME_DEG` and below. The head powers up at `az0_deg`.
- elevation: the actuator moves at the configured speeds (`ELEV_SPEED_*_MM_S`, themselves datasheet guesses)
  times the duty, stopping at its own ends; `speed_error` scales both to model an actuator that runs fast.
  In rc mode the actuator runs its own position loop toward the pulse at those speeds. The pot reads back
  linearly between the configured raw ends.
- wheels: first-order lag toward `esc_frac x wheel_full_rpm` with time constant `wheel_tau_s`. Both are
  assumptions (no ESC or motor has been measured); one tach pulse per revolution, at the exact crossing time.
- the feed gate: each opening of the gate servo is one ball released, logged with the true plant aim and wheel
  speeds at that instant (`releases`).

Needs a source checkout: the firmware is not part of the installed package.
"""

from __future__ import annotations

import importlib.util
import math
import os
import sys
import types

from . import protocol

FW_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "firmware", "esp32"))


def _load_firmware(cfg_overrides, board):
    if not os.path.isfile(os.path.join(FW_DIR, "main.py")):
        raise RuntimeError(f"firmware not found at {FW_DIR}: the simulated board needs a source checkout")
    spec = importlib.util.spec_from_file_location("fw_config", os.path.join(FW_DIR, "config.py"))
    cfg = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cfg)
    for k, v in cfg_overrides.items():
        setattr(cfg, k, v)
    with open(os.path.join(FW_DIR, "main.py")) as f:
        src = f.read().rstrip()
    if not src.endswith("run()"):
        raise RuntimeError("firmware main.py no longer ends with run(); update simboard")
    src = src[:-len("run()")]
    saved = {k: sys.modules.get(k) for k in ("machine", "time", "config", "protocol", "controller")}
    sys.modules.update(machine=board.machine, time=board.time, config=cfg, protocol=protocol)
    try:
        cspec = importlib.util.spec_from_file_location("controller", os.path.join(FW_DIR, "controller.py"))
        ctl_mod = importlib.util.module_from_spec(cspec)
        sys.modules["controller"] = ctl_mod
        cspec.loader.exec_module(ctl_mod)
        ns = {"__name__": "fw_main"}
        exec(compile(src, os.path.join(FW_DIR, "main.py"), "exec"), ns)
        hw = ns["FeederHw"]()
    finally:
        for k, v in saved.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v
    return cfg, ctl_mod, hw


class SimBoard:
    """The feeder ESP32 and its mechanics. `step(rx_bytes)` advances 1 ms and returns the bytes the board sends."""

    STEP_PIN, DIR_PIN, HOME_PIN, ESTOP_PIN = 14, 21, 22, 4
    ELEV_OUT, ELEV_DIR, ELEV_POT, GATE, ESC_TOP, ESC_BOTTOM = 27, 23, 39, 13, 25, 26
    TACH = (34, 35)

    def __init__(self, elev_mode="pot", *, az0_deg=0.0, elev0_mm=60.0, speed_error=1.0, wheel_full_rpm=9000.0,
                 wheel_tau_s=0.3, balls=60, cfg=None):
        self.now_us = 0
        self.pins = {self.HOME_PIN: 1, self.ESTOP_PIN: 0}
        self.irqs = {}
        self.pwms = {}
        self.estop_pressed = False
        self.az_steps = 0
        self.az0 = az0_deg
        self.stroke = elev0_mm
        self.speed_error = speed_error
        self.wheel_full_rpm, self.wheel_tau = wheel_full_rpm, wheel_tau_s
        self.wheel_rpm = [0.0, 0.0]
        self._revs = [0.0, 0.0]
        self.balls = balls
        self.releases = []
        self._gate_open = False
        self.machine, self.time = self._stubs()
        overrides = {"ELEV_MODE": elev_mode}
        overrides.update(cfg or {})
        self.cfg, self.controller, self.hw = _load_firmware(overrides, self)
        self.k = 200 * self.cfg.AZ_MICROSTEPS * self.cfg.AZ_RATIO / 360
        self.geom = self.controller.ElevationGeometry()
        self.ctl = self.controller.Controller(self.hw, self.controller.ROLE_FEEDER, self.now_ms)
        self._last_update = self.now_ms

    # --- stand-in machine and time modules -------------------------------------------------------------------
    def _stubs(self):
        board = self

        class Pin:
            IN, OUT, PULL_UP, IRQ_RISING, IRQ_FALLING = 0, 1, 2, 4, 8

            def __init__(self, n, mode=None, pull=None, value=None):
                self.n = n
                if value is not None:
                    board.pins[n] = value

            def value(self, v=None):
                if v is None:
                    return board._read_pin(self.n)
                prev = board.pins.get(self.n, 0)
                board.pins[self.n] = v
                if self.n == board.STEP_PIN and v and not prev:
                    board.az_steps += 1 if board.pins.get(board.DIR_PIN, 0) else -1

            def irq(self, handler, trigger=None):
                board.irqs[self.n] = handler

        class PWM:
            def __init__(self, pin, freq=0, duty_u16=0):
                self.n, self.duty = pin.n, duty_u16
                board.pwms[pin.n] = self

            def duty_u16(self, d):
                self.duty = d

        class ADC:
            ATTN_11DB = 3

            def __init__(self, pin, atten=None):
                self.n = pin.n

            def read_u16(self):
                return board._read_adc(self.n)

            def read_uv(self):
                return 2_400_000          # 26.4 V through the 11:1 divider

        def ticks_diff(a, b):
            return a - b

        machine = types.SimpleNamespace(Pin=Pin, PWM=PWM, ADC=ADC, UART=object)
        fake_time = types.SimpleNamespace(ticks_ms=lambda: board.now_us // 1000, ticks_us=lambda: board.now_us,
                                          ticks_diff=ticks_diff, sleep_us=lambda us: None, sleep_ms=lambda ms: None)
        return machine, fake_time

    def _read_pin(self, n):
        if n == self.HOME_PIN:
            return 0 if self.az_deg <= self.cfg.AZ_HOME_DEG + 1e-9 else 1
        if n == self.ESTOP_PIN:
            return 1 if self.estop_pressed else 0
        return self.pins.get(n, 0)

    def _read_adc(self, n):
        if n == self.ELEV_POT:
            lo, hi = self.cfg.ELEV_POT_RAW_RETRACTED, self.cfg.ELEV_POT_RAW_EXTENDED
            return int(round(lo + (hi - lo) * self.stroke / self.cfg.ELEV_STROKE_MM))
        return 0

    def _frac(self, n):
        """Servo pulse as 0..1 of 1.0-2.0 ms (None when no pulse)."""
        p = self.pwms.get(n)
        if p is None or p.duty == 0:
            return None
        us = p.duty / 65535 * 20000
        return max(0.0, min(1.0, (us - 1000) / 1000))

    # --- the plant ---------------------------------------------------------------------------------------------
    @property
    def now_ms(self):
        return self.now_us // 1000

    @property
    def az_deg(self):
        return self.az0 + self.az_steps / self.k

    @property
    def elev_deg(self):
        return self.geom.elev(self.stroke + self.cfg.ELEV_CLOSED_MM)

    def _plant(self, dt_us):
        dt = dt_us / 1e6
        ext = self.cfg.ELEV_SPEED_EXT_MM_S * self.speed_error
        ret = self.cfg.ELEV_SPEED_RET_MM_S * self.speed_error
        if self.cfg.ELEV_MODE == "rc":
            f = self._frac(self.ELEV_OUT)
            if f is not None:
                goal = f * self.cfg.ELEV_STROKE_MM
                d = goal - self.stroke
                step = (ext if d > 0 else ret) * dt
                self.stroke = goal if abs(d) <= step else self.stroke + math.copysign(step, d)
        else:
            p = self.pwms.get(self.ELEV_OUT)
            duty = (p.duty / 65535 if p else 0.0) * (-1 if self.pins.get(self.ELEV_DIR, 0) else 1)
            v = ext * duty if duty > 0 else ret * duty
            self.stroke = max(0.0, min(self.cfg.ELEV_STROKE_MM, self.stroke + v * dt))
        for i, n in enumerate((self.ESC_TOP, self.ESC_BOTTOM)):
            f = self._frac(n) or 0.0
            want = f * self.wheel_full_rpm
            a = 1 - math.exp(-dt / self.wheel_tau)
            prev = self.wheel_rpm[i]
            self.wheel_rpm[i] = prev + (want - prev) * a
            start = self._revs[i]
            self._revs[i] = start + (prev + self.wheel_rpm[i]) / 2 / 60 * dt
            whole = math.floor(self._revs[i])
            if whole > math.floor(start):
                # the pulse lands at the crossing time inside this step (one per revolution: a step is 1 ms, a turn
                # takes at least 8 ms below 7,500 rpm)
                frac = (whole - start) / (self._revs[i] - start)
                t_end = self.now_us
                self.now_us = t_end - dt_us + int(frac * dt_us)
                h = self.irqs.get(self.TACH[i])
                if h:
                    h(None)
                self.now_us = t_end
        gate = self._frac(self.GATE)
        is_open = gate is not None and gate > 0.5
        if is_open and not self._gate_open and self.balls > 0:
            self.balls -= 1
            self.releases.append({"t_ms": self.now_ms, "elev_deg": self.elev_deg, "az_deg": self.az_deg,
                                  "rpm": tuple(self.wheel_rpm)})
        self._gate_open = is_open

    def step(self, rx=b""):
        """Advance 1 ms: plant, then the firmware loop body (main.run without its sleep)."""
        self.now_us += 1000
        self._plant(1000)
        now = self.now_ms
        tx = self.ctl.tick(rx, now)
        dt = now - self._last_update
        if dt >= 10:
            if not (self.ctl.estop or self.ctl.watchdog_tripped):
                self.hw.update(dt, now)
            self._last_update = now
        return tx
