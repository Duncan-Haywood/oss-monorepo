"""The MCPWM capture tach (2026-11-18, firmware/esp32/README.md "A tach timed in hardware"): capture.py's register
setup and tick arithmetic, controller.CaptureClock's periods, and the simulated board with TACH_CAPTURE on."""

import importlib
import os
import sys
import types
import unittest

HERE = os.path.dirname(__file__)
sys.path.insert(0, HERE)
from feeder_sim import FW, SimFeeder  # noqa: E402

import controller  # noqa: E402
from tennisbots import host, tach  # noqa: E402


class Mem(dict):
    def __missing__(self, addr):
        return 0


def load_capture(mem):
    saved = sys.modules.get("machine"), sys.modules.pop("capture", None)
    sys.modules["machine"] = types.SimpleNamespace(mem32=mem)
    try:
        return importlib.import_module("capture")
    finally:
        sys.modules.pop("capture", None)
        if saved[0] is None:
            sys.modules.pop("machine", None)
        else:
            sys.modules["machine"] = saved[0]
        if saved[1] is not None:
            sys.modules["capture"] = saved[1]


class CaptureRegistersTest(unittest.TestCase):
    def test_setup_writes_the_documented_registers(self):
        mem = Mem({0x3FF000C0: 0x1, 0x3FF000C4: 0xFFFFFFFF})
        cap = load_capture(mem)
        cap.setup(35, 1)
        self.assertEqual(mem[0x3FF000C0], 0x1 | 1 << 17)              # DPORT_PWM0_CLK_EN set, others kept
        self.assertEqual(mem[0x3FF000C4], 0xFFFFFFFF & ~(1 << 17))      # DPORT_PWM0_RST cleared, others kept
        self.assertEqual(mem[0x3FF5E000 + 0x120], 1)                    # MCPWM_CLK_EN
        self.assertEqual(mem[0x3FF44130 + 4 * 110], 0x80 | 35)          # PWM0_CAP1_IN_IDX 110 from GPIO 35
        self.assertEqual(mem[0x3FF5E000 + 0xF4], 0b101)                 # CAP1_EN, rising edge, no prescale
        self.assertEqual(mem[0x3FF5E000 + 0xE8], 1)                     # CAP_TIMER_EN

    def test_ticks_wrap_and_long_gaps(self):
        mem = Mem()
        cap = load_capture(mem)
        reg = 0x3FF5E000 + 0xFC
        mem[reg] = 0xFFFFFF00
        c = cap.Capture(34, 0)
        mem[reg] = 0x00000100                       # the 32-bit counter wrapped between two edges
        self.assertEqual(c.ticks(), 0x200)
        self.assertEqual(c.ticks(), 0)              # no new capture
        mem[reg] = (0x100 + 0x40000000) & 0xFFFFFFFF
        self.assertEqual(c.ticks(), -1)             # 2**30 ticks (13.4 s): too long to count without a big int


class CaptureClockTest(unittest.TestCase):
    def test_periods_add_up_to_the_floored_edge_times(self):
        clock = controller.CaptureClock()
        self.assertEqual(clock.period(12345, 100), 250001)             # first edge: a restart
        edges, t = [0], 0                                               # ticks since the restart's edge
        for k in range(2000):
            t += 80 * 6000 + (k * 37) % 79 - 39                         # 6,000 us +- half a us, in ticks
            edges.append(t)
        got = [clock.period(b - a, 6000) for a, b in zip(edges, edges[1:])]
        self.assertEqual(sum(got), edges[-1] // 80 - edges[0] // 80)
        self.assertTrue(got == [b // 80 - a // 80 for a, b in zip(edges, edges[1:])])

    def test_stalls_and_empty_interrupts(self):
        clock = controller.CaptureClock(stall_us=250000)
        clock.period(1, 0)
        self.assertEqual(clock.period(80 * 5000, 5000), 5000)
        self.assertEqual(clock.period(0, 5000), -1)                     # nothing captured: hand nothing on
        self.assertEqual(clock.period(-1, 5000), 250001)                # a gap too long for the counter
        self.assertEqual(clock.period(80 * 5000, 300000), 250001)       # the counter wrapped: ticks_us saw the stop
        self.assertEqual(clock.period(80 * 251000, 251000), 250001)


def drill_periods(**plant):
    with open(os.path.join(HERE, "..", "drill.example.json")) as f:
        import json
        shots = host.plan_drill(json.load(f))
    sim = SimFeeder(wheel_max_rpm=10000, seed=3, **plant)
    seen = []
    core = sim.hw.tach_top.core
    edge = core.edge

    def logged(p):
        seen.append(p)
        edge(p)

    core.edge = logged
    res = host.run_drill(host.FeederLink(sim, sim.clock), shots, sim.sleep)
    return sim, res, seen


class SimulatedCaptureTest(unittest.TestCase):
    def test_capture_reads_the_same_periods_as_a_clean_interrupt(self):
        a, ra, pa = drill_periods()
        b, rb, pb = drill_periods(tach_capture=True)
        self.assertIsNone(a.hw.tach_top.cap)
        self.assertIsNotNone(b.hw.tach_top.cap)
        self.assertTrue(ra.ok and rb.ok)
        # a period over the stall limit is a restart either way (PeriodTach.edge resets); the capture hands on stall + 1
        restart = lambda ps: [p if p <= 250000 else "restart" for p in ps]   # noqa: E731
        ra_, rb_ = restart(pa), restart(pb)
        self.assertEqual(len(ra_), len(rb_))
        # the capture floors to whole us counted from its first edge, the interrupt from the clock's own microsecond:
        # the same rounding on a shifted grid, so a period may differ by 1 us; the loop answers those differences, so
        # later in the drill the two wheels drift a few us apart (104 of 1,640 periods, from the third shot's slow-down)
        close = sum(x == y or (x != "restart" and y != "restart" and abs(x - y) <= 1) for x, y in zip(ra_, rb_))
        self.assertTrue(all(x == y or abs(x - y) <= 1 for x, y in zip(pa[1:1000], pb[1:1000])))
        self.assertGreater(close, 0.9 * len(ra_))
        self.assertEqual(len(a.released), len(b.released))
        for x, y in zip(a.released, b.released):
            self.assertAlmostEqual(x[0], y[0], delta=0.05)
            self.assertAlmostEqual(x[3], y[3], delta=0.01 * x[3])

    def test_handler_latency_does_not_reach_the_periods(self):
        _, ri, pi = drill_periods(tach_jitter_us=3.0)
        _, rc, pc = drill_periods(tach_jitter_us=3.0, tach_capture=True)
        _, r0, p0 = drill_periods()
        self.assertTrue(ri.ok and rc.ok and r0.ok)
        ji, jc, j0 = (tach.edge_jitter([p for p in ps if p < 20000])["jitter_us"] for ps in (pi, pc, p0))
        self.assertGreater(ji, 2.5)
        self.assertLess(jc, tach.SURVEY_SPEAKS_US)
        self.assertAlmostEqual(jc, j0, delta=0.1)

    def test_the_sensor_own_error_still_shows(self):
        _, rc, pc = drill_periods(tach_sensor_jitter_us=2.0, tach_capture=True)
        self.assertTrue(rc.ok)
        self.assertGreater(tach.edge_jitter([p for p in pc if p < 20000])["jitter_us"], 1.6)


if __name__ == "__main__":
    unittest.main()
