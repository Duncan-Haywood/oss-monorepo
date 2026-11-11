"""A simulated feeder board running the real firmware: controller.py and main.py's FeederHw.

main.py is executed on stand-in `machine` and `time` modules, so the board layer under test is the one that would be
flashed (tach interrupts, ESC loop, feed gate, axes). Only the physics is invented here, and it is an assumption, not
a measurement: each launcher wheel spins up as a first-order lag toward `WHEEL_MAX_RPM` x the ESC command, the
turntable follows the step pulses exactly (no lost steps), and the elevation actuator moves at the configured speeds
(timed) or reports its true stroke through the pot (pot). The serial line is two byte queues.
"""

import importlib.util
import os
import sys
import types

from tennisbots import protocol

FW = os.path.join(os.path.dirname(__file__), "..", "firmware", "esp32")
sys.path.insert(0, FW)
sys.modules.setdefault("protocol", protocol)
import controller  # noqa: E402

WHEEL_MAX_RPM = 9000.0
WHEEL_TAU_S = 0.4


class SimFeeder:
    def __init__(self, elev_mode="pot", az_start_deg=12.0, wheel_tau_s=WHEEL_TAU_S, wheel_max_rpm=WHEEL_MAX_RPM,
                 rpm_full=None):
        self.us = 1_000_000            # board clock, microseconds
        self.rx = bytearray()          # Pi -> board
        self.tx = bytearray()          # board -> Pi
        self.estop_button = False
        self.drop_cmd = None           # set to a command byte to lose the next such frame on the wire
        self.pot_broken = False
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
                    return self.v
                self.v = v

            def irq(self, *a):
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

            def read_u16(self):
                cfg = state.cfg
                if state.pot_broken:
                    return 0
                lo, hi = cfg.ELEV_POT_RAW_RETRACTED, cfg.ELEV_POT_RAW_EXTENDED
                return int(lo + state.elev_true / cfg.ELEV_STROKE_MM * (hi - lo))

            def read_uv(self):
                return 2_330_000

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
        self.released = []             # (time s, elevation deg, azimuth deg, rpm top, rpm bottom) at each gate opening
        self._gate_was_open = False
        self.ctl = controller.Controller(hw, controller.ROLE_FEEDER, self.us // 1000)
        self._last_update_ms = self.us // 1000

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
                target = self.wheel_max * hw.esc_cmd[i]
                self.wheel[i] += (target - self.wheel[i]) * 0.001 / self.wheel_tau
                before = self.rev[i]
                self.rev[i] += self.wheel[i] / 60000.0
                if int(self.rev[i]) > int(before):   # one pulse per revolution, timed within the millisecond
                    frac = (int(self.rev[i]) - before) / (self.rev[i] - before)
                    self.us = t0 + int(frac * 1000)
                    tach._p(None)
            self.us = t0 + 1000
            if hw.elev.mode != controller.ELEV_RC:
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
            gate_open = hw.gate.pwm.duty > int(1500 / 20000 * 65535)
            if gate_open and not self._gate_was_open:
                stroke = self.elev_true + self.cfg.ELEV_CLOSED_MM
                self.released.append((self.clock(), hw.elev.geom.elev(stroke), self.az_true,
                                      self.wheel[0], self.wheel[1], tuple(hw.target_rpm)))
            self._gate_was_open = gate_open
