import os
import sys
import unittest

from mowerbot import protocol as P

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "firmware", "esp32"))
sys.modules.setdefault("protocol", P)  # firmware imports it by bare name, as on the board
import controller as C  # noqa: E402


class FakeHw:
    def __init__(self):
        self.button = self.lift = self.bump = self.wet = self.dock = False
        self.tilt = (0, 0)
        self.mv = 26000
        self.rpm = 0
        self.wheels = (0, 0)
        self.blade = 0
        self.brakes = 0

    def drive(self, left, right):
        self.wheels = (left, right)

    def stop_drive(self):
        self.wheels = (0, 0)

    def blade_set(self, rpm):
        self.blade = rpm

    def blade_brake(self):
        self.blade = 0
        self.brakes += 1

    def blade_rpm(self):
        return self.rpm

    def stop_button(self):
        return self.button

    def lifted(self):
        return self.lift

    def bumped(self):
        return self.bump

    def tilt_cdeg(self):
        return self.tilt

    def rain(self):
        return self.wet

    def charging(self):
        return self.dock

    def battery_mv(self):
        return self.mv


class Rig:
    def __init__(self):
        self.hw = FakeHw()
        self.t = 0
        self.ctl = C.Controller(self.hw, 0)

    def send(self, cmd, *v):
        self.ctl.tick(P.encode(cmd, *v), self.t)

    def run(self, ms, heartbeat=True):
        end = self.t + ms
        while self.t < end:
            self.t += 20
            self.ctl.tick(P.encode(P.HEARTBEAT) if heartbeat else b"", self.t)
            if self.hw.blade:
                self.hw.rpm = self.hw.blade

    def spin_up(self):
        self.send(P.BLADE, 2800)
        self.run(2000)
        return self.hw.blade


class ProtocolTest(unittest.TestCase):
    def test_round_trip_and_resync(self):
        d = P.Decoder()
        data = b"\x00\x13" + P.encode(P.DRIVE, 300, -300) + P.encode(P.BLADE, 2800)
        bad = bytearray(P.encode(P.BLADE, 1))
        bad[-1] ^= 0xFF
        frames = d.feed(data + bytes(bad) + P.encode(P.HEARTBEAT))
        self.assertEqual(frames, [(P.DRIVE, (300, -300)), (P.BLADE, (2800,)), (P.HEARTBEAT, ())])
        self.assertEqual(d.errors, 1)

    def test_split_frames(self):
        d = P.Decoder()
        f = P.encode(P.TELEMETRY, 5, 2, 2800, 25000, -120, 340)
        self.assertEqual(d.feed(f[:4]), [])
        self.assertEqual(d.feed(f[4:]), [(P.TELEMETRY, (5, 2, 2800, 25000, -120, 340))])


class BladeInterlockTest(unittest.TestCase):
    def test_blade_soft_starts_to_the_requested_rpm(self):
        r = Rig()
        r.send(P.BLADE, 2800)
        r.run(200)
        self.assertGreater(r.hw.blade, 0)
        self.assertLess(r.hw.blade, 1000)
        r.run(2000)
        self.assertEqual(r.hw.blade, 2800)

    def test_each_blocker_stops_the_blade_and_it_stays_off(self):
        cases = {
            "lift": lambda hw: setattr(hw, "lift", True),
            "bump": lambda hw: setattr(hw, "bump", True),
            "tilt": lambda hw: setattr(hw, "tilt", (2100, 0)),
            "rain": lambda hw: setattr(hw, "wet", True),
            "button": lambda hw: setattr(hw, "button", True),
            "dock": lambda hw: setattr(hw, "dock", True),
            "battery": lambda hw: setattr(hw, "mv", 20000),
        }
        for name, trip in cases.items():
            with self.subTest(name):
                r = Rig()
                self.assertEqual(r.spin_up(), 2800)
                trip(r.hw)
                r.run(20)
                self.assertEqual(r.hw.blade, 0, name)
                # Clearing the input alone never restarts it.
                r.hw.__init__()
                r.hw.rpm = 0
                r.run(500)
                self.assertEqual(r.hw.blade, 0, name)

    def test_blade_command_refused_while_blocked(self):
        r = Rig()
        r.hw.tilt = (0, 2500)
        r.run(40)
        before = r.ctl.rejected
        r.send(P.BLADE, 2800)
        r.run(500)
        self.assertEqual(r.hw.blade, 0)
        self.assertEqual(r.ctl.rejected, before + 1)

    def test_tilt_hysteresis(self):
        r = Rig()
        r.hw.tilt = (2100, 0)
        r.run(40)
        r.hw.tilt = (1700, 0)    # under 20 but over the 15 degree resume threshold
        r.run(40)
        r.send(P.BLADE, 2800)
        r.run(100)
        self.assertEqual(r.hw.blade, 0)
        r.hw.tilt = (1400, 0)
        r.run(40)
        self.assertEqual(r.spin_up(), 2800)

    def test_watchdog_stops_blade_and_wheels(self):
        r = Rig()
        r.spin_up()
        r.send(P.DRIVE, 300, 300)
        r.run(400, heartbeat=False)
        self.assertEqual(r.hw.blade, 0)
        self.assertEqual(r.hw.wheels, (0, 0))
        self.assertTrue(r.ctl.flags() & P.FLAG_WATCHDOG)
        r.run(100)  # heartbeats resume: watchdog clears, blade stays off until asked
        self.assertFalse(r.ctl.flags() & P.FLAG_WATCHDOG)
        self.assertEqual(r.hw.blade, 0)

    def test_disc_that_keeps_turning_latches_a_fault(self):
        r = Rig()
        r.spin_up()
        r.send(P.BLADE, 0)
        r.hw.rpm = 900           # the brake failed
        r.run(1600)
        self.assertTrue(r.ctl.flags() & P.FLAG_BLADE_FAULT)
        r.hw.rpm = 0
        r.send(P.BLADE, 2800)
        r.run(500)
        self.assertEqual(r.hw.blade, 0)

    def test_a_disc_that_stops_in_time_is_not_a_fault(self):
        r = Rig()
        r.spin_up()
        r.send(P.BLADE, 0)
        r.hw.rpm = 0
        r.run(1600)
        self.assertFalse(r.ctl.flags() & P.FLAG_BLADE_FAULT)


class LatchedStopTest(unittest.TestCase):
    def test_button_lift_and_tip_latch_everything(self):
        for name, attr, value, cause in (("button", "button", True, P.CAUSE_BUTTON),
                                         ("lift", "lift", True, P.CAUSE_LIFT),
                                         ("tip", "tilt", (3600, 0), P.CAUSE_TILT)):
            with self.subTest(name):
                r = Rig()
                r.spin_up()
                r.send(P.DRIVE, 300, 300)
                setattr(r.hw, attr, value)
                r.run(40)
                self.assertEqual((r.hw.blade, r.hw.wheels), (0, (0, 0)))
                self.assertTrue(r.ctl.stop_cause & cause)
                r.send(P.DRIVE, 300, 300)
                self.assertEqual(r.hw.wheels, (0, 0))
                # CLEAR_ESTOP is refused while the input is still active...
                r.send(P.CLEAR_ESTOP)
                self.assertTrue(r.ctl.latched)
                # ...and works once it is released.
                setattr(r.hw, attr, FakeHw().__dict__[attr])
                r.run(40)
                self.assertTrue(r.ctl.latched)
                r.send(P.CLEAR_ESTOP)
                self.assertFalse(r.ctl.latched)
                r.send(P.DRIVE, 300, 300)
                self.assertEqual(r.hw.wheels, (300, 300))

    def test_software_estop(self):
        r = Rig()
        r.spin_up()
        r.send(P.ESTOP)
        self.assertEqual(r.hw.blade, 0)
        self.assertTrue(r.ctl.stop_cause & P.CAUSE_SOFTWARE)


class DriveTest(unittest.TestCase):
    def test_bump_allows_only_reversing(self):
        r = Rig()
        r.send(P.DRIVE, 300, 300)
        r.hw.bump = True
        r.run(20)
        self.assertEqual(r.hw.wheels, (0, 0))
        r.send(P.DRIVE, 200, 200)
        self.assertEqual(r.hw.wheels, (0, 0))
        r.send(P.DRIVE, -200, -150)
        self.assertEqual(r.hw.wheels, (-200, -150))

    def test_clamps(self):
        r = Rig()
        r.send(P.DRIVE, 5000, -5000)
        self.assertEqual(r.hw.wheels, (C.MAX_DRIVE_MM_S, -C.MAX_DRIVE_MM_S))
        r.send(P.BLADE, 60000)
        self.assertEqual(r.ctl.blade_target, C.MAX_BLADE_RPM)

    def test_rain_allows_driving_home(self):
        r = Rig()
        r.hw.wet = True
        r.run(20)
        r.send(P.DRIVE, 300, 300)
        self.assertEqual(r.hw.wheels, (300, 300))
        self.assertTrue(r.ctl.flags() & P.FLAG_RAIN)

    def test_battery_cutoff_stops_driving(self):
        r = Rig()
        r.send(P.DRIVE, 300, 300)
        r.hw.mv = 20500
        r.run(20)
        self.assertEqual(r.hw.wheels, (0, 0))
        r.send(P.DRIVE, 300, 300)
        self.assertEqual(r.hw.wheels, (0, 0))
        self.assertTrue(r.ctl.flags() & P.FLAG_BATTERY_CUTOFF)

    def test_telemetry_frame(self):
        r = Rig()
        r.hw.tilt = (-150, 420)
        frames = []
        d = P.Decoder()
        for _ in range(10):
            r.t += 20
            frames += d.feed(r.ctl.tick(P.encode(P.HEARTBEAT), r.t))
        cmd, (flags, cause, rpm, mv, pitch, roll) = frames[-1]
        self.assertEqual((cmd, mv, pitch, roll, cause), (P.TELEMETRY, 26000, -150, 420, 0))


if __name__ == "__main__":
    unittest.main()
