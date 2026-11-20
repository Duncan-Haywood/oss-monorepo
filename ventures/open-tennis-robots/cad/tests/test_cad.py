"""CAD checks. Skipped when build123d is not installed (pip install -r cad/requirements.txt)."""

import json
import math
import subprocess
import sys
import tempfile
import unittest
import unittest.mock
from pathlib import Path

try:
    from build123d import GeomType
    HAVE_CAD = True
except ImportError:  # pragma: no cover
    HAVE_CAD = False

from otr_cad.params import (AWG_AMPS, AWG_OHM_PER_M, FUSE_SIZES_A, Collector, Feeder, fuse_for, gauge_for, rlc_step,
                            time_above)

HERE = Path(__file__).resolve().parent
COMMITTED = HERE.parent.parent / "manufacturing" / "collector-package.zip"
COMMITTED_FEEDER = HERE.parent.parent / "manufacturing" / "feeder-package.zip"

# The package builds run in fresh processes, as a maker runs them (ezdxf's writer state can carry over between builds
# in one process after other tests have read DXFs). They start when the module loads and run beside the other tests:
# the feeder's takes ~10 min, since it runs every clash sweep (elevation, azimuth, feed stroke, cable loop) on the
# design as drawn. So those sweeps' clean-design checks live in FeederPackageTest, and the geometry tests below run
# only the cheap "can fail" cases (P066, 2026-11-13: the cad CI job had reached 19 of its 20 minutes).
_BUILDS: dict = {}


def setUpModule():
    if not HAVE_CAD:
        return
    _BUILDS["tmp"] = tempfile.TemporaryDirectory()
    for robot in ("collector", "feeder"):
        out = Path(_BUILDS["tmp"].name) / robot
        log = open(Path(_BUILDS["tmp"].name) / f"{robot}.log", "wb")   # a file, not a pipe nobody drains
        _BUILDS[robot] = (out, log, subprocess.Popen([sys.executable, "-m", "otr_cad", robot, "--out", str(out)],
                                                     cwd=HERE.parent, stdout=log, stderr=subprocess.STDOUT))


def tearDownModule():
    for robot in ("collector", "feeder"):
        if robot in _BUILDS:
            _, log, proc = _BUILDS.pop(robot)
            if proc.poll() is None:
                proc.kill()
            proc.wait()
            log.close()
    if "tmp" in _BUILDS:
        _BUILDS.pop("tmp").cleanup()


def fresh_build(robot: str) -> Path:
    """Wait for the module's build of `robot` and return its folder (the zip sits beside it)."""
    out, log, proc = _BUILDS[robot]
    proc.wait()
    if not (out / "manifest.json").exists():
        log.flush()
        text = Path(log.name).read_text(errors="replace")
        raise AssertionError(f"{robot} build failed (exit {proc.returncode}):\n{text[-3000:]}")
    return out


class ParamsTest(unittest.TestCase):
    def test_defaults_pass_design_rules(self):
        p = Collector()
        self.assertEqual(p.check(), [])
        self.assertTrue(0.7 * p.ball_d <= p.rod_gap <= 0.85 * p.ball_d)
        self.assertGreaterEqual(p.drum_capacity(), 75)

    def test_rules_catch_bad_changes(self):
        self.assertTrue(any("drum" in r for r in Collector(drum_x=300.0).check()))
        self.assertTrue(any("rod gap" in r for r in Collector(rod_gap_target=70.0).check()))
        self.assertTrue(any("motor" in r for r in Collector(motor_len=240.0).check()))


@unittest.skipUnless(HAVE_CAD, "build123d not installed")
class GeometryTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from otr_cad import collector as C
        cls.C = C
        cls.p = Collector()
        cls.parts = C.all_parts(cls.p)

    def test_no_collisions_and_three_ground_contacts(self):
        from otr_cad.package import collisions, ground_contacts
        self.assertEqual(collisions(self.parts), [])
        contacts = ground_contacts(self.parts)
        self.assertEqual(set(contacts), {"wheel", "ball_caster", "drum_disc"})
        for z in contacts.values():
            self.assertAlmostEqual(z, 0.0, places=2)

    def test_collision_check_can_fail(self):
        from otr_cad.package import collisions
        bad = self.C.all_parts(Collector(motor_face_inset=-20.0))
        self.assertTrue(any("wheel" in c for c in collisions(bad)))

    def test_printed_part_bolts_line_up_with_base_plate_holes(self):
        """Every vertical insert pocket or clearance hole meeting the base plate lands on a base-plate hole."""
        base = next(x for x in self.parts if x.name == "base_plate")
        holes = [(e.arc_center.X, e.arc_center.Y) for e in base.flat.edges()
                 if e.geom_type == GeomType.CIRCLE and abs(e.radius - 2.2) < 1e-6]
        radii = (self.p.insert_hole_d / 2, 2.2)
        checked = 0
        for part in self.parts:
            if part.kind != "print":
                continue
            for solid in part.placed():
                for f in solid.faces():
                    if f.geom_type != GeomType.CYLINDER or min(abs(f.radius - r) for r in radii) > 1e-6:
                        continue
                    ax = f.axis_of_rotation
                    if abs(abs(ax.direction.Z) - 1) > 1e-6:
                        continue
                    z0 = f.bounding_box().min.Z
                    # Holes that start at the base top face (z = base_top), or reach down through it.
                    if abs(z0 - self.p.base_top) > 1e-3 and abs(f.bounding_box().max.Z - self.p.base_z) > 1e-3:
                        continue
                    x, y = ax.position.X, ax.position.Y
                    self.assertTrue(any(math.hypot(x - hx, y - hy) < 0.01 for hx, hy in holes),
                                    f"{part.name} hole at ({x:.1f}, {y:.1f}) has no base-plate hole")
                    checked += 1
        self.assertGreaterEqual(checked, 4 + 4 + 4 + 4)   # cradles, pivot blocks, mast socket, caster adapter

    def test_insert_pockets_fit_the_insert(self):
        """2026-11-20: the pilots were 4.0-4.4 mm, which no M4 heat-set insert fits."""
        n = 0
        for part in self.parts:
            if part.kind == "print":
                n += sum(1 for f in part.shape.faces() if f.geom_type == GeomType.CYLINDER
                         and abs(f.radius - self.p.insert_hole_d / 2) < 1e-6)
        self.assertEqual(n, 4 + 2 + 2 + 4)   # one cradle's top and bottom, one pivot block, the mast socket

    def test_laser_parts_fit_a_standard_sheet(self):
        for part in self.parts:
            if part.kind == "laser":
                bb = part.flat.bounding_box()
                self.assertLessEqual(max(bb.size.X, bb.size.Y), 1220, part.name)  # 4 x 8 ft sheet

    def test_rods_pass_through_disc_holes(self):
        disc = next(x for x in self.parts if x.name == "drum_disc")
        rod_holes = [e for e in disc.flat.edges()
                     if e.geom_type == GeomType.CIRCLE and abs(e.radius - (self.p.rod_d + 0.2) / 2) < 1e-6]
        self.assertEqual(len(rod_holes), self.p.n_rods)
        for e in rod_holes:
            self.assertAlmostEqual(math.hypot(e.arc_center.X, e.arc_center.Y), self.p.rod_circle_r, places=6)


@unittest.skipUnless(HAVE_CAD, "build123d not installed")
class AssemblyGuideTest(unittest.TestCase):
    """The guide's checks pass on the design and fail on the faults they were written for (2026-11-20)."""

    @classmethod
    def setUpClass(cls):
        from otr_cad import collector as C, guide as G
        from otr_cad.package import COTS_EXTRA, fasteners
        cls.C, cls.G = C, G
        cls.p = Collector()
        cls.parts = C.all_parts(cls.p)
        cls.rows = [{"item": n, "kind": "cots", "qty": q} for n, q, _ in fasteners(cls.p) + COTS_EXTRA]

    def test_design_passes_every_guide_check(self):
        rows, bad = self.G.joint_checks(self.p, self.parts)
        self.assertEqual(bad, [])
        self.assertEqual(len(rows), 11)
        self.assertEqual(self.G.tally(self.p, self.parts, self.rows), [])
        self.assertEqual(self.G.order_problems(self.p, self.parts), [])
        self.assertEqual(self.G.hatch_check(self.p, self.parts), [])

    def test_joint_stacks_are_measured_from_the_cad(self):
        rows = {r["joint"]: r for r in self.G.joint_checks(self.p, self.parts)[0]}
        self.assertEqual(rows["drum axle"]["grip_mm"], 19.0)        # arm 5 + spacer 7 + bearing 7
        self.assertEqual(rows["rod clamp ring"]["grip_mm"], 8.0)    # ring 3 + disc 5
        self.assertEqual(rows["yoke pivot"]["spare_mm"], self.p.pivot_float)
        self.assertEqual(rows["caster adapter + plate to mast socket"]["grip_mm"], 10.5)

    def test_short_fasteners_fail(self):
        """The BOM's old M4 x 12 on the clamp rings, and a thicker plate under unchanged screws."""
        import dataclasses
        j = next(x for x in self.G.joints(self.p) if x.name == "rod clamp ring")
        old = dataclasses.replace(j, length=12)
        with unittest.mock.patch.object(self.G, "joints", lambda p: [old]):
            self.assertTrue(any("rod clamp ring" in b for b in self.G.joint_checks(self.p, self.parts)[1]))
        thick = Collector(plate_t=8.0)
        bad = self.G.joint_checks(thick, self.C.all_parts(thick))[1]
        self.assertTrue(any("rod clamp ring" in b for b in bad))
        self.assertTrue(any("cradle to base" in b for b in bad))

    def test_old_arm_gap_traps_the_hatch(self):
        tight = Collector(arm_gap=3.0)
        self.assertTrue(any("hatch" in r for r in tight.check()))
        self.assertTrue(self.G.hatch_check(tight, self.C.all_parts(tight)))

    def test_old_mast_position_is_a_rule(self):
        self.assertTrue(any("mast_x" in r for r in Collector(mast_x=-235.0).check()))

    def test_tally_and_order_catch_a_lost_step(self):
        rows = [dict(r) for r in self.rows]
        rows[0]["qty"] += 1
        self.assertTrue(self.G.tally(self.p, self.parts, rows))
        real = self.G.steps
        with unittest.mock.patch.object(self.G, "steps", lambda p: [s for s in real(p) if s.parts != ["base_plate"]]):
            self.assertTrue(any("base_plate" in b for b in self.G.tally(self.p, self.parts, self.rows)))
            self.assertTrue(any("touches nothing" in b for b in self.G.order_problems(self.p, self.parts)))

    def test_guide_is_in_the_package(self):
        out = fresh_build("collector")
        text = (out / "guide" / "ASSEMBLY.md").read_text()
        self.assertIn("all pass.", text)
        self.assertEqual(text.count("![Step"), 11)
        self.assertEqual(len(list((out / "guide").glob("step_*.svg"))), 11)


@unittest.skipUnless(HAVE_CAD, "build123d not installed")
class PackageTest(unittest.TestCase):
    def test_package_contents_and_reproducibility(self):
        import ezdxf
        from otr_cad.package import build
        with tempfile.TemporaryDirectory() as d:
            m = build(Path(d) / "collector", drawings=False)
            out = Path(d) / "collector"
            self.assertEqual(m["design_rules"], [])
            self.assertEqual(m["collisions"], [])
            for name in ("bom.csv", "cut_list.csv", "laser_parts.csv", "print_parts.csv", "README.txt",
                         "step/assembly.step"):
                self.assertTrue((out / name).exists(), name)
            first = (Path(d) / "collector-package.zip").read_bytes()
            build(Path(d) / "collector", drawings=False)
            self.assertEqual(first, (Path(d) / "collector-package.zip").read_bytes())
            dxfs = sorted((out / "laser").glob("*.dxf"))
            self.assertGreaterEqual(len(dxfs), 6)
            for f in dxfs:
                doc = ezdxf.readfile(f)
                self.assertEqual(doc.header.get("$INSUNITS"), 4)  # millimetres
                self.assertGreater(len(list(doc.modelspace())), 0)
            self.assertGreaterEqual(len(list((out / "print").glob("*.stl"))), 5)

    def test_committed_package_is_current(self):
        """manufacturing/collector-package.zip must match what the generator makes today."""
        import zipfile
        self.assertTrue(COMMITTED.exists(), "run: python -m otr_cad collector --out ../manufacturing/collector")
        with zipfile.ZipFile(COMMITTED) as z:
            committed = json.loads(z.read("collector/manifest.json"))
        fresh = json.loads((fresh_build("collector") / "manifest.json").read_text())
        self.assertEqual(committed["params"], json.loads(json.dumps(fresh["params"])))
        folder = json.loads((COMMITTED.parent / "collector" / "manifest.json").read_text())
        self.assertEqual(folder["files"], committed["files"], "manufacturing/collector/ and the zip disagree")
        stale = sorted(k for k in set(committed["files"]) | set(fresh["files"])
                       if committed["files"].get(k) != fresh["files"].get(k))
        self.assertEqual(stale, [], "stale: rebuild with python -m otr_cad collector --out ../manufacturing/collector")


class FeederParamsTest(unittest.TestCase):
    def test_defaults_pass_design_rules(self):
        p = Feeder()
        self.assertEqual(p.check(), [])
        self.assertGreater(p.turntable_top, p.mast_top_z)

    def test_cable_loop_fits_every_pose_of_the_actuator_travel(self):
        # 2026-11-13: one cut length must make a loop from the turntable gland to the head clip at every elevation the
        # actuator can reach, its own limits included (beyond the -15..+45 deg the drills use)
        p = Feeder()
        ext, ret = p.elev_act_limits()
        self.assertAlmostEqual(p.elev_act_len(ext), p.elev_act_closed + p.elev_act_stroke, places=3)
        self.assertAlmostEqual(p.elev_act_len(ret), p.elev_act_closed, places=3)
        self.assertLess(ext, p.elev_min)
        self.assertGreater(ret, p.elev_max)
        d = p.cable_loop_design()
        lo, hi = d["window"]
        self.assertGreater(hi - lo, 20.0)                      # room for a cutting and tying error
        for e, (rlo, rhi) in d["ranges"].items():
            self.assertLessEqual(rlo, d["cut_mm"])
            self.assertGreaterEqual(rhi, d["cut_mm"])
        self.assertLess(d["fit_err_mm"], 2.0)                  # each pose's drawn curve is the cut length
        self.assertEqual(d["r_min"], 30.0)                     # 10 x the 3 mm phase wire
        self.assertGreater(d["lowest_z"], p.turntable_top + d["rb"] - 1e-6)

    def test_cable_loop_rules_catch_bad_changes(self):
        # a clip directly under the pivot: the bundle has no room to loop between the turntable and the bolt
        d = Feeder(cable_clip_x=0.0, cable_clip_z=-222.0, cable_clip_dir_deg=-90.0).cable_loop_design()
        self.assertTrue(d is None or d["window"] is None)
        if d:   # the shortest bundle that fits grows by about 13 mm from 0 deg to the retract limit
            self.assertGreater(max(r[0] for r in d["ranges"].values()) - min(r[0] for r in d["ranges"].values()), 10.0)
        # stiffer wire (15 x its diameter) no longer fits, nor does a clip 30 mm higher on the standoff
        for kw in ({"cable_bend_factor": 15.0}, {"cable_clip_z": -150.0}):
            d = Feeder(**kw).cable_loop_design()
            self.assertTrue(d is None or d["window"] is None, kw)
            self.assertTrue(any("no single cable length" in r for r in Feeder(**kw).check_cables()), kw)
        # a clamp just under the stepper leaves too short a run for the twist
        self.assertTrue(any("twists" in r for r in Feeder(cable_clamp_z=560.0).check_cables()))

    def test_elev_lead_fits_every_pose_of_the_actuator_travel(self):
        # 2026-11-14: the actuator's own lead, from the cheek's grommet to a tie on its body, is cut once and must fit
        # from the extend limit to the retract limit; the tie moves about 80 mm over that travel
        p = Feeder()
        d = p.elev_lead_design()
        lo, hi = d["window"]
        self.assertGreater(hi - lo, 15.0)                      # room for a cutting and tying error
        for e, (rlo, rhi) in d["ranges"].items():
            self.assertLessEqual(rlo, d["cut_mm"])
            self.assertGreaterEqual(rhi, d["cut_mm"])
        self.assertEqual(set(d["ranges"]), set(p.cable_loop_poses()))
        self.assertLess(d["fit_err_mm"], 2.0)
        self.assertEqual(d["r_min"], 20.0)                     # 10 x the 2.0 mm 18 AWG wire
        self.assertGreater(d["tie_travel_mm"], 60.0)
        # the retract limit (nose up) needs the most lead, the extend limit (nose down) the least slack
        ext, ret = p.elev_act_limits()
        self.assertAlmostEqual(lo, d["ranges"][ret][0])
        self.assertAlmostEqual(hi, d["ranges"][ext][1])
        # any elevation between the limits gets a curve at the cut length, not only the design poses
        self.assertIsNotNone(p.elev_lead_curve(25.0))
        self.assertLess(d["stall_drop_frac"], 0.01)
        self.assertEqual(p.check_elev_lead(), [])

    def test_elev_lead_rules_catch_bad_changes(self):
        # a tie near the anchor eye, or a lead kept inside the actuator's outer face, leaves no single length
        for kw in ({"elev_lead_tie_mm": 15.0}, {"elev_lead_out_mm": 0.0}):
            self.assertTrue(any("no single length" in r for r in Feeder(**kw).check_elev_lead()), kw)
        # the hole on a foot, too small, or too low
        self.assertTrue(any("foot" in r for r in Feeder(elev_lead_hole_dx=-35.0).check_elev_lead()))
        self.assertTrue(any("too small" in r for r in Feeder(elev_lead_hole_d=6.0).check_elev_lead()))
        self.assertTrue(any("bottom edge" in r for r in Feeder(elev_lead_hole_d=46.0).check_elev_lead()))
        # an actuator that stalls above what 18 AWG carries
        self.assertTrue(any("under its" in r for r in Feeder(elev_act_stall_a=12.0).check_elev_lead()))

    def test_cable_twist_run(self):
        p = Feeder()
        t = p.cable_twist()
        self.assertAlmostEqual(t["rate_deg_m"], p.az_reach_deg / (t["run_mm"] / 1000))
        self.assertLessEqual(t["rate_deg_m"], p.cable_twist_deg_m)
        self.assertGreater(t["hole_gap_mm"], 2.0)
        self.assertLess(t["helix_strain"], 1e-3)               # the outer wire barely stretches at that twist
        self.assertGreater(t["clamp_below_stepper_mm"], 10.0)

    def test_servo_supply_droop_and_ground_shift(self):
        # 2026-11-13: the buck is on the deck, so the servo's return shares the ESP32's ground; at stall the leads'
        # drop lowers the servo's voltage and lifts its ground under the 3.3 V signal
        p = Feeder()
        s = p.servo_supply(0.8, 380.0)
        r_motor = p.servo_supply_v / p.servo_stall_a
        for awg, row in s["awg"].items():
            r_lead = s["run_m"] * AWG_OHM_PER_M[awg]
            self.assertAlmostEqual(row["v_term"] + 2 * row["ground_shift_v"], p.servo_supply_v, places=9)
            self.assertAlmostEqual(row["v_term"] / r_motor, row["ground_shift_v"] / r_lead, places=6)
        thin, chosen = s["awg"][26], s["chosen"]
        self.assertLess(thin["v_term"], chosen["v_term"])
        self.assertLess(thin["signal_high_v"], p.servo_vih + 0.4)   # a stock 26 AWG lead leaves little signal margin
        self.assertGreater(chosen["signal_high_v"], p.servo_vih + 0.6)
        self.assertGreaterEqual(chosen["torque_margin"], p.servo_torque_factor)
        self.assertGreater(s["run_m"], 1.3)
        self.assertLess(s["run_m"], 2.2)
        bad = Feeder(servo_lead_awg=26, servo_vih=2.6).check_cables(0.8)
        self.assertTrue(any("ground rises" in r for r in bad), bad)
        bad = Feeder(servo_stall_nm=1.0).check_cables(0.8)
        self.assertTrue(any("torque it needs" in r for r in bad), bad)

    def test_elevation_drive_sizing(self):
        p = Feeder()
        # a head whose centre of mass sits 60 mm behind and 190 mm above the pivot at 0 deg (about the CAD's)
        w, cx, cz = 6.7 * 9.81, -60.0, 190.0
        grav = {e: -w * (cx * math.cos(math.radians(e)) - cz * math.sin(math.radians(e))) / 1000
                for e in (-15.0, 0.0, 15.0, 30.0, 45.0)}
        d = p.elevation_drive(grav)
        self.assertEqual(p.check_elevation(grav), [])
        self.assertTrue(d["one_way"] and d["monotonic"])    # always a push: no backlash flip mid-range
        self.assertGreater(d["push_peak_n"], 0)
        self.assertLessEqual(p.elev_act_closed, d["closed_max_mm"])
        self.assertGreaterEqual(p.elev_act_closed, d["closed_min_mm"])   # its retract limit stops the head in time
        self.assertGreaterEqual(p.elev_act_closed + p.elev_act_stroke, d["extended_min_mm"])
        # the push at +45 deg is at least gravity alone over the lever arm there
        top = d["rows"][-1]
        self.assertGreaterEqual(top["push_n"] + 1e-9, grav[45.0] * 1000 / abs(top["arm_mm"]))
        # nose up shortens the actuator (the pin swings down and back)
        self.assertLess(p.elev_act_len(45.0), p.elev_act_len(-15.0))
        # failures are reported
        from dataclasses import replace
        self.assertTrue(any("retracted" in r for r in replace(p, elev_act_closed=260.0).check_elevation(grav)))
        self.assertTrue(any("turntable plate" in r for r in replace(p, elev_act_closed=240.0).check_elevation(grav)))
        self.assertTrue(any("reaches" in r for r in replace(p, elev_act_stroke=100.0).check_elevation(grav)))
        self.assertTrue(any("push" in r for r in replace(p, elev_act_force_n=150.0).check_elevation(grav)))
        self.assertTrue(any("cheek" in r for r in replace(p, elev_act_y=-60.0).check_elevation(grav)))
        self.assertTrue(any("feed column" in r for r in replace(p, elev_pin_x=-150.0).check_elevation(grav)))

    def test_shuttle_drive_sizing(self):
        p = Feeder()
        # the crank's dead centres are the two ends of the stroke, and the pin passes the shuttle's own stroke
        self.assertAlmostEqual(p.shuttle_kinematics(0)[0], p.shuttle_pin_x)
        self.assertAlmostEqual(p.shuttle_kinematics(180)[0] - p.shuttle_kinematics(0)[0], p.feed_stroke)
        xs = [p.shuttle_kinematics(t)[0] for t in range(0, 181, 5)]
        self.assertEqual(xs, sorted(xs))                       # monotonic: no back-and-forth inside the stroke
        d = p.shuttle_drive(0.45)
        self.assertEqual(p.check_shuttle_drive(0.45), [])
        self.assertGreater(d["torque_margin"], p.servo_torque_factor)
        self.assertLess(d["offset_mm"], d["jam_offset_mm"] / 2)
        self.assertLess(d["cycle_s"], p.feed_interval_min_s)
        self.assertGreater(d["fwd"]["stroke_s"], d["no_load_stroke_s"])  # load slows the servo
        # a linear actuator of the elevation class could not feed a ball every drill interval
        self.assertGreater(d["actuator_cycle_s"], 3 * p.feed_interval_min_s)
        # torque at the dead centres is zero; the peak is near mid-stroke and equals F * crank throw within the rod term
        f = d["fwd"]["peak_force_n"]
        self.assertGreater(d["fwd"]["peak_torque_nm"], 0.9 * f * p.crank_r / 1000)
        self.assertLess(d["fwd"]["peak_torque_nm"], 1.15 * f * p.crank_r / 1000)

    def test_shuttle_drive_rules_catch_bad_changes(self):
        self.assertTrue(any("stall" in r for r in Feeder(servo_stall_nm=0.9).check_shuttle_drive(0.45)))
        self.assertTrue(any("drill interval" in r for r in Feeder(servo_s_per_60=0.3).check_shuttle_drive(0.45)))
        self.assertTrue(any("jams" in r for r in Feeder(feed_mu_slide=1.2).check_shuttle_drive(0.45)))
        self.assertTrue(any("solid rear" in r for r in Feeder(shuttle_pin_back=100.0).check_shuttle_drive(0.45)))

    def test_firmware_gate_times_cover_the_loaded_strokes(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location("fw_config", HERE.parent.parent / "firmware" / "esp32" / "config.py")
        cfg = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cfg)
        p = Feeder()
        d = p.shuttle_drive(0.46)             # the CAD shuttle is 0.448 kg; a little over it
        self.assertGreaterEqual(cfg.GATE_OUT_MS / 1000, d["fwd"]["stroke_s"] + p.feed_dwell_s)
        self.assertGreaterEqual(cfg.GATE_BACK_MS / 1000, d["back"]["stroke_s"] + d["drop_s"])
        self.assertLessEqual((cfg.GATE_OUT_MS + cfg.GATE_BACK_MS) / 1000, p.feed_interval_min_s)

    def test_elevation_hose_moment_is_bounded_by_the_pull(self):
        p = Feeder()
        for e in (-15.0, 0.0, 45.0):
            mx, mz = p.mouth_world(e)
            r = math.hypot(mx - p.head_x, mz - p.pivot_z) / 1000
            self.assertLessEqual(abs(p.elev_hose_moment_nm(e)), p.hose_pull_n * r + 1e-9)

    def test_rules_catch_bad_changes(self):
        self.assertTrue(any("wheel gap" in r for r in Feeder(wheel_gap=67.0).check()))
        self.assertTrue(any("ball path" in r for r in Feeder(plate_half_y=36.0).check()))
        self.assertTrue(any("muzzle" in r for r in Feeder(head_x=-300.0).check()))
        self.assertTrue(any("drive motors" in r for r in Feeder(rail_z=90.0).check()))

    def test_feed_rules_catch_bad_changes(self):
        self.assertTrue(any("meter" in r for r in Feeder(shuttle_h=140.0).check()))
        self.assertTrue(any("retainer" in r for r in Feeder(retain_t=3.0).check()))  # arms too stiff for the wheels
        self.assertTrue(any("retainer" in r for r in Feeder(retain_t=0.4).check()))   # too weak to hold
        self.assertEqual(Feeder().check(), [])
        self.assertTrue(any("top wheel" in r for r in Feeder(feed_col_x=-100.0).check()))
        self.assertTrue(any("stroke" in r for r in Feeder(feed_stroke=40.0).check()))
        self.assertTrue(any("holds about" in r for r in Feeder(tub_h=150.0).check()))
        self.assertTrue(any("falls only" in r for r in Feeder(hopper_out_x=-60.0, hopper_out_z=1300.0).check()))
        self.assertTrue(any("bows" in r for r in Feeder(hopper_out_z=1500.0, hose_min_bend=400.0).check()))

    def test_launch_window_is_the_edge_of_the_launch_check(self):
        p = Feeder()
        lo, hi, why = p.launch_window()
        self.assertTrue(lo < p.launch_v_max < hi)  # the shipped 25 m/s sits inside the window
        self.assertEqual(Feeder(launch_v_max=hi * 0.999).check_launch(), [])
        self.assertTrue(Feeder(launch_v_max=hi * 1.001).check_launch())
        self.assertTrue(Feeder(launch_v_max=lo * 0.999).check_launch())
        self.assertEqual(Feeder(launch_v_max=lo * 1.001).check_launch(), [])
        self.assertIn(why, ("wheel rpm", "nip traction"))
        # more topspin: the slow end rises (bottom wheel) and the fast end falls (top wheel)
        lo2, hi2, _ = p.launch_window(3500.0)
        self.assertTrue(lo2 > lo and hi2 < hi)
        self.assertEqual(p.launch_window(4000.0)[:2], (0.0, 0.0))  # no speed carries that much spin
        # a soft ball squeeze: traction binds and the window shrinks; very soft, none passes
        self.assertEqual(Feeder(ball_stiff_n_mm=15.0).launch_window()[2], "nip traction")
        self.assertEqual(Feeder(ball_stiff_n_mm=5.0).launch_window()[:2], (0.0, 0.0))

    def test_plate_clearance_is_a_yaw_tolerance(self):
        p = Feeder()
        c = p.plate_clearance()
        self.assertAlmostEqual(c["gap_mm"], 6.5)
        self.assertAlmostEqual(c["run_mm"], 110 + 33.5 + p.nip_x)
        self.assertAlmostEqual(math.tan(math.radians(c["yaw_tol_deg"])), c["gap_mm"] / c["run_mm"])
        # slower ball: longer in the head, so the same sideways speed margin shrinks
        self.assertLess(p.plate_clearance(18.0)["side_speed_ms"], c["side_speed_ms"])
        self.assertAlmostEqual(c["side_speed_ms"], c["yaw_tol_deg"] and
                               25.0 * math.tan(math.radians(c["yaw_tol_deg"])), places=6)
        # wider plate gap, more yaw allowed
        self.assertGreater(Feeder(plate_half_y=45.0).plate_clearance()["yaw_tol_deg"], c["yaw_tol_deg"])

    def test_axle_squaring_stack_fits_inside_the_plate_yaw_limit(self):
        p = Feeder()
        a = p.axle_squaring()
        self.assertAlmostEqual(a["limit_deg"], p.plate_clearance()["yaw_tol_deg"])
        self.assertLessEqual(a["rss_deg"], a["worst_deg"])
        self.assertAlmostEqual(a["worst_deg"], a["motor_seat_deg"] + a["bore_offset_deg"] + a["plate_parallel_deg"])
        self.assertGreater(a["margin"], 3.0)  # the shipped tolerances leave room: no reaming needed
        # a sloppy build eats the margin
        self.assertLess(Feeder(plate_slot_play_mm=4.0, seat_gap_mm=1.0).axle_squaring()["margin"], a["margin"])

    def test_launch_checks_tie_the_head_to_the_flight_model(self):
        p = Feeder()
        self.assertAlmostEqual(p.nip_len, 74.0, delta=0.5)
        rt, rb = p.launch_rpm
        self.assertTrue(0 < rb < rt < p.wheel_rpm_max)
        # the same wheel speeds the flight model's launcher gives for this shot
        sys.path.insert(0, str(HERE.parent.parent / "src"))
        try:
            from tennisbots.launcher import WheelLauncher
        except ImportError:  # pragma: no cover
            return
        w = WheelLauncher()
        self.assertEqual((w.speed_efficiency, w.spin_efficiency, w.max_rpm), (p.speed_eff, p.spin_eff, p.wheel_rpm_max))
        wt, wb = w.wheel_rpm(p.launch_v_max, p.launch_topspin_rpm * 2 * math.pi / 60)
        self.assertAlmostEqual(rt, wt, delta=1.0)
        self.assertAlmostEqual(rb, wb, delta=1.0)
        # catches bad changes
        self.assertTrue(any("rpm" in r for r in Feeder(launch_v_max=30.0).check()))
        self.assertTrue(any("nip pushes" in r for r in Feeder(launch_v_max=25.0, ball_stiff_n_mm=10.0).check()))
        self.assertTrue(any("nip pushes" in r for r in Feeder(wheel_mu=0.4).check()))

    def test_hose_is_longer_than_every_chord_and_the_mouth_swings_back_when_nose_up(self):
        p = Feeder()
        self.assertGreaterEqual(p.hose_len, max(c for _, c, _ in p.hose_chords()))
        self.assertLess(p.mouth_world(45.0)[0], p.mouth_world(-15.0)[0])
        self.assertAlmostEqual(p.mouth_world(0.0)[0], p.head_x + p.feed_col_x, places=6)

    def test_hose_end_directions_show_the_gap_the_chord_check_hides(self):
        # Outlet straight down, socket along the tilted column: at a low outlet some pose has no curve within the
        # bend and fall limits; at the 2026-11-04 outlet every pose fits but not with one cut length.
        self.assertIsNone(Feeder(hopper_out_x=-330.0, hopper_out_z=1560.0).hose_take_up_mm())
        raised = Feeder(hopper_out_x=-330.0, hopper_out_z=1700.0)
        self.assertTrue(all(x is not None for _, x in raised.hose_pose_ranges()))
        self.assertGreater(raised.hose_take_up_mm(), 200.0)
        # A single floating pulley moves half the hose it pays out.
        self.assertAlmostEqual(raised.take_up_stroke_mm(), raised.hose_take_up_mm() / 2)
        self.assertIsNone(Feeder(hopper_out_x=-330.0, hopper_out_z=1560.0).take_up_stroke_mm())

    def test_every_extra_degree_of_nose_up_costs_the_hose_take_up(self):
        r = Feeder().hose_take_up_by_elev_max()
        vals = [t for _, t in r]
        self.assertTrue(all(v is not None for v in vals))
        self.assertEqual(vals, sorted(vals))   # more tilt never needs less take-up
        # A gentler hose (tighter bends allowed) can only widen the fit.
        self.assertTrue(all(x is not None for _, x in Feeder(hose_min_bend=100.0).hose_pose_ranges()[1:4]))

    def test_take_up_design_reaches_every_pose_with_the_stroke(self):
        p = Feeder(hopper_out_x=-330.0, hopper_out_z=1700.0)   # the pulley's sizing, kept for comparison
        t = p.take_up_design()
        self.assertTrue(t["ok"])
        self.assertAlmostEqual(t["stroke_mm"], p.take_up_stroke_mm(), places=6)
        self.assertEqual(t["pulley_d_mm"], 2 * p.hose_min_bend)
        self.assertAlmostEqual(t["track_mm"], t["stroke_mm"] + t["pulley_d_mm"] + 60)
        for e, xlo, xhi in t["poses"]:       # the pulley can reach a position inside every pose's window
            self.assertLessEqual(xlo, t["stroke_mm"] + 1e-9)
            self.assertLessEqual(xlo, xhi)
        self.assertIsNone(Feeder(hopper_out_x=-330.0, hopper_out_z=1560.0).take_up_design())

    def test_a_pulley_loop_cannot_carry_balls(self):
        # A hose wrapped round a horizontal axle turns by the wrap angle; from straight down it may turn only until
        # it reaches the minimum fall, so a ball-carrying hose wraps at most 90 - 30 = 60 deg, not the 180 a floating
        # pulley needs.
        p = Feeder()
        self.assertAlmostEqual(p.pulley_wrap_max_deg(), 60.0)
        self.assertFalse(p.pulley_take_up_passes_balls())
        self.assertFalse(Feeder(feed_min_slope_deg=0.0).pulley_take_up_passes_balls())

    def test_sleeve_take_up_fits_every_pose_and_the_old_outlet_does_not(self):
        p = Feeder()
        t = p.sleeve_take_up_design()
        self.assertIsNotNone(t)
        lo, hi = t["free_mm"]
        self.assertAlmostEqual(hi - lo, t["stroke_mm"])
        # the sleeve holds the stroke, the collar, the gap under the shelf and the end margin
        self.assertGreaterEqual(t["sleeve_mm"] + 1e-9, t["stroke_mm"] + p.sleeve_overlap_mm + p.collar_h_mm + p.sleeve_top_mm)
        self.assertAlmostEqual(t["start_z"], p.hopper_out_z - t["sleeve_mm"])
        # every pose has a free length inside the stroke, re-checked from the sleeve's lower end
        r = p._ranges_from(p.hopper_out_x, t["start_z"])
        self.assertEqual(len(r), 5 * (p.az_steps + 1))   # every elevation step at every azimuth step
        for (e, a, (rlo, rhi)), (e2, a2, xlo, xhi) in zip(r, t["poses"]):
            self.assertEqual((e, a), (e2, a2))
            self.assertTrue(rlo <= lo + xlo + 1e-6 <= rhi + 1e-6, e)
            self.assertLessEqual(xlo, t["stroke_mm"] + 1e-9)
        # the collar stays in the tube: highest under its top end, lowest the overlap above its bottom
        hi_d, lo_d = t["collar_travel"]
        self.assertGreaterEqual(hi_d - p.collar_h_mm, p.sleeve_top_mm - 1e-9)
        self.assertAlmostEqual(lo_d, t["sleeve_mm"] - p.sleeve_overlap_mm)
        # the outlet the pulley was sized at (x -330, z 1700) has no sleeve that works
        self.assertIsNone(Feeder(hopper_out_x=-330.0, hopper_out_z=1700.0).sleeve_take_up_design())

    def test_the_take_up_is_sized_with_the_head_turned_in_azimuth(self):
        # 2026-11-10: the head turns +-30 deg on the turntable while the hopper stays put, so the socket mouth swings
        # sideways (about 200 mm at +45 deg) and the column axis leans out of the x-z plane. The outlet sized at azimuth 0
        # (z 2000) has no sleeve once the turned poses count; the shipped 2025 does.
        old = Feeder(hopper_out_z=2000.0)
        self.assertIsNotNone(old.sleeve_take_up_design(azimuth=False))
        self.assertIsNone(old.sleeve_take_up_design())
        # at +45 deg turned the full 30 deg, the shortest hose that fits is longer than the azimuth-0 slide reaches
        t0 = old.sleeve_take_up_design(azimuth=False)
        turned = old._ranges_from(old.hopper_out_x, t0["start_z"])
        worst = [x for e, a, x in turned if e == old.elev_max and a == old.az_max][0]
        self.assertGreater(worst[0], t0["free_mm"][1] + 20.0)
        p = Feeder()
        self.assertEqual(p.hopper_out_z, 2025.0)
        t = p.sleeve_take_up_design()
        self.assertIsNotNone(t)
        self.assertTrue(any(a == p.az_max for _, a, _, _ in t["poses"]))
        self.assertGreater(t["stroke_mm"], t0["stroke_mm"])     # turning costs slide
        # the 3-D curve family reduces to the planar one at azimuth 0
        from otr_cad.params import _hose_curve_range, _hose_curve_range_3d
        (mx, my, mz), u = p.mouth_world_3d(30.0, 0.0)
        self.assertAlmostEqual(my, 0.0)
        a = _hose_curve_range(p.hopper_out_x, t["start_z"], mx, mz, math.radians(30.0), p.hose_min_bend, p.feed_min_slope_deg)
        b = _hose_curve_range_3d((p.hopper_out_x, 0.0, t["start_z"]), (mx, 0.0, mz), u, p.hose_min_bend, p.feed_min_slope_deg)
        self.assertAlmostEqual(a[0], b[0], places=6)
        self.assertAlmostEqual(a[1], b[1], places=6)
        # a turned head moves the mouth sideways by the column's offset from the turntable axis
        (x30, y30, z30), u30 = p.mouth_world_3d(0.0, 30.0)
        self.assertAlmostEqual(y30, p.feed_col_x * math.sin(math.radians(30.0)), places=6)
        self.assertAlmostEqual(math.hypot(*u30), 1.0)

    @unittest.skipUnless(HAVE_CAD, "build123d not installed")   # builds solids, unlike the rest of this class
    def test_take_up_parts_match_the_design(self):
        from otr_cad.feeder import _sleeve_d, take_up_parts
        p = Feeder()
        t = p.sleeve_take_up_design()
        parts = {x.name: x for x in take_up_parts(p)}
        self.assertEqual(set(parts), {"take_up_sleeve", "take_up_collar", "take_up_spring"})
        sb = parts["take_up_sleeve"].placed()[0].bounding_box()
        self.assertAlmostEqual(sb.max.Z - sb.min.Z, t["tube_mm"], places=3)
        self.assertAlmostEqual(sb.min.Z, t["start_z"], places=3)
        bore, od = _sleeve_d(p)
        self.assertGreater(bore, p.hose_od)
        cb = parts["take_up_collar"].placed()[0].bounding_box()
        self.assertTrue(sb.min.Z < cb.min.Z and cb.max.Z < sb.max.Z)   # the collar is inside the tube
        self.assertLess((parts["take_up_collar"].placed()[0] & parts["take_up_sleeve"].placed()[0]).volume, 1.0)
        # a ball dropping down the sleeve meets a funnel, not the hose's rim: the funnel's top is wider than the ball
        self.assertGreater(bore - 2.0 - 6.0, p.ball_d)
        self.assertEqual(take_up_parts(Feeder(hopper_out_x=-330.0, hopper_out_z=1700.0)), [])

    def test_bow_radius_is_the_circular_arc_bound(self):
        import math
        p = Feeder()
        c = min(c for _, c, _ in p.hose_chords())
        r = p.hose_bow_radius()
        if p.hose_len >= math.pi * c / 2:   # more than a semicircle: the bound is the semicircle's radius
            self.assertAlmostEqual(r, c / 2)
        else:
            self.assertAlmostEqual(2 * r * math.asin(c / (2 * r)), p.hose_len, places=3)
        # A longer hose across the same chord never bends tighter than the semicircle.
        self.assertGreaterEqual(r, c / 2 - 1e-9)

    def test_wind_ballast_grows_with_wind_and_shrinks_with_weight(self):
        p = Feeder()
        self.assertGreater(Feeder(design_wind=12.0).ballast_kg(20.0), p.ballast_kg(20.0))
        self.assertLess(p.ballast_kg(40.0), p.ballast_kg(20.0))
        # Moment balance: at the ballast it returns, the base is on the edge of tipping.
        w = p.ballast_kg(20.0) + 20.0
        h = (p.rail_top + p.net_top) / 2 / 1000
        arm = abs(p.wheel_x[0] - p.wheel_x[1]) / 2 / 1000
        self.assertAlmostEqual(w * 9.81 * arm, p.wind_force_n * h, places=6)

    def test_azimuth_drive_sizing(self):
        p = Feeder()
        self.assertEqual(p.az_ratio, 10.0)
        self.assertAlmostEqual(p.az_centre_dist, 1.5 * (150 + 15) / 2)
        # the trimmed plate stays inside the pinion's tip circle with the clearance asked for
        self.assertAlmostEqual(p.az_centre_dist - (p.az_pinion_r + p.az_module) - p.az_trim_r, p.az_clear_mm)
        self.assertEqual(p.check_azimuth(), [])
        d = p.azimuth_drive(0.31, 76.0)
        # triangular profile, by hand: 30 deg in 1 s accelerates at 4 theta / t^2
        self.assertAlmostEqual(d["alpha_rad_s2"], 4 * math.radians(30) / 1.0)
        self.assertAlmostEqual(d["torque_inertia_nm"], 0.31 * 4 * math.radians(30))
        # Lewis bending on the printed sector, by hand
        f_t = d["torque_out_nm"] / (p.az_gear_r / 1000) * p.az_shock
        self.assertAlmostEqual(d["tooth_stress_mpa"], f_t / (p.az_gear_face_mm * p.az_module * (0.484 - 2.87 / 150)))
        # one full step through 10:1 is 0.18 deg
        self.assertAlmostEqual(d["step_deg"], 0.18)
        # the fastest slew is where the margin is exactly the factor asked for
        from dataclasses import replace
        q = replace(p, az_slew_s=d["fastest_slew_s"])
        self.assertAlmostEqual(q.azimuth_drive(0.31, 76.0)["torque_margin"], p.az_torque_factor, places=3)
        # a quarter-second slew of the measured head is beyond the stepper
        fast = replace(p, az_slew_s=0.25)
        self.assertTrue(any("azimuth stepper needs" in b for b in fast.check_azimuth(0.31)))

    def test_azimuth_hard_stops_sized_and_rules_catch_bad_changes(self):
        p = Feeder()
        self.assertEqual(p.check_az_stops(), [])
        d = p.az_stop_design(0.34)
        # the stop lies past the working range, past the home click with the bracket slots' whole adjustment, and a
        # tooth pitch inside the last tooth, so the pinion is in full mesh when it stalls there
        self.assertGreater(p.az_stop_deg, d["stop_home_min_deg"])
        self.assertLess(p.az_stop_deg, d["stop_mesh_max_deg"])
        self.assertLess(p.az_stop_deg, d["pinion_off_deg"])
        # pad as a linear spring, by hand: E A / t, energy 1/2 J w^2, x = sqrt(2 E / k)
        k = p.stop_pad_e_mpa * (p.stop_pad_r[1] - p.stop_pad_r[0]) * p.stop_pad_h / p.stop_pad_t
        self.assertAlmostEqual(d["pad_k_n_mm"], k)
        self.assertAlmostEqual(d["pad_x_mm"], math.sqrt(2 * d["energy_j"] * 1000 / k), places=6)
        self.assertLess(d["pad_strain"], p.stop_pad_strain)
        # the fastest hit the pad takes is where its strain reaches the limit
        from dataclasses import replace
        q = replace(p, stop_hit_deg_s=d["fastest_hit_deg_s"])
        self.assertAlmostEqual(q.az_stop_design(0.34)["pad_strain"], p.stop_pad_strain, places=6)
        self.assertTrue(any("working range" in b for b in Feeder(az_stop_deg=31.5).check_az_stops()))
        self.assertTrue(any("home click" in b for b in Feeder(az_stop_deg=33.0).check_az_stops()))
        # the 8 deg of spare teeth the sector had before the stops leave under a pitch of mesh at 35 deg
        self.assertTrue(any("mesh" in b for b in Feeder(az_sector_margin_deg=8.0).check_az_stops()))
        self.assertTrue(any("compresses" in b for b in Feeder(stop_pad_t=3.0).check_az_stops()))
        self.assertTrue(any("compresses" in b for b in Feeder(stop_hit_deg_s=90.0).check_az_stops()))
        self.assertTrue(any("insert" in b for b in Feeder(insert_shear_n=80.0).check_az_stops()))
        self.assertTrue(any("end face" in b for b in Feeder(stop_pad_r=(95.0, 109.0)).check_az_stops()))

    def test_azimuth_hose_torque_vanishes_straight_ahead(self):
        # the taut-hose chord lies in the plane through the turntable axis when the head is not turned
        self.assertAlmostEqual(Feeder(az_max=0.0).az_hose_torque_nm(), 0.0, places=9)
        self.assertGreater(Feeder().az_hose_torque_nm(), 0.0)

    def test_azimuth_gear_teeth_printable(self):
        p = Feeder()
        # m1.5 slots are too narrow to laser in 5 mm aluminium (the reason the sector is printed), wide enough to print
        self.assertLess(p.az_root_gap_mm(), 0.6 * p.plate_t)
        self.assertGreater(p.az_root_gap_mm(), p.print_min_gap_mm)
        # the involute half-angle at the pitch circle is half the (thinned) tooth over the pitch radius
        self.assertAlmostEqual(p.az_tooth_half_angle(p.az_gear_r) * 2 * p.az_gear_r, math.pi * 1.5 / 2 - p.az_backlash_mm)
        self.assertTrue(any("slots" in b for b in Feeder(az_module=0.5, az_gear_teeth=450).check_azimuth()))

@unittest.skipUnless(HAVE_CAD, "build123d not installed")
class FeederGeometryTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from otr_cad import feeder as F
        cls.F = F
        cls.p = Feeder()
        cls.parts = F.all_parts(cls.p)

    def test_no_collisions_and_ground_contacts(self):
        from otr_cad.package import collisions, ground_contacts
        self.assertEqual(collisions(self.parts), [])   # the sweeps over the poses: FeederPackageTest
        contacts = ground_contacts(self.parts, ("wheel", "levelling_foot"))
        self.assertEqual(set(contacts), {"wheel", "levelling_foot"})
        for z in contacts.values():
            self.assertAlmostEqual(z, 0.0, places=2)

    def test_lift_shaft_cuts_bite_solid_boot(self):
        # 2026-11-15: the bearing pockets and the spacer's insert holes must cut printed material, not a cavity, and a
        # gearmotor as long as the base drive's must meet the drive bracket once the spacer sets it out
        from unittest import mock
        from build123d import Box, Location
        from otr_cad.package import collisions
        F, p = self.F, self.p
        far = lambda _p: Box(0.1, 0.1, 0.1).moved(Location((0, -5000, 0)))
        with mock.patch.object(F, "lift_bearing_pockets", far), mock.patch.object(F, "lift_spacer_inserts", far):
            bare = F.lift_boot(p).placed()[0]
        ins, pk = F.lift_spacer_inserts(p), F.lift_bearing_pockets(p)
        self.assertAlmostEqual((ins & bare).volume, ins.volume, delta=1.0)
        shaft_hole = math.pi * 4.0 ** 2 * 2 * p.lift_bearing_w      # the old 8 mm shaft hole runs through both
        self.assertAlmostEqual((pk & bare).volume, pk.volume - shaft_hole, delta=0.02 * pk.volume)
        long_gm = Feeder(lift_gm_len=100.0)
        self.assertTrue(any("drive_bracket" in c and "lift_motor" in c for c in collisions(F.all_parts(long_gm))))

    def test_elevation_sweep_can_fail(self):
        from otr_cad.package import elevation_sweep
        bad = Feeder(mast_top_z=700.0)  # turntable raised into the head's path
        # the rules see only that the cable loop (2026-11-13) and the actuator's lead (2026-11-14) no longer fit; the
        # sweep sees the clash
        self.assertEqual([r for r in bad.check() if "cable length" not in r and "actuator's lead" not in r], [])
        self.assertTrue(any("turntable" in c for c in elevation_sweep(bad, steps=2)))

    def test_head_gravity_moment_from_the_cad_is_a_rigid_rotation(self):
        g = self.F.gravity_table(self.p)
        m0, mass = self.F.head_moment(self.p, 0.0)
        self.assertGreater(mass, 2 * self.F.COTS_MASS_KG["launcher_motor"])
        ks = sorted(g)
        self.assertTrue(all(g[b] > g[a] > 0 for a, b in zip(ks, ks[1:])))   # nose-up, growing with elevation
        # one centre of mass, rotated: fit (cx, cz) from 0 and 45 deg and predict the other poses
        w = mass * 9.81 / 1000
        cx = -g[0.0] / w
        t = math.radians(45.0)
        cz = (g[45.0] / w + cx * math.cos(t)) / math.sin(t)
        for e in (-15.0, 15.0, 30.0):
            r = math.radians(e)
            self.assertAlmostEqual(g[e], -w * (cx * math.cos(r) - cz * math.sin(r)), places=6)

    def test_elevation_actuator_meets_its_pin_and_anchor(self):
        ax, az = self.F.elev_anchor_world(self.p)
        for e in (self.p.elev_min, 0.0, self.p.elev_max):
            body, rod = self.F.elev_actuator_shapes(self.p, e)
            px, pz = self.p.elev_pin_rel(e)
            px, pz = self.p.head_x + px, self.p.pivot_z + pz
            L = self.p.elev_act_len(e)
            self.assertAlmostEqual(body.volume, math.pi * self.p.elev_act_r ** 2 * (self.p.elev_act_closed - 2 * self.F.ELEV_EYE_MM), delta=5)
            self.assertAlmostEqual(rod.volume, math.pi * self.F.ELEV_ROD_R ** 2 * (L - self.p.elev_act_closed), delta=5)
            # the rod ends one eye short of the pin, along the line from the anchor
            ux, uz = (px - ax) / L, (pz - az) / L
            tip = rod.center()  # the rod's axis lies on the anchor-pin line
            self.assertAlmostEqual((tip.X - ax) * uz - (tip.Z - az) * ux, 0.0, places=6)
            self.assertAlmostEqual(tip.Y, self.p.elev_act_y, places=6)
        # the guard plate carries the pin hole, the guard-side cheek the anchor hole
        guard = next(x for x in self.parts if x.name == "head_guard_plate")
        self.assertTrue(any(e.geom_type == GeomType.CIRCLE and abs(e.radius - 3.2) < 1e-6
                            and math.hypot(e.arc_center.X - self.p.elev_pin_x, e.arc_center.Y - self.p.elev_pin_z) < 0.01
                            for e in guard.flat.edges()))
        cheek = next(x for x in self.parts if x.name == "trunnion_cheek_elev")
        self.assertTrue(any(e.geom_type == GeomType.CIRCLE and abs(e.radius - 3.2) < 1e-6
                            and math.hypot(e.arc_center.X - ax, e.arc_center.Y - az) < 0.01 for e in cheek.flat.edges()))

    def test_elevation_actuator_sweep_can_fail(self):
        from otr_cad.package import elevation_sweep
        bad = Feeder(elev_act_y=-62.0)  # body radius 13: rubs the cheek's tab
        self.assertTrue(any("elev_actuator" in c and "trunnion_cheek_elev" in c for c in elevation_sweep(bad, steps=1)))

    def test_head_tilts_nose_up(self):
        up = dict(self.F.swept_solids(self.p, 45.0))["launcher_wheel[0]"].center()
        flat = dict(self.F.swept_solids(self.p, 0.0))["launcher_wheel[0]"].center()
        self.assertLess(up.X, flat.X)   # the top wheel swings back when the nose rises
        self.assertLess(up.Z, flat.Z)

    def test_cheek_feet_land_on_turntable_plate_holes(self):
        plate = next(x for x in self.parts if x.name == "turntable_plate")
        holes = [(e.arc_center.X, e.arc_center.Y) for e in plate.flat.edges()
                 if e.geom_type == GeomType.CIRCLE and abs(e.radius - 2.2) < 1e-6]
        checked = 0
        foot = next(x for x in self.parts if x.name == "cheek_foot")
        for solid in foot.placed():
            for f in solid.faces():
                if f.geom_type != GeomType.CYLINDER or abs(f.radius - 2.0) > 1e-6:
                    continue
                ax = f.axis_of_rotation
                if abs(abs(ax.direction.Z) - 1) > 1e-6:
                    continue
                x, y = ax.position.X, ax.position.Y
                self.assertTrue(any(math.hypot(x - hx, y - hy) < 0.01 for hx, hy in holes), (x, y))
                checked += 1
        self.assertEqual(checked, 4)

    def test_mast_plate_holes_meet_posts_and_bearing(self):
        plate = next(x for x in self.parts if x.name == "mast_plate")
        centres = [(e.arc_center.X, e.arc_center.Y) for e in plate.flat.edges()
                   if e.geom_type == GeomType.CIRCLE and abs(e.radius - 2.75) < 1e-6]
        for px, py in [(x, y) for x, y in self.F._post_xy(self.p)]:
            self.assertTrue(any(math.hypot(px - cx, py - cy) < 0.01 for cx, cy in centres), (px, py))
        self.assertEqual(len(centres), 8)

    def test_laser_parts_fit_a_standard_sheet(self):
        for part in self.parts:
            if part.kind == "laser":
                bb = part.flat.bounding_box()
                self.assertLessEqual(max(bb.size.X, bb.size.Y), 1220, part.name)

    def test_feed_screws_land_on_head_plate_holes(self):
        """Every pilot in the printed floor and roof must meet a hole in both head plates."""
        p = self.p
        plate = next(x for x in self.parts if x.name == "head_motor_plate")
        # the plate sketch is already in the head frame (x forward, z up from the ball path)
        holes = [(e.arc_center.X, e.arc_center.Y) for e in plate.flat.edges()
                 if e.geom_type == GeomType.CIRCLE and abs(e.radius - 2.2) < 1e-6]
        checked = 0
        for name in ("feed_floor", "feed_roof_column"):
            part = next(x for x in self.parts if x.name == name)
            for f in part.shape.faces():
                if f.geom_type != GeomType.CYLINDER or abs(f.radius - 2.0) > 1e-6:
                    continue
                ax = f.axis_of_rotation
                if abs(abs(ax.direction.Y) - 1) > 1e-6:
                    continue
                x, z = ax.position.X, ax.position.Z
                self.assertTrue(any(math.hypot(x - hx, z - hz) < 0.01 for hx, hz in holes), (name, x, z))
                checked += 1
        self.assertEqual(checked, 8)

    def test_retainer_blocks_a_free_ball_but_leaves_the_pocket_clear(self):
        from build123d import Location, Sphere
        p = self.p
        sh = next(x for x in self.parts if x.name == "feed_shuttle").shape
        zc = p.shuttle_z0 + p.shuttle_h / 2

        def hit(x):
            return (Sphere(p.ball_d / 2).moved(Location((x, 0, zc))) & sh).volume

        self.assertLess(hit(p.feed_col_x), 1.0)                      # a ball sits in the pocket untouched
        x_front = p.feed_col_x + 60.0
        self.assertGreater(max(hit(x_front - p.retain_len + d) for d in range(0, 40, 4)), 500.0)  # arms are in its way
        self.assertLess(hit(x_front + 80.0), 1.0)                    # clear again beyond the front

    def test_shuttle_meters_one_ball_and_stays_clear_when_advanced(self):
        from build123d import Cylinder, Location
        from otr_cad.package import clashes
        p = self.p
        sh = next(x for x in self.parts if x.name == "feed_shuttle")
        top = p.shuttle_z0 + p.shuttle_h
        # A slice of the column bore just above the shuttle: open when retracted, shut when advanced.
        bore = Cylinder(p.hole_d / 2, 4.0).moved(Location((p.head_x + p.feed_col_x, 0, p.launch_z + top - 4.0 + 2.0)))
        retracted = sh.shape.moved(Location((p.head_x, 0, p.launch_z)))
        advanced = sh.shape.moved(Location((p.head_x + p.feed_stroke, 0, p.launch_z)))
        self.assertLess((retracted & bore).volume / bore.volume, 0.35)  # only the arms, which flank the pocket
        self.assertGreater((advanced & bore).volume / bore.volume, 0.97)
        others = [(f"{x.name}[{i}]", s) for x in self.parts if x.name in self.F.HEAD_PARTS and x.name != "feed_shuttle"
                  for i, s in enumerate(x.placed())]
        self.assertEqual(clashes([("shuttle advanced", advanced)] + others), [])

    def test_shuttle_drive_is_clear_along_the_stroke_and_can_fail(self):
        from otr_cad.package import feed_stroke_sweep
        # clear along the stroke: the feeder build's feed_stroke_sweep (FeederPackageTest)
        # a longer rod puts the crank forward, where it swings into the bracket's upper front leg
        bad = feed_stroke_sweep(Feeder(shuttle_rod_mm=170.0), thetas=(90.0,))
        self.assertTrue(any("shuttle_crank" in c and "shuttle_servo_bracket" in c for c in bad), bad)

    def test_shuttle_pin_runs_in_the_motor_plate_slot(self):
        from build123d import Cylinder, Location
        from otr_cad.collector import ROT_Y_AXIS
        p = self.p
        plate = next(x for x in self.parts if x.name == "head_motor_plate").placed()[0]
        shuttle = next(x for x in self.parts if x.name == "feed_shuttle")
        y_in = p.plate_half_y - p.feed_clear - 0.2
        for th in (0.0, 60.0, 120.0, 180.0):
            xs = p.shuttle_kinematics(th)[0]
            pin = Cylinder(p.shuttle_pin_d / 2, p.drive_y0 + 6.0 - (y_in - 8.0)).moved(
                Location((p.head_x + xs, (p.drive_y0 + 6.0 + y_in - 8.0) / 2, p.launch_z + p.shuttle_zc), ROT_Y_AXIS))
            self.assertLess((pin & plate).volume, 0.5, th)            # through the slot, not the plate
            moved = shuttle.shape.moved(self.F.shuttle_drive_locs(p, th)["feed_shuttle"])
            self.assertLess((pin & moved).volume, 0.5, th)            # into the shuttle's insert hole
        # and the slot is only the pin's width: a pin 10 mm above it hits metal
        pin = Cylinder(p.shuttle_pin_d / 2, 6.0).moved(
            Location((p.head_x + p.shuttle_pin_x, p.plate_half_y + p.plate_t / 2, p.launch_z + p.shuttle_zc + 10.0), ROT_Y_AXIS))
        self.assertGreater((pin & plate).volume, 50.0)

    def test_hopper_posts_stand_on_the_deck_and_meet_the_shelf(self):
        p = self.p
        for part in (x for x in self.parts if x.name.startswith("hopper_post")):
            bb = part.placed()[0].bounding_box()
            self.assertAlmostEqual(bb.min.Z, p.rail_top + p.plate_t, places=3)
            self.assertAlmostEqual(bb.max.Z, p.shelf_underside_z(part.placed()[0].center().X + 10.0), places=2)
        deck = next(x for x in self.parts if x.name == "base_deck")
        xs = {round(x) for x, _ in self.F._shelf_posts(p)}
        self.assertEqual(xs, {round(p.post_rear_x), round(p.post_front_x)})
        for x, y in self.F._shelf_posts(p):
            bb = deck.placed()[0].bounding_box()
            self.assertTrue(bb.min.X < x < bb.max.X and bb.min.Y < y < bb.max.Y, (x, y))

    def test_hopper_braces_are_sized_and_clear_posts_and_shelf(self):
        from otr_cad.package import clashes
        p = self.p
        self.assertEqual(p.check_hopper_frame(), [])
        for ax in "xy":
            self.assertGreater(p.brace_buckling_n(ax), p.brace_min_factor * p.brace_force_n(ax))
            part = next(x for x in self.parts if x.name == f"hopper_brace_{ax}")
            self.assertAlmostEqual(part.shape.bounding_box().size.X if ax == "x" else part.shape.bounding_box().size.Y,
                                   p.brace_len(ax), places=3)
        named = [(f"{x.name}[{i}]", s) for x in self.parts
                 if x.name.startswith("hopper_") and x.name not in ("hopper_tub", "hopper_spigot", "hopper_hose")
                 for i, s in enumerate(x.placed())]
        self.assertEqual(clashes(named), [])
        # A weaker brace or a much larger sway load must be refused.
        self.assertTrue(Feeder(ext_I_2020_mm4=500.0).check_hopper_frame())
        self.assertTrue(Feeder(side_load_min_n=1500.0).check_hopper_frame())

    def test_head_plates_clear_the_ball(self):
        """The ball path (a 67 mm cylinder along x) must not touch either head plate."""
        from build123d import Cylinder, Location
        p = self.p
        ball = Cylinder(p.ball_d / 2, 400.0).moved(Location((p.head_x, 0, p.launch_z), (0, 90, 0)))
        for name in ("head_motor_plate", "head_guard_plate"):
            plate = next(x for x in self.parts if x.name == name)
            for s in plate.placed():
                self.assertLess((s & ball).volume, 1.0, name)

    def test_azimuth_sweep_is_clear_and_can_fail(self):
        from otr_cad.package import azimuth_sweep
        # clear as drawn: the feeder build's azimuth_sweep (FeederPackageTest)
        # the front posts where they were until 2026-11-12: clear at +-30 deg, but the head's plates cut into them
        # turned to the hard stops' reach (36.4 deg) nose up 25 deg and more
        bad = azimuth_sweep(Feeder(shelf_post_y=245.0))
        self.assertTrue(bad and all("hopper_post_front" in c and "36.4" in c for c in bad), bad)

    def test_hard_stops_meet_the_sector_ends_at_az_stop(self):
        # the drawn sector against the drawn pads: clear just inside the stop angle, touching just past it, and at the
        # reach (pad squeezed to its limit) still clear of the block behind the pad
        from build123d import Axis
        p = self.p
        sector = next(x for x in self.parts if x.name == "az_gear_sector").placed()[0]
        pads = next(x for x in self.parts if x.name == "az_stop_pad").placed()
        blocks = next(x for x in self.parts if x.name == "az_stop_block").placed()
        axis = Axis((p.head_x, 0, 0), (0, 0, 1))
        for side, pad in ((1, pads[0]), (-1, pads[1])):
            self.assertLess((sector.rotate(axis, side * (p.az_stop_deg - 0.05)) & pad).volume, 1e-6, side)
            self.assertGreater((sector.rotate(axis, side * (p.az_stop_deg + 0.05)) & pad).volume, 1.0, side)
            s = sector.rotate(axis, side * p.az_reach_deg)
            for b in blocks:
                self.assertLess((s & b).volume, 1e-6, side)
            self.assertLess((sector.rotate(axis, side * p.az_max) & pad).volume, 1e-6, side)
        # the blocks' inserts sit over holes in the mast plate
        mast = next(x for x in self.parts if x.name == "mast_plate")
        holes = [(e.arc_center.X, e.arc_center.Y) for e in mast.flat.edges()
                 if e.geom_type == GeomType.CIRCLE and abs(e.radius - 2.2) < 1e-6]
        for x, y in self.F._stop_holes(p):
            self.assertTrue(any(math.hypot(x - hx, y - hy) < 0.01 for hx, hy in holes), (x, y))
        # both ends of the sector are radial faces (until 2026-11-12 the low end's inner corner fell 3.3 deg short)
        prof = self.F.az_gear_profile(p)
        lo, hi = p.az_sector_ends_deg()
        angs = sorted(math.degrees(math.atan2(y, x)) for x, y in prof)
        self.assertAlmostEqual(angs[0], lo, places=6)
        self.assertAlmostEqual(angs[-1], hi, places=6)

    def test_turning_inertia_from_the_cad(self):
        j0, m0 = self.F.turning_inertia(self.p, 0.0)
        j45, m45 = self.F.turning_inertia(self.p, 45.0)
        self.assertAlmostEqual(m0, m45)              # tilting moves mass, it does not add any
        self.assertGreater(j45, j0)                  # nose up swings the column and plates out behind the axis
        self.assertLessEqual(j45, self.p.az_inertia_kgm2)
        # the motors alone, as point masses on their axes: a floor the solid model must exceed
        r = (self.p.plate_half_y + self.p.plate_t + self.p.motor_len / 2) / 1000
        self.assertGreater(j0, 2 * self.F.COTS_MASS_KG["launcher_motor"] * r * r)

    def test_azimuth_gear_bolts_and_pinion(self):
        plate = next(x for x in self.parts if x.name == "turntable_plate")
        for v in plate.flat.vertices():   # every point of the outline is inside the trim circle
            self.assertLessEqual(math.hypot(v.X - self.p.head_x, v.Y), self.p.az_trim_r + 1e-6)
        holes = [(e.arc_center.X, e.arc_center.Y) for e in plate.flat.edges()
                 if e.geom_type == GeomType.CIRCLE and abs(e.radius - 2.2) < 1e-6]
        for x, y in self.F._az_bolts(self.p):
            self.assertTrue(any(math.hypot(x - hx, y - hy) < 0.01 for hx, hy in holes), (x, y))
        sector = next(x for x in self.parts if x.name == "az_gear_sector").placed()[0]
        sb = sector.bounding_box()
        self.assertAlmostEqual(sb.max.Z, self.p.mast_top_z + self.p.plate_t + self.p.bearing_h, places=6)  # under the plate
        self.assertAlmostEqual(sb.max.Y, self.p.az_gear_r + self.p.az_module, places=1)
        # tooth count: the sector spans +-(az_max + margin) of pitch angles
        prof = self.F.az_gear_profile(self.p)
        tips = [q for q in prof if abs(math.hypot(*q) - (self.p.az_gear_r + self.p.az_module)) < 1e-6]
        n = int(math.radians(self.p.az_sector_half_deg) // (2 * math.pi / self.p.az_gear_teeth))
        self.assertEqual(len(tips), 2 * (2 * n + 1))
        mast = next(x for x in self.parts if x.name == "mast_plate")
        bores = [(e.arc_center.X, e.arc_center.Y) for e in mast.flat.edges()
                 if e.geom_type == GeomType.CIRCLE and abs(e.radius - self.F.AZ_BOSS_D / 2) < 1e-6]
        self.assertEqual(len(bores), 1)
        self.assertAlmostEqual(bores[0][0], self.p.head_x)
        self.assertAlmostEqual(bores[0][1], self.p.az_centre_dist)

    def test_home_cam_closes_the_switch_exactly_at_and_below_home(self):
        # the gear sector's cam lobe against the switch's roller lever (drawn free): no contact anywhere in the
        # working range, first touch where home_switch_design says, the click (pretravel) at az_home_deg, and the
        # full lobe depth down past where the pinion leaves the teeth
        from build123d import Axis, Location
        p, h = self.p, self.p.home_switch_design()
        sector = next(x for x in self.parts if x.name == "az_gear_sector").placed()[0]
        body = next(x for x in self.parts if x.name == "home_switch").placed()[0]
        lever = next(x for x in self.parts if x.name == "home_switch_lever").placed()[0]
        bracket = next(x for x in self.parts if x.name == "home_switch_bracket").placed()[0]
        axis = Axis((p.head_x, 0, 0), (0, 0, 1))
        a = math.radians(p.home_sw_deg)

        def push(az):   # how far the roller is pushed in, by bisection on a radial shift of the free lever
            s = sector.rotate(axis, az)
            lo, hi = 0.0, 4.0
            for _ in range(18):
                m = (lo + hi) / 2
                lv = lever.moved(Location((-m * math.cos(a), -m * math.sin(a), 0)))
                lo, hi = (m, hi) if (s & lv).volume > 1e-6 else (lo, m)
            return hi if hi < 3.99 else None

        for az in (p.az_max, 0.0, -p.az_max, h["az_contact"] + 0.05):
            self.assertLess(push(az), 1e-3, az)
        self.assertGreater(push(h["az_contact"] - 0.1), 0.0)
        self.assertAlmostEqual(push(p.az_home_deg), p.home_sw_pretravel_mm, delta=0.03)
        for az in (p.az_home_deg - 1.5, h["az_pinion_off"], h["az_pinion_off"] - 5):
            self.assertAlmostEqual(push(az), h["depth_mm"], delta=0.05)
        for az in (p.az_max + 8, 0.0, p.az_home_deg, h["az_pinion_off"] - 5):
            s = sector.rotate(axis, az)
            self.assertLess((s & body).volume, 1e-6, az)
            self.assertLess((s & bracket).volume, 1e-6, az)
        # the bracket's M3 slots sit over the mast plate's holes
        mast = next(x for x in self.parts if x.name == "mast_plate")
        holes = [(e.arc_center.X, e.arc_center.Y) for e in mast.flat.edges()
                 if e.geom_type == GeomType.CIRCLE and abs(e.radius - 1.7) < 1e-6]
        for x, y in self.F._home_bracket_holes(p):
            self.assertTrue(any(math.hypot(x - hx, y - hy) < 0.01 for hx, hy in holes), (x, y))

    def test_home_switch_rules_catch_bad_changes(self):
        self.assertEqual(self.p.check_home_switch(), [])
        self.assertTrue(any("working range" in b for b in Feeder(az_home_deg=-30.5).check_home_switch()))
        self.assertTrue(any("pinion runs off" in b for b in Feeder(az_home_deg=-39.0).check_home_switch()))
        # a home past the hard stop could never be reached
        self.assertTrue(any("home click" in b for b in Feeder(az_home_deg=-34.5).check_az_stops()))
        self.assertTrue(any("usable travel" in b for b in Feeder(home_sw_overtravel_mm=0.4).check_home_switch()))
        self.assertTrue(any("bearing" in b for b in Feeder(home_sw_lever_mm=8.0).check_home_switch()))
        h = self.p.home_switch_design()
        # a click repeats to about 0.03 deg, under one microstep (0.045 deg): the step, not the switch, sets the home
        self.assertLess(h["repeat_deg"], h["microstep_deg"])


@unittest.skipUnless(HAVE_CAD, "build123d not installed")
class ElevationStopTest(unittest.TestCase):
    def test_head_clears_the_turntable_up_to_elev_clear_max_and_not_beyond(self):
        from otr_cad import feeder as F, package as P
        p = Feeder()

        def plates(e):  # past the retract limit the drawn rod overlaps its own body, which a real one cannot: skip that
            return [c for c in P.clashes(F.swept_solids(p, e)) if not c.startswith("elev_actuator[0] x elev_actuator_rod")]
        self.assertEqual(plates(p.elev_clear_max), [])
        self.assertTrue(any("turntable_plate" in c for c in plates(p.elev_clear_max + 0.1)))
        # the actuator's own end stops land inside the clear range at both ends
        g = {e: 0.0 for e in (-15.0, 45.0)}
        self.assertEqual(p.check_elevation(g), [])



@unittest.skipUnless(HAVE_CAD, "build123d not installed")
class CableGeometryTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from otr_cad import feeder as F
        cls.p = Feeder()
        cls.parts = F.all_parts(cls.p)

    def test_cable_loop_is_clear_and_the_sweep_can_fail(self):
        from build123d import Location
        from otr_cad import feeder as F
        from otr_cad import package
        p = self.p
        # clear as drawn: the feeder build's cable_sweep (FeederPackageTest)
        # the drawn loop is the cut length
        d = p.cable_loop_design()
        for e in (p.elev_min, p.elev_max):
            segs = F.cable_loop_solids(p, e)
            self.assertEqual(len(segs), 12)
            length = sum(s.volume for s in segs) / (math.pi * (p.bundle_od(p.head_wires) / 2) ** 2)
            self.assertAlmostEqual(length, d["cut_mm"], delta=6.0)
        # moved 40 mm sideways, the same loop runs into the motor plate
        real = F.cable_loop_solids
        try:
            F.cable_loop_solids = lambda q, e, segs=12: [s.moved(Location((0, 40, 0))) for s in real(q, e, segs)]
            bad = package.cable_sweep(p, poses=(p.elev_max,), azimuths=(0.0,))   # every pose catches it (2026-11-13)
        finally:
            F.cable_loop_solids = real
        self.assertTrue(bad and any("head_motor_plate" in c for c in bad), bad[:3])

    def test_elev_lead_is_drawn_at_its_cut_and_the_sweep_can_fail(self):
        from build123d import Location, Vector
        from otr_cad import feeder as F
        from otr_cad import package
        p = self.p
        d = p.elev_lead_design()
        r = p.elev_lead_od / 2
        for e in (p.elev_min, p.elev_max):
            length = F.elev_lead_solid(p, e).volume / (math.pi * r * r)
            self.assertAlmostEqual(length, d["cut_mm"] - 2 * F.LEAD_END_GAP, delta=3.0)
        # the cheek has the hole, and the tied run passes it and ends at the cheek's outer face
        cheek = next(x for x in self.parts if x.name == "trunnion_cheek_elev").placed()[0]
        hx, hy, hz = p.elev_lead_hole()
        self.assertFalse(cheek.is_inside(Vector(hx, hy + p.plate_t / 2, hz)))
        self.assertTrue(cheek.is_inside(Vector(hx, hy + p.plate_t / 2, hz + p.elev_lead_hole_d / 2 + 2.0)))
        fixed = next(x for x in self.parts if x.name == "elev_lead_fixed").placed()[0].bounding_box()
        self.assertAlmostEqual(fixed.min.Y, hy, places=3)
        self.assertAlmostEqual(fixed.max.Z, hz + r, places=3)
        # clear as drawn: the feeder build's elev_lead_sweep (FeederPackageTest). Dropped 25 mm it hits the turntable
        real = F.elev_lead_solid
        try:
            F.elev_lead_solid = lambda q, e: real(q, e).moved(Location((0, 0, -25)))
            bad = package.elev_lead_sweep(p, poses=(0.0,), azimuths=(0.0,))
        finally:
            F.elev_lead_solid = real
        self.assertTrue(bad and any("turntable_plate" in c for c in bad), bad[:3])

    def test_cable_parts_sit_where_the_loop_design_puts_them(self):
        p = self.p
        gland = next(x for x in self.parts if x.name == "cable_gland").placed()[0].bounding_box()
        self.assertAlmostEqual(gland.max.Z, p.turntable_top + p.cable_gland_h, places=3)
        self.assertAlmostEqual((gland.min.X + gland.max.X) / 2, p.head_x, places=3)
        clip = next(x for x in self.parts if x.name == "cable_clip").placed()[0].bounding_box()
        self.assertAlmostEqual(clip.min.Z, p.launch_z + p.cable_clip_z - 20.0, places=3)   # channel's foot
        clamp = next(x for x in self.parts if x.name == "cable_clamp").placed()[0].bounding_box()
        self.assertAlmostEqual((clamp.min.Z + clamp.max.Z) / 2, p.cable_clamp_z, places=3)
        self.assertLess(clamp.max.Z, p.mast_top_z - p.stepper_body_mm)
        # the grommet hole sits in the motor plate under the clip, clear of the plate's bottom edge
        from otr_cad.feeder import CABLE_HOLE_D, CABLE_HOLE_Z
        self.assertGreater(CABLE_HOLE_Z - CABLE_HOLE_D / 2 - p.head_z0, 8.0)
        self.assertLess(CABLE_HOLE_Z, p.cable_clip_z - 20.0)

@unittest.skipUnless(HAVE_CAD, "build123d not installed")
class FeederAssemblyGuideTest(unittest.TestCase):
    """The feeder's guide passes on the design, and its checks fail on the faults found writing it (2026-11-20)."""

    @classmethod
    def setUpClass(cls):
        from otr_cad import feeder as F, feeder_guide as FG, guide as G
        cls.F, cls.FG, cls.G = F, FG, G
        cls.p = Feeder()
        cls.parts = F.all_parts(cls.p)
        cls.rows = ([{"item": pt.name, "kind": pt.kind, "qty": pt.qty} for pt in cls.parts]
                    + [{"item": n, "kind": "cots", "qty": q} for n, q, _ in F.fasteners(cls.p) + F.COTS_EXTRA])

    def test_design_passes_every_guide_check(self):
        rows, bad = self.G.joint_checks(self.p, self.parts)
        self.assertEqual(bad, [])
        self.assertEqual(len(rows), 24)
        self.assertEqual(self.G.tally(self.p, self.parts, self.rows), [])
        self.assertEqual(self.G.order_problems(self.p, self.parts), [])
        self.assertEqual(self.G.access_problems(self.p, self.parts), [])
        self.assertEqual(self.FG.end_bore_problems(self.p, self.parts), [])

    def test_stacks_are_measured_from_the_cad(self):
        rows = {r["joint"]: r for r in self.G.joint_checks(self.p, self.parts)[0]}
        self.assertEqual(rows["head pivot"]["grip_mm"], 108.2)       # 2 cheeks + 2 plates + 2 outer washers
        self.assertEqual(rows["feed floor through the head plate"]["grip_mm"], 5.0 + self.p.feed_clear)
        self.assertEqual(rows["mast post to mast rail"]["grip_mm"], 40.0)
        self.assertEqual(rows["sump tab to net beam"]["spare_mm"], 6.0)

    def test_the_old_fastener_lengths_fail(self):
        """The BOM's lengths before 2026-11-20: each was too short or too long for the stack the CAD puts under it."""
        import dataclasses
        old = {"head pivot": 110, "servo bracket leg": 30, "azimuth stop block": 10, "sleeve socket under the shelf": 10,
               "agitator motor mount under the shelf": 10, "home switch bracket": 8, "azimuth stepper flange": 10,
               "trough hanger to net beam": 35, "deck cable saddle": 12}
        js = [dataclasses.replace(j, length=old[j.name]) for j in self.FG.joints(self.p) if j.name in old]
        with unittest.mock.patch.object(self.FG, "joints", lambda p: js):
            bad = self.G.joint_checks(self.p, self.parts)[1]
        self.assertEqual(sorted(b.split(":")[0] for b in bad), sorted(f"joint {n}" for n in old))

    def test_end_bores_and_a_lost_step_are_caught(self):
        with unittest.mock.patch.object(self.F, "_cores", lambda pts: list(pts)):
            p = Feeder(plate_t=5.0001)          # fresh parts, with holes at the ends' centres as before 2026-11-20
            bad = self.FG.end_bore_problems(p, self.F.all_parts(p))
        self.assertTrue(any("web between" in b for b in bad))
        self.assertEqual({b.split(":")[0] for b in bad}, {"mast_plate", "base_deck", "hopper_shelf"})
        real = self.G.steps
        with unittest.mock.patch.object(self.G, "steps", lambda p: [s for s in real(p) if "Base frame" not in s.title]):
            self.assertTrue(any("net_beam" in b for b in self.G.tally(self.p, self.parts, self.rows)))
            self.assertTrue(any("touches nothing" in b for b in self.G.order_problems(self.p, self.parts)))

    def test_a_closed_counterbore_fails_access(self):
        import dataclasses
        j = next(x for x in self.FG.joints(self.p) if x.name == "cable clamp to crossbar")
        with unittest.mock.patch.object(self.FG, "joints", lambda p: [dataclasses.replace(j, access=True)]):
            self.assertTrue(self.G.access_problems(self.p, self.parts))    # its pocket opens upward, not along x

    def test_guide_is_in_the_package(self):
        out = fresh_build("feeder")
        text = (out / "guide" / "ASSEMBLY.md").read_text()
        self.assertIn("all pass.", text)
        n = sum(1 for s in self.FG.steps(self.p) if s.image and s.parts)
        self.assertEqual(text.count("![Step"), n)
        self.assertEqual(len(list((out / "guide").glob("step_*.svg"))), n)


@unittest.skipUnless(HAVE_CAD, "build123d not installed")
class FeederPackageTest(unittest.TestCase):
    def test_committed_package_is_current(self):
        import zipfile
        self.assertTrue(COMMITTED_FEEDER.exists(), "run: python -m otr_cad feeder --out ../manufacturing/feeder")
        with zipfile.ZipFile(COMMITTED_FEEDER) as z:
            committed = json.loads(z.read("feeder/manifest.json"))
        fresh = json.loads((fresh_build("feeder") / "manifest.json").read_text())
        # the build ran every clash sweep on the design as drawn: collisions, elevation, azimuth (to the hard stops'
        # reach), feed stroke and cable loop
        self.assertEqual(fresh["collisions"], [])
        self.assertEqual(fresh["design_rules"], [])
        self.assertEqual(committed["params"], json.loads(json.dumps(fresh["params"])))
        folder = json.loads((COMMITTED_FEEDER.parent / "feeder" / "manifest.json").read_text())
        self.assertEqual(folder["files"], committed["files"], "manufacturing/feeder/ and the zip disagree")
        stale = sorted(k for k in set(committed["files"]) | set(fresh["files"])
                       if committed["files"].get(k) != fresh["files"].get(k))
        self.assertEqual(stale, [], "stale: rebuild with python -m otr_cad feeder --out ../manufacturing/feeder")
        self.assertEqual(committed["design_rules"], [])
        self.assertEqual(committed["collisions"], [])



class TroughParamsTest(unittest.TestCase):
    def test_run_drop_speed_and_the_lift_it_leaves(self):
        p = Feeder()
        d = p.trough_design()
        self.assertAlmostEqual(d["drop_mm"], p.trough_run_len * math.tan(math.radians(3)), places=6)
        self.assertAlmostEqual(sum(d["runs_mm"]), p.net_w - 2 * p.sump_half)
        self.assertGreater(d["runs_mm"][0], d["runs_mm"][1])   # the sump sits off centre, at the lift's foot (+y)
        # energy: g h = (1 + k) v^2 / 2 + g crr L cos a, per unit mass
        L = p.trough_run_len / 1000 / math.cos(math.radians(3))
        lhs = 9.81 * d["drop_mm"] / 1000
        rhs = (1 + p.ball_inertia_k) * d["end_speed_m_s"] ** 2 / 2 + 9.81 * p.trough_crr * L * math.cos(math.radians(3))
        self.assertAlmostEqual(lhs, rhs, places=9)
        self.assertGreater(d["run_time_s"], 3.0)          # slow: a far-end ball takes seconds, so the queue matters
        self.assertEqual(d["queue_balls"], 42)
        # the loop does not close by gravity: the tub's rim is over 2 m above the outlet
        self.assertGreater(d["lift_mm"], 2000)
        self.assertAlmostEqual(d["lift_mm"], d["tub_rim_low_z"] + p.tub_drop_clear_mm - p.sump_out_z)
        self.assertLess(p.trough_lift_power_w(36), 1.0)   # lifting the balls is cheap; the hardware is the problem

    def test_trough_rules_catch_bad_changes(self):
        self.assertEqual(Feeder().check_trough(), [])
        self.assertTrue(any("1.5 balls" in r for r in Feeder(trough_w=90.0).check_trough()))
        self.assertTrue(any("start again" in r for r in Feeder(trough_slope_deg=2.0).check_trough()))
        self.assertTrue(any("start again" in r for r in Feeder(trough_crr=0.04).check_trough()))
        self.assertTrue(any("net plane" in r for r in Feeder(trough_x0=20.0).check_trough()))
        self.assertTrue(any("near the court" in r for r in Feeder(trough_end_z=110.0).check_trough()))
        self.assertTrue(any("under the net beam" in r for r in Feeder(sump_out_z=90.0).check_trough()))
        self.assertTrue(any("off the gutter run" in r for r in Feeder(trough_hanger_y=(190.0,)).check_trough()))
        self.assertIn(Feeder(trough_w=90.0).check_trough()[0], Feeder(trough_w=90.0).check())


def _ref_hose_curve_range(ox, oz, mx, mz, tilt_rad, r_min, slope_min, step=25.0):
    """`_hose_curve_range` as written before the 2026-11-14 speed-up: every curve's full stats, then the test."""
    from otr_cad.params import _bezier_stats
    lo = hi = None
    n = int(900 / step)
    for i in range(1, n + 1):
        for j in range(1, n + 1):
            l0, l1 = i * step, j * step
            pts = ((ox, oz), (ox, oz - l0), (mx - l1 * math.sin(tilt_rad), mz + l1 * math.cos(tilt_rad)), (mx, mz))
            length, kmax, smin = _bezier_stats(pts)
            if kmax <= 1 / r_min and smin >= slope_min:
                lo = length if lo is None else min(lo, length)
                hi = length if hi is None else max(hi, length)
    return None if lo is None else (lo, hi)


def _ref_hose_curve_range_3d(o, m, u, r_min, slope_min, step=25.0, n=24):
    """`_hose_curve_range_3d` as written before the 2026-11-14 speed-up (list arithmetic, coefficients per point)."""
    kcap, tan_min = 1 / r_min, math.tan(math.radians(slope_min))
    ts = [k / n for k in range(n + 1)]
    lo = hi = None
    cnt = int(900 / step)
    for i in range(1, cnt + 1):
        p0, p1 = o, (o[0], o[1], o[2] - i * step)
        for j in range(1, cnt + 1):
            l1 = j * step
            p2, p3 = (m[0] + l1 * u[0], m[1] + l1 * u[1], m[2] + l1 * u[2]), m
            d01 = [p1[c] - p0[c] for c in range(3)]
            d12 = [p2[c] - p1[c] for c in range(3)]
            d23 = [p3[c] - p2[c] for c in range(3)]
            s0 = [p2[c] - 2 * p1[c] + p0[c] for c in range(3)]
            s1 = [p3[c] - 2 * p2[c] + p1[c] for c in range(3)]
            ok = True
            for t in ts:
                w = 1 - t
                a = [3 * w * w * d01[c] + 6 * w * t * d12[c] + 3 * t * t * d23[c] for c in range(3)]
                if abs(a[2]) < tan_min * math.hypot(a[0], a[1]) - 1e-12:
                    ok = False
                    break
                b = [6 * w * s0[c] + 6 * t * s1[c] for c in range(3)]
                cx, cy, cz = a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]
                sp = math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2)
                if sp > 1e-9 and math.sqrt(cx * cx + cy * cy + cz * cz) > kcap * sp ** 3:
                    ok = False
                    break
            if not ok:
                continue
            length, prev = 0.0, p0
            for t in ts[1:]:
                w = 1 - t
                q = tuple(w ** 3 * p0[c] + 3 * w * w * t * p1[c] + 3 * w * t * t * p2[c] + t ** 3 * p3[c] for c in range(3))
                length += math.dist(prev, q)
                prev = q
            lo = length if lo is None else min(lo, length)
            hi = length if hi is None else max(hi, length)
    return None if lo is None else (lo, hi)


class HoseCurveSearchTest(unittest.TestCase):
    """The hose-curve searches were sped up on 2026-11-14 (early exit, hoisted coefficients). They must give the same
    floats, bit for bit, as the straightforward code they replaced, on fitting and non-fitting poses alike."""

    def test_fast_searches_match_the_reference(self):
        from otr_cad.params import _hose_curve_range, _hose_curve_range_3d
        p = Feeder()
        oz = p.sleeve_take_up_design()["start_z"]
        seen = set()
        for e, r_min, slope in ((p.elev_min, p.hose_min_bend, p.feed_min_slope_deg), (p.elev_max, p.hose_min_bend, 40.0),
                                (20.0, 400.0, p.feed_min_slope_deg)):
            mx, mz = p.mouth_world(e)
            a = _hose_curve_range.__wrapped__(p.hopper_out_x, oz, mx, mz, math.radians(e), r_min, slope)
            b = _ref_hose_curve_range(p.hopper_out_x, oz, mx, mz, math.radians(e), r_min, slope)
            self.assertEqual(a, b)
            m, u = p.mouth_world_3d(e, p.az_max)
            a3 = _hose_curve_range_3d.__wrapped__((p.hopper_out_x, 0.0, oz), m, u, r_min, slope)
            b3 = _ref_hose_curve_range_3d((p.hopper_out_x, 0.0, oz), m, u, r_min, slope)
            self.assertEqual(a3, b3)
            seen |= {a is None, a3 is None}
        self.assertEqual(seen, {True, False})       # both a fitting and a non-fitting pose were compared


@unittest.skipUnless(HAVE_CAD, "build123d not installed")
class CrossClashesTest(unittest.TestCase):
    def test_clashes_of_a_union_split_into_its_parts(self):
        # the pose tests rely on clashes(a + b) holding the entries of clashes(a), cross_clashes(a, b) and clashes(b),
        # each list in its own order (2026-11-20)
        from build123d import Box, Location
        from otr_cad.package import clashes, cross_clashes
        box = lambda x, y=0.0, z=0.0: Box(10, 10, 10).moved(Location((x, y, z)))
        a = [("a0", box(0)), ("a1", box(5)), ("a2", box(40)), ("a3", box(0, 9.95))]
        b = [("b0", box(12)), ("b1", box(8, 3)), ("b2", box(42, 0, 4)), ("b3", box(100))]
        whole = clashes(a + b)
        self.assertEqual(sorted(whole), sorted(clashes(a) + cross_clashes(a, b) + clashes(b)))
        self.assertEqual(cross_clashes(a, b), [c for c in whole if c.startswith("a") and " x b" in c])
        self.assertEqual(clashes(a), [c for c in whole if c.startswith("a") and " x a" in c])
        self.assertEqual([c.split(":")[0] for c in cross_clashes(a, b)],
                         ["a0 x b1", "a1 x b0", "a1 x b1", "a2 x b2", "a3 x b1"])
        self.assertEqual(cross_clashes(a, b, tol_mm3=1e9), [])


@unittest.skipUnless(HAVE_CAD, "build123d not installed")
class TroughCadTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from otr_cad import feeder as F
        cls.F = F
        cls.p = Feeder()
        cls.parts = {q.name: q for q in F.all_parts(cls.p)}

    def _solids(self, name):
        q = self.parts[name]
        return [q.shape.moved(loc) for loc in q.placements]

    def test_tub_rim_matches_the_envelope(self):
        tub = self._solids("hopper_tub")[0].bounding_box()
        self.assertAlmostEqual(tub.max.Z, self.p.tub_rim_z[1], places=3)
        self.assertLess(self.p.tub_rim_z[0], self.p.tub_rim_z[1])

    def test_gutter_runs_follow_the_design(self):
        a, b = self._solids("trough_gutter_a")[0], self._solids("trough_gutter_b")[0]
        p = self.p
        for g, sgn, run in ((a, -1, p.trough_runs[0]), (b, 1, p.trough_runs[1])):
            bb = g.bounding_box()
            self.assertAlmostEqual(bb.min.X, p.trough_x0, places=3)
            inner = bb.min.Y if sgn > 0 else bb.max.Y
            self.assertAlmostEqual(inner, p.sump_y + sgn * p.sump_half, places=3)
            self.assertAlmostEqual(abs((bb.max.Y if sgn > 0 else bb.min.Y)), p.net_w / 2, delta=5.0)  # tilted end face
            self.assertAlmostEqual(bb.min.Z, p.trough_low_z - p.trough_wall, delta=0.5)
            self.assertAlmostEqual(bb.max.Z, p.trough_z_at(p.sump_half + run) + p.trough_w / 2, delta=4.0)
        self.assertAlmostEqual(p.trough_z_at(p.sump_half + p.trough_runs[0]), p.trough_end_z)
        self.assertGreater(a.volume, b.volume)

    def test_gutter_rests_in_every_saddle_without_clashing(self):
        gutters = self._solids("trough_gutter_a") + self._solids("trough_gutter_b")
        holders = [n for n in self.parts if n.startswith("trough_hanger_")] + ["trough_sump"]
        self.assertEqual(len(holders), len(self.p.trough_hanger_y) + 1)
        for n in holders:
            for h in self._solids(n):
                for g in gutters:
                    self.assertLess((g & h).volume, 1.0, n)
                gap = min(g.distance_to(h) for g in gutters)
                self.assertLess(gap, 2.0, f"{n} does not carry the gutter (gap {gap:.2f} mm)")

    def test_hangers_bolt_to_the_net_beam(self):
        beam = self._solids("net_beam")[0]
        for n in (n for n in self.parts if n.startswith("trough_hanger_")):
            for h in self._solids(n):
                bb = h.bounding_box()
                self.assertAlmostEqual(bb.min.X, 0.0, places=3)
                self.assertLessEqual(bb.min.Z, self.p.rail_z + 10.0 - 6)
                self.assertGreaterEqual(bb.max.Z, self.p.rail_z + 30.0 + 6)
                self.assertLess(h.distance_to(beam), 0.01)

    def test_sump_outlet_passes_under_the_beam_and_off_the_court(self):
        sump = self._solids("trough_sump")[0]
        beam = self._solids("net_beam")[0]
        bb = sump.bounding_box()
        self.assertAlmostEqual(bb.min.X, -self.p.rail_w, places=3)
        self.assertGreaterEqual(bb.min.Z, self.p.ground_min_mm)
        self.assertLess((sump & beam).volume, 1.0)
        # a ball-sized probe on the outlet's falling floor slides through the stub without touching it
        from build123d import Location, Sphere
        r = self.p.ball_d / 2
        xa = self.p.trough_x0 + self.p.sump_wall
        for x in (-self.p.rail_w + r, 0.0, xa - r):
            z = self.F._inlet_floor(self.p, xa - x)
            probe = Sphere(r).moved(Location((x, self.p.sump_y, z + r + 0.5)))
            self.assertLess((probe & sump).volume, 1.0, x)
        _, deg = self.F.sump_floor_rise(self.p)
        self.assertGreater(deg, 10.0)


class LiftParamsTest(unittest.TestCase):
    def test_lift_design_numbers(self):
        p = Feeder()
        d = p.lift_design()
        self.assertEqual(p.check_lift(), [])
        self.assertAlmostEqual(d["belt_mm"], d["belt_teeth"] * p.lift_belt_pitch)
        self.assertLess(abs(d["belt_mm"] - (2 * d["centre_mm"] + math.pi * p.lift_pd)), p.lift_belt_pitch)
        self.assertAlmostEqual(d["flights"] * d["flight_pitch_mm"], d["belt_mm"])
        self.assertAlmostEqual(d["speed_m_s"], math.pi * p.lift_pd / 1000 * p.lift_motor_rpm / 60)
        # roll-in from rest over a ball's diameter: d = a t^2 / 2
        a = math.atan(p.lift_inlet_slope)
        acc = 9.81 * (math.sin(a) - p.trough_crr * math.cos(a)) / (1 + p.ball_inertia_k)
        self.assertAlmostEqual(acc * d["roll_in_s"] ** 2 / 2, p.ball_d / 1000)
        self.assertGreaterEqual(d["flights_per_ball"] * d["flight_interval_s"], d["roll_in_s"] + d["clear_s"])
        self.assertLess((d["flights_per_ball"] - 1) * d["flight_interval_s"], d["roll_in_s"] + d["clear_s"])
        self.assertGreaterEqual(d["rate_per_min"], p.lift_rate_min)
        # the lift spans the gap the trough left: floor near the outlet, chute end over the rim
        self.assertGreater(d["chute_end"][2] - d["floor_z"], p.trough_design()["lift_mm"] - p.tub_drop_clear_mm)
        self.assertAlmostEqual(d["chute_end"][2], d["rim_at_end_z"] + p.tub_drop_clear_mm + p.sump_wall)
        self.assertAlmostEqual(d["boot_bottom_z"], p.lift_ground_mm)
        self.assertGreaterEqual(p.lift_floor_z, p.lift_z_bottom + p.lift_finger_t / 2)
        self.assertGreater(d["torque_margin"], p.lift_torque_factor)
        self.assertLess(d["power_w"], 10.0)
        # the sump's straight outlet plus the turn ends against the belt
        self.assertAlmostEqual(-p.rail_w - p.lift_turn_r, p.lift_x_belt + p.ball_d / 2)

    def test_lift_jam_cutoff_numbers_and_rules(self):
        # 2026-11-15, cad/README.md "Lift jam cutoff"
        p = Feeder()
        self.assertEqual(p.check_lift_jam(), [])
        c = p.lift_jam_cutoff()
        self.assertAlmostEqual(c["trip_a"], 3.3 * 33 / 133 / (0.01 * 50), places=6)   # high side: vref / (R x gain)
        self.assertLess(c["trip_lo_a"], c["trip_a"])
        self.assertLess(c["trip_a"], c["trip_hi_a"])
        self.assertGreater(c["stall_hot_a"], c["trip_hi_a"])
        self.assertLess(c["run_a"], c["trip_lo_a"])
        self.assertLess(c["cutoff_j"], c["uncut_j"] / 10)
        m = c["motor"]
        self.assertAlmostEqual(m["kt"] * (p.lift_motor_stall_a - p.lift_motor_noload_a), p.lift_motor_nm * p.lift_stall_factor)
        self.assertAlmostEqual(m["ke"] * m["noload_rad_s"] + p.lift_motor_noload_a * m["winding_ohm"], p.supply_v)
        # each rule fires
        self.assertTrue(any("full belt" in r for r in Feeder(lift_sense_r2=1.0e3).check_lift_jam()))
        self.assertTrue(any("never trip" in r for r in Feeder(lift_sense_r2=91e3).check_lift_jam()))
        self.assertTrue(any("blanking" in r for r in Feeder(lift_jam_blank_ms=100.0).check_lift_jam()))
        self.assertTrue(any("shunt takes" in r for r in Feeder(lift_shunt_w=0.25).check_lift_jam()))
        self.assertTrue(any("two ticks" in r for r in Feeder(lift_jam_trip_ms=0.0).check_lift_jam()))
        low = dict(lift_sense_side="low", lift_shunt_ohm=0.05, lift_sense_r2=2.4e3, lift_shunt_w=3.0, lift_slip_nm=1.0)
        self.assertEqual(Feeder(**low).check_lift_jam() + Feeder(**low).check_lift_slip(), [])
        self.assertTrue(any("never trip" in r for r in Feeder(lift_duty=0.6, **low).check_lift_jam()))
        # 2026-11-15, "Lift duty follows the battery": low side the trip rises 1/duty on a full pack; the 2.7k divider
        # and the 0.9 N m hub set before it would let a jam slide unseen there, and a lower floor would too
        c = Feeder(**low).lift_jam_cutoff()
        self.assertAlmostEqual(c["trip_hi_a_full_pack"], c["trip_hi_a"] / Feeder().lift_duty_min)
        self.assertLess(c["stall_margin_hi_v"], c["stall_margin_lo_v"])
        self.assertTrue(any("slide unseen" in r for r in Feeder(**dict(low, lift_sense_r2=2.7e3, lift_slip_nm=0.9)).check_lift_slip()))
        self.assertTrue(any("slide unseen" in r for r in Feeder(lift_duty_min=0.7, **low).check_lift_slip()))
        self.assertEqual(Feeder(lift_v_ref=0, **dict(low, lift_sense_r2=2.7e3, lift_slip_nm=0.9)).check_lift_slip(), [])
        # 2026-11-15, "Lift current sense inside the diode loop": high side the trip is the same at every duty, so
        # the floor, a lower fixed duty and the 0.9 N m hub no longer move it past the slide or the hot stall
        c = Feeder().lift_jam_cutoff()
        self.assertEqual(c["sense"], "high")
        self.assertEqual(c["trip_hi_a_full_pack"], c["trip_hi_a"])
        self.assertAlmostEqual(c["sense_v_per_a"], Feeder().lift_shunt_ohm * Feeder().lift_sense_gain)
        # 1.42 with the 1.0 N m hub; 1.30 with the 0.9 N m hub set since (cad/README.md "Slip hub back to 0.9 N m"),
        # against the rule's 1.1
        self.assertGreater(Feeder(lift_slip_nm=1.0).lift_slip_design()["trip_margin"], 1.4)
        self.assertGreater(Feeder().lift_slip_design()["trip_margin"], 1.25)
        self.assertLess(c["trip_hi_a"] - c["trip_lo_a"], Feeder(**low).lift_jam_cutoff()["trip_hi_a"] - Feeder(**low).lift_jam_cutoff()["trip_lo_a"])
        for kw in ({"lift_duty_min": 0.7}, {"lift_slip_nm": 0.9}, {"lift_v_ref": 0}):
            self.assertEqual(Feeder(**kw).check_lift_jam() + Feeder(**kw).check_lift_slip(), [], kw)
        self.assertEqual(Feeder(lift_duty_min=0.7).lift_jam_cutoff()["trip_hi_a_full_pack"], c["trip_hi_a"])
        # the amplifier's output stays under its 3.3 V rail at the held duty's cold stall; with no battery reading
        # (full duty on a full pack) it reaches the rail, which is still far over the reference, so it still trips
        self.assertLess(c["stall_cold_a"] * c["sense_v_per_a"] * (1 + Feeder().lift_sense_gain_tol), 3.3)
        self.assertGreater(3.3 * 0.9, 3 * c["vref_v"])
        # the tolerances widen the trip: gain error, shunt tolerance and the amplifier's offset each count
        for kw in ({"lift_sense_gain_tol": 0.0}, {"lift_shunt_tol": 0.0}, {"lift_sense_amp_offset_v": 0.0}):
            w = Feeder(**kw).lift_jam_cutoff()
            self.assertLess(w["trip_hi_a"] - w["trip_lo_a"], c["trip_hi_a"] - c["trip_lo_a"], kw)

    def test_lift_slip_hub_numbers_and_rules(self):
        # 2026-11-15, cad/README.md "Lift slip coupling"
        p = Feeder()
        self.assertEqual(p.check_lift_slip(), [])
        s = p.lift_slip_design()
        c = p.lift_jam_cutoff()
        self.assertGreater(s["slide_lo_a"], c["trip_hi_a"])           # sliding is still seen by the cutoff
        self.assertLess(s["peak_n"], c["plate_allow_n"])
        self.assertGreater(s["stick_lo_nm"], s["start_nm"])
        self.assertAlmostEqual(s["set_n"], p.lift_slip_nm / (p.lift_pd / 2000))
        self.assertLess(s["belt_share"], 0.2)
        self.assertGreater(s["shaft_mm"], s["rigid_shaft_mm"])
        # each rule fires
        self.assertTrue(any("slip on a start" in r for r in Feeder(lift_slip_nm=0.25).check_lift_slip()))
        self.assertTrue(any("slide unseen" in r for r in Feeder(lift_sense_r2=56e3).check_lift_slip()))
        self.assertTrue(any("flight cap" in r for r in Feeder(lift_slip_nm=1.6, lift_sense_r2=47e3).check_lift_slip()))
        self.assertTrue(any("spring" in r for r in Feeder(lift_slip_spring_t=0.3).check_lift_slip()))
        self.assertTrue(any("boot's wall" in r for r in Feeder(lift_slip_collar_w=20.0).check_lift_slip()))

    def test_lift_slip_wear_numbers_and_rules(self):
        # 2026-11-16, cad/README.md "Slip hub wear"
        p = Feeder()
        # Almen-Laszlo against DIN 2093's table: A 8 x 4.2 x 0.4, h0 0.2, 210 N at 0.75 h0
        a8 = Feeder(lift_slip_spring_de=8.0, lift_slip_spring_di=4.2)
        self.assertAlmostEqual(a8.disc_spring_n(0.15, t=0.4, h0=0.2), 210, delta=6)
        self.assertEqual(p.check_lift_slip_wear(), [])
        sp, w = p.lift_slip_spring(), p.lift_slip_wear()
        self.assertAlmostEqual(sp["load"](sp["set_mm"]), sp["need_n"], delta=0.5)
        self.assertLess(sp["set_share"], p.lift_slip_spring_flat_max)
        self.assertGreater(w["budget_um"], w["loss_um"])
        self.assertGreaterEqual(w["lo_nm"], w["band_lo_nm"])
        self.assertLessEqual(w["hi_nm"], w["band_hi_nm"])
        ratio = {l: r for l, r, _ in w["sweep"]}
        self.assertGreater(ratio[40.0], 0.94)
        # the single A disc it replaced: 10 um costs 15%, 40 um 61%, and a warm facing over-torques it
        one = Feeder(lift_slip_spring_t=0.7, lift_slip_spring_h0=0.3, lift_slip_spring_count=1)
        r1 = {l: r for l, r, _ in one.lift_slip_wear()["sweep"]}
        self.assertLess(r1[10.0], 0.87)
        self.assertLess(r1[40.0], 0.45)
        bad = one.check_lift_slip_wear()
        self.assertTrue(any("budget" in b for b in bad) and any("warm" in b for b in bad), bad)
        self.assertTrue(any("budget" in b for b in Feeder(lift_slip_loss_um=60.0).check_lift_slip_wear()))
        # more discs in series, more budget; the stack still leaves the bearing pocket its web
        self.assertGreater(Feeder(lift_slip_spring_count=6).lift_slip_wear()["budget_um"], w["budget_um"])
        self.assertEqual(p.check_lift_shaft(), [])
        g = p.lift_shaft_geometry()
        self.assertGreaterEqual(min(g["near_web_mm"], g["far_web_mm"]), 1.5)

    def test_lift_sense_ripple_numbers_and_rules(self):
        # 2026-11-16, cad/README.md "Sense amplifier against the PWM ripple"
        p = Feeder()
        self.assertEqual(p.check_lift_sense_ripple(), [])
        r = p.lift_sense_ripple()
        # the triangle's peak to peak, largest at D = 0.5, none at full duty
        self.assertAlmostEqual(r["pp_a"], (29.2 + 0.7) * 0.25 / (0.002 * 20000), places=9)
        self.assertEqual(p.lift_sense_ripple(duty=1.0)["pp_a"], 0.0)
        self.assertGreater(r["pp_a"], p.lift_sense_ripple(duty=0.82)["pp_a"])
        # what reaches the comparator is a few mA of motor current against a 259 mA trip spread
        self.assertLess(r["comp_pp_a"], 0.002)
        self.assertLess(r["ripple_share"], 0.01)
        self.assertGreater(r["slew_factor"], 50)
        self.assertAlmostEqual(r["delay_us"], 1e6 / (2 * math.pi * 37e3), places=6)
        self.assertFalse(p.lift_sense_ripple(duty=p.lift_duty_at(29.2))["clips"])
        # the rules fire: a 10 us filter passes the ripple; a 50 uH winding also out-runs the slew rate
        self.assertTrue(any("ripple reaches" in b for b in Feeder(lift_sense_rc_s=1e-5).check_lift_sense_ripple()))
        self.assertTrue(any("slew" in b for b in Feeder(lift_motor_mh=0.05).check_lift_sense_ripple()))
        # low side has no amplifier to check
        self.assertEqual(Feeder(lift_sense_side="low", lift_shunt_ohm=0.05, lift_sense_r2=2.4e3,
                                lift_shunt_w=3.0, lift_slip_nm=1.0).check_lift_sense_ripple(), [])
        # the switched simulation agrees with the formula and leaves the mean where the averaged plant puts it
        sys.path.insert(0, str(HERE.parent.parent / "tests"))
        import lift_sense_ripple_sweep as sw
        for duty in (0.5, p.lift_duty_at(29.2)):
            s = sw.steady(p, 29.2, duty, p.lift_jam_cutoff()["trip_a"])
            a = p.lift_sense_ripple(duty=duty)
            self.assertAlmostEqual(s["pp_a"], a["pp_a"], delta=0.03 * a["pp_a"])
            self.assertLessEqual(s["comp_pp_v"], a["comp_pp_v"] * 1.01)       # the analytic figure is a bound
            self.assertGreater(s["comp_pp_v"], 0.8 * a["comp_pp_v"])
            self.assertLess(abs(s["bias_ma"]), 0.05)
        # the amplifier adds about its pole's delay to a stall's crossing, thousands of times under the 10 ms tick
        held = p.lift_duty_at(29.2)
        added = sw.stall_cross_us(p, 29.2, held, True, False) - sw.stall_cross_us(p, 29.2, held, True, True)
        self.assertGreater(added, 0.5 * r["delay_us"])
        self.assertLess(added, 2 * r["delay_us"])

    def test_lift_tooth_jump_numbers_and_rules(self):
        # 2026-11-15, cad/README.md "Lift tooth jump"
        p = Feeder()
        self.assertEqual(p.check_lift_tooth(), [])
        d = p.lift_tooth_jump_design()
        self.assertEqual(d["mesh"], 8)
        self.assertGreater(d["strength_margin"], 5.0)
        self.assertGreater(d["jump_margin"], p.lift_tooth_jump_factor)
        # with the slack strand at zero the margin is the same at any pull
        self.assertAlmostEqual(p.lift_tooth_jump_design(pull_n=20.0)["jump_margin"], d["jump_margin"])
        # soft teeth give back the even share: hold = (T1 + T2) x wrap / 2
        soft = p.lift_tooth_jump_design(g_mpa=1e-6)
        self.assertAlmostEqual(soft["hold_n"], d["pull_n"] * math.pi / 2, delta=0.01)
        # stiffer teeth crowd the first tooth and lower the margin; friction and a taut slack strand raise it
        stiff = p.lift_tooth_jump_design(g_mpa=40.0)
        self.assertGreater(stiff["first_tooth_share"], d["first_tooth_share"])
        self.assertLess(stiff["jump_margin"], d["jump_margin"])
        self.assertGreater(p.lift_tooth_jump_design(mu=0.3)["jump_margin"], d["jump_margin"])
        self.assertGreater(p.lift_tooth_jump_design(slack_n=10.0)["jump_margin"], d["jump_margin"])
        # the needed slack-side tension brings a failing corner exactly to the factor
        bad = p.lift_tooth_jump_design(0.5, 40.0, 35.0, 0.0)
        self.assertLess(bad["jump_margin"], 1.0)
        fixed = p.lift_tooth_jump_design(0.5, 40.0, 35.0, 0.0, slack_n=bad["slack_need_n"])
        self.assertAlmostEqual(fixed["jump_margin"], p.lift_tooth_jump_factor, places=6)
        # the sweep: one corner of 81 fails, and a 20-tooth pulley does not help
        w16, w20 = p.lift_tooth_jump_sweep(), p.lift_tooth_jump_sweep(20)
        self.assertEqual(len(w16["rows"]), 81)
        self.assertEqual(len(w16["fail"]), 1)
        self.assertLess(w20["worst"]["margin"], w16["worst"]["margin"])
        # each rule fires
        self.assertTrue(any("teeth in mesh" in r for r in Feeder(lift_tooth_fuspec_n_mm=0.4,
                                                                 lift_tooth_fuspec_1200_n_mm=0.3).check_lift_tooth()))
        self.assertTrue(any("jump a tooth" in r for r in Feeder(lift_tooth_g_mpa=40.0, lift_tooth_flank_deg=35.0,
                                                                lift_belt_cspec_n=30000.0).check_lift_tooth()))
        self.assertIn(Feeder(lift_tooth_g_mpa=40.0, lift_tooth_flank_deg=35.0).check_lift_tooth()[0],
                      Feeder(lift_tooth_g_mpa=40.0, lift_tooth_flank_deg=35.0).check())

    def test_lift_strand_modes_solver_and_numbers(self):
        # 2026-11-15, cad/README.md "Lift strand modes"
        from otr_cad.params import _modes_below, _string_beam_rows
        # the solver against closed forms: a uniform string, and a pinned beam-string (f^2 = string^2 + beam^2)
        L, n, T, m, ei = 2.0, 200, 10.0, 0.085, 3.0
        h = L / n
        f = _modes_below(_string_beam_rows(h, [T] * n, 0.0), [m * h] * (n - 1), 15.0)
        for k, fk in enumerate(f[:5], 1):
            self.assertAlmostEqual(fk, k * math.sqrt(T / m) / (2 * L), delta=0.002 * fk)
        f = _modes_below(_string_beam_rows(h, [T] * n, ei), [m * h] * (n - 1), 40.0)
        for k, fk in enumerate(f[:3], 1):
            exact = math.hypot(k * math.sqrt(T / m) / (2 * L), (k * math.pi / L) ** 2 * math.sqrt(ei / m) / (2 * math.pi))
            self.assertAlmostEqual(fk, exact, delta=0.002 * exact)
        p = Feeder()
        self.assertEqual(p.check_lift_strand(), [])
        # tension: running, the down strand is the tight one at the drive pulley; both meet at the top
        dn, up = p.lift_strand_tension("down"), p.lift_strand_tension("up")
        t0 = p.lift_tension_design()["t0_n"]
        self.assertAlmostEqual(dn["t_bottom_n"] - up["t_bottom_n"], up["pull_n"], delta=0.05)
        self.assertAlmostEqual(dn["t_top_n"], up["t_top_n"], delta=0.05)
        self.assertGreater(dn["t_bottom_n"], t0)
        # the setting figure: flights' mass makes the strand ring under the bare formula, about 2.1 Hz
        pl = p.lift_pluck_design()
        self.assertLess(pl["pluck_hz"], pl["bare_hz"])
        self.assertAlmostEqual(pl["pluck_hz"], 2.12, delta=0.02)
        self.assertGreater(pl["over_tension"], 1.2)
        # with no flights and no weight it is the bare formula
        bare = Feeder(lift_flight_kg=0.0)
        tp = bare.lift_strand_tension("down", 0, running=False)
        r = bare.lift_strand_modes("down", "flat", loaded_every=0, running=False, f_max_hz=4.0)
        mean_t = sum(tp["tension"]) / len(tp["tension"])
        self.assertAlmostEqual(r["modes_hz"][0], math.sqrt(mean_t / p.lift_belt_kg_m) / (2 * tp["span_m"]), delta=0.01)
        # loaded with balls that go with it, the up strand rings lower; pinned at the pads, its spans ring high
        free = p.lift_strand_modes("up", "edge", ball_moves=False)["modes_hz"][0]
        heavy = p.lift_strand_modes("up", "edge")["modes_hz"][0]
        self.assertLess(heavy, 0.6 * free)
        pinned = p.lift_strand_modes("up", "flat", pin_loaded=True)["modes_hz"][0]
        self.assertGreater(pinned, 25.0)
        # at a fixed duty the belt's speed follows the battery and the flight rate meets the empty belt's fundamental;
        # held to lift_v_ref (2026-11-15, "Lift duty follows the battery") the band stops short of it
        fixed = Feeder(lift_v_ref=0)
        s = fixed.lift_speed_range()
        self.assertLess(s["lo"], 1.0)
        self.assertGreater(s["hi"], 1.2)
        f1 = p.lift_strand_modes("down", "flat", loaded_every=0)["modes_hz"][0]   # the empty run-on
        self.assertTrue(fixed.lift_strand_excitations(s["lo"])["flight"] < f1 < fixed.lift_strand_excitations(s["hi"])["flight"])
        self.assertTrue(fixed.lift_run_on_resonance()["hits"])
        self.assertTrue(any("passing band" in r for r in fixed.check_lift_strand()))
        held = p.lift_speed_range()
        self.assertAlmostEqual(held["lo"], s["lo"])                 # the 24 V cut is unchanged: full duty there
        self.assertLess(held["hi"], 1.02)
        r = p.lift_run_on_resonance()
        self.assertEqual(r["hits"], [])
        self.assertGreater(r["clearance"], 1.1)
        # stretch: held, uniform mass, the first mode is the lumped model's to a few per cent; balls on the up strand
        # lower the first stuck mode a little and the lumped model's 38 Hz sits above the distributed one
        held = p.lift_belt_axial_modes(1, stuck=False, balls_on_up=False)["modes_hz"][0]
        bm = p.lift_belt_model()
        self.assertAlmostEqual(held, bm["f_belt_hz"], delta=0.04 * bm["f_belt_hz"])
        st_up = [f for f in p.lift_belt_axial_modes(1)["modes_hz"] if f > 1.0]
        st_sp = [f for f in p.lift_belt_axial_modes(1, balls_on_up=False)["modes_hz"] if f > 1.0]
        self.assertLess(st_up[0], st_sp[0])
        self.assertLess(st_up[0], bm["f_stuck_hz"])
        # the rule fires on a strand that goes slack
        self.assertTrue(any("goes slack" in r for r in Feeder(lift_tension_factor=0.3).check_lift_strand()))

    def test_lift_belt_chain(self):
        # 2026-11-15 later, cad/README.md "Lift belt as a chain": the node layout the axial modes and the jam sweep's
        # time-domain chain share; two nodes a flight pitch keep the first stuck modes of the eight-node reference
        p = Feeder()
        c = p.lift_belt_chain(1, nodes_per_pitch=2)
        d = p.lift_design()
        self.assertEqual(len(c["mass"]), c["n"] - 1)
        self.assertEqual(len(set(c["flight_nodes"])), len(c["flight_nodes"]))        # one flight to a node
        self.assertEqual(len(c["ball_nodes"]), len(c["up_flight_nodes"]))
        self.assertEqual(len(p.lift_belt_chain(2, nodes_per_pitch=2)["ball_nodes"]), len(c["ball_nodes"]) // 2)
        self.assertAlmostEqual(c["h_m"] * (c["top_node"] + 1), d["centre_mm"] / 1000, delta=c["h_m"])
        self.assertTrue(set(c["up_nodes"]).isdisjoint(c["down_nodes"]))
        moving = sum(c["mass"]) + c["m_wrap_kg"]
        # the same moving mass as the fine layout, less one segment's belt (n - 1 interior nodes)
        self.assertAlmostEqual(moving, p.lift_belt_chain(1)["m_wrap_kg"] + sum(p.lift_belt_chain(1)["mass"]), delta=0.01)
        for every in (1, 2):
            for cs in p.lift_belt_cspec_sweep:
                coarse = [f for f in p.lift_belt_axial_modes(every, cs, f_max_hz=200.0, nodes_per_pitch=2)["modes_hz"] if f > 1]
                fine = [f for f in p.lift_belt_axial_modes(every, cs, f_max_hz=200.0)["modes_hz"] if f > 1]
                for a, b in zip(coarse[:2], fine[:2]):
                    self.assertAlmostEqual(a, b, delta=0.005 * b)

    def test_lift_drive_shaft_numbers_and_rules(self):
        # 2026-11-15, cad/README.md "Lift drive shaft"
        p = Feeder()
        self.assertEqual(p.check_lift_shaft(), [])
        d = p.lift_shaft_design()
        s = p.lift_slip_design()
        # the D section: no flat gives the round's figures; a flat lowers them
        r0 = Feeder.d_shaft_section(6.0, 0.0)
        self.assertAlmostEqual(r0["i_min"], math.pi * 6.0 ** 4 / 64, delta=0.05)
        self.assertAlmostEqual(r0["z_min"], math.pi * 6.0 ** 3 / 32, delta=0.05)
        self.assertLess(d["section"]["i_min"], r0["i_min"])
        # the shaft reaches the far end of the slip hub's stack and the pocket is between the bearings
        sh0, sh1 = d["shaft_y"]
        self.assertLess(sh0, -(s["half_pulley_mm"] + s["far_side_mm"]))
        self.assertGreater(sh1, s["half_pulley_mm"] + s["motor_side_mm"])
        self.assertAlmostEqual(d["near_n"] + d["far_n"], d["f_jam_n"])
        # past 2 T0 r the slack strand goes slack: the jam load is the hub's highest torque over the radius
        self.assertAlmostEqual(d["f_jam_n"], s["stick_hi_nm"] / (p.lift_pd / 2000))
        self.assertGreater(d["f_jam_n"], d["f_run_n"])
        # the old layout's moment on the gearbox is what this removes
        self.assertGreater(d["old_gm_ratio"], 1.0)
        self.assertEqual(d["motor_face_y"], d["coupler_y"][1] + d["motor_gap_mm"])
        self.assertLessEqual(p.lift_y + d["motor_face_y"] + p.lift_gm_len, p.base_half_w - p.lift_gm_bracket_clear)
        # each rule fires
        self.assertTrue(any("enters the coupling" in r for r in Feeder(gm_shaft_len=6.0).check_lift_shaft()))
        self.assertTrue(any("coupling's" in r for r in Feeder(lift_coupler_nm=1.0).check_lift_shaft()))
        self.assertTrue(any("running" in r for r in Feeder(lift_shaft_allow_mpa=10.0).check_lift_shaft()))
        self.assertTrue(any("at a jam" in r for r in Feeder(lift_shaft_static_mpa=50.0).check_lift_shaft()))
        self.assertTrue(any("sags" in r for r in Feeder(lift_shaft_defl_mm=0.005).check_lift_shaft()))
        self.assertTrue(any("static rating" in r for r in Feeder(lift_bearing_c0_n=100.0).check_lift_shaft()))
        self.assertTrue(any("pocket" in r for r in Feeder(lift_bearing_w=12.0).check_lift_shaft()))
        self.assertTrue(any("drive bracket" in r for r in Feeder(lift_gm_len=100.0).check_lift_shaft()))
        self.assertTrue(any("spacer's bore" in r for r in Feeder(lift_coupler_d=30.0).check_lift_shaft()))
        self.assertIn(Feeder(lift_coupler_nm=1.0).check_lift_shaft()[0], Feeder(lift_coupler_nm=1.0).check())

    def test_lift_rules_catch_bad_changes(self):
        self.assertTrue(any("inlet falls" in r for r in Feeder(lift_finger_l=26.0).check_lift()))
        self.assertTrue(any("do not hold" in r for r in Feeder(lift_finger_l=8.0).check_lift()))
        self.assertTrue(any("balls a minute" in r for r in Feeder(lift_motor_rpm=60.0).check_lift()))
        self.assertTrue(any("N m" in r for r in Feeder(lift_motor_nm=0.2).check_lift()))
        self.assertTrue(any("front mast rail" in r for r in Feeder(lift_x=-70.0).check_lift()))
        self.assertTrue(any("rear mast rail" in r for r in Feeder(lift_x=-110.0).check_lift()))
        self.assertTrue(any("over the tub" in r for r in Feeder(chute_target=(-360.0, 160.0)).check_lift()))
        self.assertTrue(any("hood" in r for r in Feeder(lift_hood_deg=80.0).check_lift()))
        self.assertIn(Feeder(lift_motor_nm=0.2).check_lift()[0], Feeder(lift_motor_nm=0.2).check())

    def test_lift_tensioner_numbers(self):
        p = Feeder()
        d, t = p.lift_design(), p.lift_tension_design()
        self.assertAlmostEqual(t["t0_n"], p.lift_tension_factor * d["pull_n"])
        self.assertGreater(t["slack_n"], 0)
        self.assertAlmostEqual(t["tight_n"] - t["slack_n"], d["pull_n"])
        # the free centre is the belt's own length; the 959-tooth belt rounds up, so it sits a little long
        self.assertAlmostEqual(2 * t["free_centre_mm"] + math.pi * p.lift_pd, d["belt_mm"])
        self.assertGreater(t["free_centre_mm"], d["centre_mm"])
        # travel spans both length tolerances, the stretch and the slack to put the belt on
        self.assertAlmostEqual(t["travel_mm"], p.lift_belt_len_tol_mm + t["stretch_mm"] / 2 + p.lift_install_mm)
        self.assertLess(t["off_lo_mm"], -p.lift_tooth_h)
        self.assertTrue(t["off_lo_mm"] < t["off_set_mm"] < t["off_hi_mm"])
        # the setting figures: a taut string's fundamental and a mid-span push
        span = d["centre_mm"] / 1000
        self.assertAlmostEqual(t["ring_hz"], math.sqrt(t["t0_n"] / p.lift_belt_kg_m) / (2 * span))   # bare belt
        self.assertAlmostEqual(t["push_1n_mm"], span * 1000 / (4 * t["t0_n"]))
        self.assertGreater(t["ring_hz_top"], t["ring_hz"])
        self.assertAlmostEqual(t["jack_n"], 2 * (t["t0_n"] + t["strand_weight_n"]) + p.lift_top_kg * 9.81)
        # the top clip sits under the head's lowest position; the spine stops under the lowered pulley's teeth
        self.assertAlmostEqual(p.lift_clip_z()[-1] + 12.0, p.lift_head_z0 + t["off_lo_mm"] - p.LIFT_JACK_K - 1.0)
        self.assertAlmostEqual(p.lift_spine_top_z, p.lift_z_top + t["off_lo_mm"] - p.lift_r_in - 3.0)
        # the upper spine bolt's T-nut stays on the spine at the head's highest
        self.assertLess(p.lift_head_z0 + t["off_hi_mm"] + max(p.LIFT_HEAD_BOLT_Z) + 2.5 + 6.0, p.lift_spine_top_z)

    def test_lift_tensioner_rules_catch_bad_changes(self):
        self.assertTrue(any("goes slack" in r for r in Feeder(lift_tension_factor=0.4).check_lift()))
        self.assertTrue(any("come down far enough" in r
                            for r in Feeder(lift_install_mm=0.0, lift_belt_len_tol_mm=0.0).check_lift()))
        self.assertTrue(any("printed nut" in r for r in Feeder(lift_jack_nut_n=10.0).check_lift()))
        self.assertTrue(any("T-nuts hold" in r for r in Feeder(lift_clip_slip_n=10.0).check_lift()))

    def test_lift_flight_cap_numbers(self):
        p = Feeder()
        f, d = p.lift_flight_design(), p.lift_design()
        w = p.ball_g / 1000 * 9.81
        # the pad's far corner, a tangent off the belt's back, turns just inside the finger tips' sweep
        self.assertAlmostEqual(f["pad_corner_r"], p.lift_r_sweep - p.lift_cap_sweep_clear)
        # the couple: pad push x arm = ball weight x finger length; the cleat alone takes it over half its foot
        self.assertAlmostEqual(f["pad_push_n"] * f["arm_mm"], w * p.lift_finger_l)
        self.assertAlmostEqual(f["cleat_push_n"] * p.lift_cleat_foot / 2, w * p.lift_finger_l)
        self.assertGreater(f["cleat_push_n"], 5 * f["pad_push_n"])
        # the lift's sliding term uses the cap's arm (about the 30 mm base plate's 15 mm it replaced)
        per = w * (1 + p.lift_crr_wall * d["rod_load_ratio"] + p.lift_mu_back * p.lift_finger_l / f["arm_mm"])
        self.assertAlmostEqual(d["per_ball_n"], per)
        self.assertAlmostEqual(f["arm_mm"], 15.0, delta=0.1)
        # a stalled jam on one plate: the motor's stall pull, the plate's bending and the weld's peel
        self.assertAlmostEqual(f["jam_n"], p.lift_motor_nm * p.lift_stall_factor / (p.lift_pd / 2000))
        self.assertLess(f["jam_mpa"], p.lift_cap_allow_mpa)
        self.assertLess(f["jam_peel_n"], p.lift_cleat_weld_n)
        self.assertGreater(f["pad_gap_mm"], 0)

    def test_lift_flight_cap_rules_catch_bad_changes(self):
        self.assertTrue(any("pad" in r and "gap" in r for r in Feeder(lift_cap_pad_t=2.8).check_lift()))
        self.assertTrue(any("nuts" in r for r in Feeder(lift_cap_pin_x=4.5).check_lift()))
        self.assertTrue(any("cleat's top" in r for r in Feeder(lift_cap_pin_x=9.5).check_lift()))
        self.assertTrue(any("MPa" in r for r in Feeder(lift_stall_factor=6.0).check_lift()))
        self.assertTrue(any("peels" in r for r in Feeder(lift_cleat_weld_n=100.0).check_lift()))
        self.assertTrue(any("width" in r for r in Feeder(lift_cap_pin_y=10.0).check_lift()))

@unittest.skipUnless(HAVE_CAD, "build123d not installed")
class BearingFitParamsTest(unittest.TestCase):
    """2026-11-15, cad/README.md "Bearing fit test ring"."""

    def test_lame_limits_and_kinds(self):
        p = Feeder()
        r = p.lift_bearing_od / 2
        # an endless block: the bore's compliance is 1 + nu; zero interference, zero pressure
        self.assertAlmostEqual(p.bearing_fit(0.0, 0.1, b=1e6)["compliance"], 1 + p.petg_nu, places=6)
        self.assertEqual(p.bearing_fit(0.1, 0.2)["pressure_mpa"], 0.0)
        # hand check at b = 22: i = 0.1 mm, K = (22^2 + 9.5^2) / (22^2 - 9.5^2)
        k = (22 ** 2 + r * r) / (22 ** 2 - r * r)
        f = p.bearing_fit(0.05, 0.2)
        self.assertAlmostEqual(f["pressure_mpa"], p.petg_hoop_e_mpa * 0.05 / (r * (k + p.petg_nu)), places=6)
        self.assertAlmostEqual(f["hoop_mpa"], f["pressure_mpa"] * k, places=6)
        self.assertAlmostEqual(f["press_n"], p.petg_steel_mu * f["pressure_mpa"] * math.pi * 19.0 * 4.5, places=6)
        # tighter bores, more pressure; the kinds run loose, slip, light, press, tight as the bore shrinks
        order = ["loose", "slip", "light", "press", "tight"]
        kinds = [p.bearing_fit(o, 0.2)["kind"] for o in (0.2, 0.11, 0.095, 0.05, -0.05)]
        self.assertEqual(kinds, order)
        lo, hi = p.bearing_fit_window()
        self.assertAlmostEqual(lo, 19.0 * (p.petg_cte - p.steel_cte) * p.fit_dt_k)
        self.assertAlmostEqual(p.bearing_fit(0.0, hi * 0.999)["hoop_mpa"], p.fit_hoop_allow_mpa, delta=0.02)

    def test_ring_covers_every_swept_printer_and_the_boot_is_stiffer(self):
        p = Feeder()
        self.assertEqual(p.check_bearing_fit_ring(), [])
        d = p.bearing_fit_ring_design()
        for s, c in d["covered"].items():
            self.assertTrue(c, s)
        # no single drawn size suits every swept printer: that is why the ring exists
        self.assertFalse(any(all(p.bearing_fit(o, s)["kind"] == "press" for s in p.print_hole_under_sweep)
                             for o in [x / 100 for x in range(-10, 21)]))
        self.assertGreater(d["boot_factor"], 1.0)
        self.assertEqual(d["boot"]["kind"], "press")
        self.assertLess(d["boot"]["race_close_um"], 13.0)

    def test_rules_fire(self):
        self.assertTrue(any("apart on the diameter" in r for r in Feeder(bearing_ring_steps=(0.0, 0.15)).check_bearing_fit_ring()))
        self.assertTrue(any("no bore in the press window" in r
                            for r in Feeder(print_hole_under_sweep=(-0.3,)).check_bearing_fit_ring()))
        self.assertTrue(any("rising order" in r for r in Feeder(bearing_ring_steps=(0.05, 0.0)).check_bearing_fit_ring()))
        self.assertTrue(any("counterbore" in r for r in Feeder(bearing_ring_pitch=28.0).check_bearing_fit_ring()))
        self.assertTrue(any("set lift_bearing_fit_mm" in r for r in Feeder(lift_bearing_fit_mm=0.2).check_bearing_fit_ring()))
        self.assertIn(Feeder(lift_bearing_fit_mm=0.2).check_bearing_fit_ring()[0], Feeder(lift_bearing_fit_mm=0.2).check())

    def test_pick_and_cli(self):
        p = Feeder()
        # bores run tightest first: a real ring reads cracked or hard at the top and drops at the bottom
        self.assertEqual(p.pick_bore_over(["cracks", "hard", "presses", "presses", "presses", "slides"])["over"], 0.05)
        self.assertEqual(p.pick_bore_over(["hard", "presses", "presses", "slides", "drops", "drops"])["over"], -0.03 + 0.03)
        self.assertEqual(p.pick_bore_over(["cracks", "hard", "hard", "slides", "drops", "drops"])["over"], 0.03)
        self.assertIsNone(p.pick_bore_over(["slides"] * 6)["over"])
        self.assertIsNone(p.pick_bore_over(["cracks"] * 6)["over"])
        with self.assertRaises(ValueError):
            p.pick_bore_over(["presses"] * 5)
        with self.assertRaises(ValueError):
            p.pick_bore_over(["snug"] * 6)
        run = subprocess.run([sys.executable, "-m", "otr_cad", "fit-ring", "hard", "hard", "presses", "presses",
                              "slides", "drops"], cwd=HERE.parent, capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(json.loads(run.stdout)["over"], 0.03)
        self.assertIn("lift_bearing_fit_mm=0.03", run.stderr)
        bad = subprocess.run([sys.executable, "-m", "otr_cad", "fit-ring", "presses"], cwd=HERE.parent,
                             capture_output=True, text=True)
        self.assertEqual(bad.returncode, 2)


@unittest.skipUnless(HAVE_CAD, "build123d not installed")
class LiftCadTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from otr_cad import feeder as F
        cls.F = F
        cls.p = Feeder()
        cls.parts = {q.name: q for q in F.all_parts(cls.p)}

    def test_bearing_fit_ring(self):
        # 2026-11-15, cad/README.md "Bearing fit test ring": one pocket per step, sized as drawn, cut as the boot's
        from build123d import Box, Cylinder, Location
        F, p = self.F, self.p
        ring = self.parts["lift_bearing_fit_ring"]
        self.assertEqual(ring.placements, [])           # a test print: not in the assembly, the sweeps or the mass
        self.assertEqual(ring.kind, "print")
        s = ring.shape
        self.assertTrue(s.is_valid)
        bb = s.bounding_box()
        self.assertLessEqual(max(bb.size.X, bb.size.Z), 200.0)   # fits a 220 mm bed standing up
        self.assertAlmostEqual(bb.min.Z, 0.0, places=3)
        cells = F.fit_ring_cells(p)
        self.assertEqual([c[2] for c in cells], list(p.bearing_ring_steps))
        B, ft = p.lift_bearing_w, p.lift_bearing_flange_t
        for k, (x, z, over) in enumerate(cells):
            rb = p.lift_bearing_od / 2 + over
            probe = lambda r, y0, y1: Cylinder(r, y1 - y0).moved(Location((x, (y0 + y1) / 2, z), (90, 0, 0)))
            # the bore is empty to its drawn radius and solid just past it, behind the counterbore
            self.assertLess((probe(rb - 0.005, -B / 2, B / 2 - ft - 0.05) & s).volume, 0.01, over)
            ring_band = probe(rb + 0.05, -B / 2 + 0.1, B / 2 - ft - 0.1) - probe(rb + 0.01, -B / 2, B / 2)
            self.assertAlmostEqual((ring_band & s).volume, ring_band.volume, delta=0.01 * ring_band.volume)
            # the flange's counterbore from the front face, as in the boot
            self.assertLess((probe(p.lift_bearing_flange_d / 2 + 0.15, B / 2 - ft + 0.05, B / 2) & s).volume, 0.01)
            # k + 1 dimples over the bore
            dots = Box(4.0 * (k + 2), 1.0, 2.6).moved(Location((x, B / 2 - 0.5, z + p.lift_bearing_flange_d / 2 + 0.2 + 4.5)))
            vol = dots.volume - (dots & s).volume
            self.assertAlmostEqual(vol, (k + 1) * math.pi * 1.0 * 1.0, delta=0.3, msg=f"dots over bore {k}")
        # the boot's pocket bore follows lift_bearing_fit_mm
        self.assertGreater(F.lift_bearing_pockets(Feeder(lift_bearing_fit_mm=0.15)).volume, F.lift_bearing_pockets(p).volume)
        # the boot is solid round both pockets out to boot_b (what bearing_fit_ring_design takes it as)
        boot = self.parts["lift_boot"].placed()[0]
        g, b = p.lift_shaft_geometry(), p.bearing_fit_ring_design()["boot_b_mm"]
        for yc in g["bearing_y"]:
            loc = Location((p.lift_x_pulley, p.lift_y + yc, p.lift_z_bottom), (90, 0, 0))
            ann = Cylinder(b, B - 2 * ft).moved(loc) - Cylinder(p.lift_bearing_flange_d / 2 + 0.3, B).moved(loc)
            self.assertGreater((ann & boot).volume / ann.volume, 0.85, yc)

    def _solids(self, name):
        q = self.parts[name]
        return [q.shape.moved(loc) for loc in q.placements]

    def _fixed(self):
        return [s for n in ("lift_boot", "lift_base_plate", "lift_spine", "lift_rod", "lift_clip", "lift_head",
                            "lift_chute", "trough_sump", "net_beam", "mast_rail") for s in self._solids(n)]

    def test_a_ball_rolls_from_the_sump_round_the_inlet_to_the_belt(self):
        from build123d import Location, Sphere
        r = self.p.ball_d / 2
        fixed = self._fixed()
        for x, y, z in self.F._inlet_path(self.p, 8):
            ball = Sphere(r - 0.5).moved(Location((x, y, z + r + 0.5)))
            hits = [round((ball & s).volume) for s in fixed if (ball & s).volume > 1.0]
            self.assertEqual(hits, [], (x, y, z))
        # where it waits: on the floor, against the belt's back, at the channel's +y wall
        x, y, z = self.F._inlet_path(self.p, 8)[-1]
        self.assertAlmostEqual(z, self.p.lift_floor_z)
        self.assertAlmostEqual(x - r, self.p.lift_x_belt)
        self.assertAlmostEqual(y + r, self.p.lift_y + self.p.lift_depth / 2)

    def test_a_ball_on_a_finger_rises_clear_up_the_channel(self):
        from build123d import Location, Sphere
        r = self.p.ball_d / 2
        fixed = self._fixed()
        x = self.p.lift_x_belt + self.p.lift_gap + r - 0.5          # pushed against the front rod
        z0 = self.p.lift_floor_z + r + 2.0
        z1 = self.p.lift_z_top
        for k in range(13):
            z = z0 + (z1 - z0) * k / 12
            ball = Sphere(r - 0.5).moved(Location((x, self.p.lift_y, z)))
            hits = [round((ball & s).volume) for s in fixed if (ball & s).volume > 1.0]
            self.assertEqual(hits, [], z)
        # and the front rod is there to push against
        rod = min(self._solids("lift_rod"), key=lambda s: -s.bounding_box().max.X)
        self.assertAlmostEqual(rod.bounding_box().min.X, self.p.lift_x_front, places=3)

    def test_a_ball_rides_over_the_top_and_down_the_chute_into_the_tub(self):
        from build123d import Location, Sphere
        p = self.p
        r = p.ball_d / 2
        fixed = self._fixed()
        rc = p.lift_r_out + r + 0.5
        for deg in range(-90, int(p.lift_hood_deg) + 1, 15):
            a = math.radians(deg)
            c = (p.lift_x_pulley - rc * math.sin(a), p.lift_y, p.lift_z_top + rc * math.cos(a))
            ball = Sphere(r - 0.5).moved(Location(c))
            hits = [round((ball & s).volume) for s in fixed if (ball & s).volume > 1.0]
            self.assertEqual(hits, [], deg)
        d = p.lift_design()
        (sx, sy, sz), (ex, ey, ez) = d["chute_start"], d["chute_end"]
        for k in range(7):
            t = k / 6
            c = (sx + (ex - sx) * t, sy + (ey - sy) * t, sz + (ez - sz) * t + r + 0.5)
            ball = Sphere(r - 0.5).moved(Location(c))
            hits = [round((ball & s).volume) for s in fixed if (ball & s).volume > 1.0]
            self.assertEqual(hits, [], t)
        # the chute ends over the tub's opening, its floor clear of the rim
        tub = self._solids("hopper_tub")[0].bounding_box()
        self.assertTrue(tub.min.Y + r < ey < tub.max.Y - r)
        xr, xf = p.tub_opening_x()
        self.assertTrue(xr < ex < xf)
        self.assertGreater(ez, p.tub_rim_at(ex) + p.tub_drop_clear_mm)

    def test_belt_and_flights_clear_the_boot_head_spine_and_floor(self):
        belt = self._solids("lift_belt")[0]
        for n in ("lift_boot", "lift_head", "lift_spine", "lift_pulley", "lift_clip", "lift_base_plate", "lift_rod"):
            for s in self._solids(n):
                self.assertLess((belt & s).volume, 1.0, n)
        bb = belt.bounding_box()
        self.assertGreaterEqual(bb.min.Z - self.p.lift_wall, self.p.lift_ground_mm - 1e-6)

    def test_flight_caps_turn_round_both_pulleys_clear(self):
        """A cap rides rigid on its cleat, so round a pulley its loose pad stays a tangent off the belt's back. Start
        it with its plate at the up strand's end (the pad's corner at its furthest out) and turn it about each pulley's
        axis the way the belt goes: it stays inside the belt's envelope and clear of the boot, the head, the pulleys,
        the spine and the base plate. On the straight it sits on the belt's back and inside the envelope."""
        from build123d import Location
        p = self.p
        cap = self.F.lift_flight_cap_solid(p)
        env = self.F.lift_belt_envelope(p)
        others = [(n, s) for n in ("lift_boot", "lift_head", "lift_pulley", "lift_spine", "lift_base_plate", "lift_clip",
                                   "lift_rod") for s in self._solids(n)]
        placed = self._solids("lift_flight_cap")[0]
        self.assertAlmostEqual((placed & env).volume, placed.volume, delta=1.0)
        self.assertAlmostEqual(placed.bounding_box().min.X, p.lift_x_belt, places=3)     # the pad on the belt's back
        for zc, sign in ((p.lift_z_bottom, 1), (p.lift_z_top, -1)):
            ax = (p.lift_x_pulley, p.lift_y, zc)
            for deg in range(0, 181, 15):
                loc = (Location(ax) * Location((0, 0, 0), (0, sign * deg, 0)) * Location((-ax[0], -ax[1], -ax[2]))
                       * Location((p.lift_x_belt, p.lift_y, zc)))
                c = cap.moved(loc)
                # the envelope's radius is the finger tip's middle; the plate's tip corners reach
                # hypot(r_sweep, finger_t / 2), 0.1 mm further: a sliver of at most W (2/3) h^3 / r_sweep (about
                # 10 mm^3; the boot and head are checked below)
                h = p.lift_finger_t / 2
                sliver = p.lift_finger_w * 2 / 3 * h ** 3 / p.lift_r_sweep
                self.assertLess(c.volume - (c & env).volume, 1.1 * sliver + 0.5, (zc, deg))
                for n, s in others:
                    self.assertLess((c & s).volume, 1.0, (zc, deg, n))

    def test_head_travels_its_whole_take_up_on_the_spine(self):
        """Head (with the top pulley) moved to each end of its travel: clear of the spine, the top clip and the rods,
        the rods still seated, and the four side bolts (they slide with the head in the spine's slots) still in the
        spine."""
        from build123d import Cylinder, Location
        p = self.p
        t = p.lift_tension_design()
        head = self._solids("lift_head")[0]
        pulley_top = max(self._solids("lift_pulley"), key=lambda s: s.bounding_box().max.Z)
        spine = self._solids("lift_spine")[0]
        clip = max(self._solids("lift_clip"), key=lambda s: s.bounding_box().max.Z)
        rods = self._solids("lift_rod")
        y_in, y_out = 20.0, p.lift_depth / 2 + p.lift_wall + 1.0
        bolts = [Cylinder(2.5, y_out - y_in).moved(Location(
            (p.lift_x_pulley, p.lift_y + s * (y_in + y_out) / 2, p.lift_head_z0 + zb), (90, 0, 0)))
            for s in (1, -1) for zb in p.LIFT_HEAD_BOLT_Z]
        for off in (t["off_lo_mm"], t["off_hi_mm"]):
            h = head.moved(Location((0, 0, off)))
            pu = pulley_top.moved(Location((0, 0, off)))
            for name, s in [("spine", spine), ("clip", clip)] + [(f"rod{i}", r) for i, r in enumerate(rods)]:
                self.assertLess((h & s).volume, 1.0, (off, name))
            self.assertLess((pu & spine).volume, 1.0, off)
            for i, b in enumerate(bolts):
                b = b.moved(Location((0, 0, off)))
                self.assertLess((h & b).volume, 1.0, (off, i))
                self.assertLess(b.bounding_box().max.Z + 6.0, spine.bounding_box().max.Z, (off, i))   # T-nut on the spine
            for r in rods:
                self.assertGreater(r.bounding_box().max.Z - (p.lift_head_z0 + off), 10.0)
            # jack screws: the head never comes down onto their hex heads
            self.assertGreaterEqual(p.lift_head_z0 + off - p.LIFT_JACK_K - p.lift_clip_top_z, 1.0 - 1e-6)

    def test_lift_stands_outside_the_head_and_turntable_at_every_pose(self):
        from otr_cad.package import clashes, cross_clashes
        p = self.p
        lift = [(f"{n}[{i}]", s) for n in self.F.LIFT_PARTS for i, s in enumerate(self._solids(n))]
        # clashes(moving + lift) holds the entries of clashes(moving), cross_clashes(moving, lift) and clashes(lift),
        # so it equals clashes(lift) exactly when the first two are empty, which is what this asserts. The lift does
        # not move, so its own 82 touching pairs are intersected once, not at every pose (2026-11-20)
        own = clashes(lift)
        for elev in (p.elev_min, 0.0, p.elev_max):
            for az in (-p.az_reach_deg, 0.0, p.az_reach_deg):
                moving, _ = self.F.turned_solids(p, elev, az)
                self.assertEqual(clashes(moving) + cross_clashes(moving, lift) + own, own, (elev, az))



class PowerParamsTest(unittest.TestCase):
    """Power distribution (2026-11-14): branch fuses and gauges, the main fuse and contactor, the BMS budget."""

    def test_defaults_pass_and_the_branches_add_up(self):
        p = Feeder()
        self.assertEqual(p.check_power(), [])
        d = p.power_distribution()
        self.assertAlmostEqual(d["total_a"], sum(b["run_a"] for b in d["branches"]))
        self.assertLessEqual(d["total_a"], p.bms_use_frac * p.bms_cont_a)
        self.assertGreaterEqual(d["main_fuse_a"], 1.25 * d["total_a"])
        self.assertLessEqual(d["main_fuse_a"], AWG_AMPS[p.main_feed_awg])
        self.assertEqual(d["main_fuse_a"], 30.0)            # the 30 A the wiring notes always named, now derived
        self.assertGreaterEqual(d["contactor_a"], d["main_fuse_a"])
        for b in d["branches"]:
            self.assertIn(b["fuse_a"], FUSE_SIZES_A)
            self.assertGreaterEqual(b["fuse_a"], 1.25 * b["run_a"] - 1e-9, b["name"])
            self.assertGreaterEqual(b["fuse_a"] * p.motor_start_factor, b["peak_a"] - 1e-9, b["name"])
            self.assertGreaterEqual(AWG_AMPS[b["awg"]], b["fuse_a"], b["name"])   # every fuse protects its wire
            self.assertLessEqual(b["awg"], p.branch_awg_min)
        # only the Pi's buck is upstream of the contactor, so the Pi and ESP32 see the e-stop
        self.assertEqual([b["name"] for b in d["branches"] if not b["switched"]], ["Pi buck, 5 V (before the contactor)"])
        # the ESCs draw what the ramp allows; a spin-up at the motor's peak would ask over 3x the BMS for two wheels
        self.assertAlmostEqual(d["esc_a"], (p.wheel_spinup_w + p.launch_drag_w) / (p.esc_eff * p.battery_v_min))
        self.assertGreater(2 * d["unramped_esc_a"], 3 * p.bms_cont_a)

    def test_spinup_time_is_the_ramp_integrated(self):
        p = Feeder()
        k = p.wheel_spinup_w / p.launch_wheel_kgm2 * (60 / (2 * math.pi)) ** 2
        rpm, t, dt = 0.0, 0.0, 1e-4
        while rpm < 6000:
            rpm = min(rpm + p.wheel_ramp_max_rpm_s * dt, math.sqrt(rpm * rpm + 2 * k * dt), 6000)
            t += dt
        self.assertAlmostEqual(p.spinup_s(6000), t, delta=2e-3)
        self.assertAlmostEqual(p.spinup_s(500), 500 / p.wheel_ramp_max_rpm_s)
        self.assertAlmostEqual(p.launch_wheel_kgm2, p.launch_wheel_k * p.launch_wheel_kg * (p.wheel_head_d / 2000) ** 2
                               + p.launch_rotor_kgm2)

    def test_fuse_and_gauge_tables(self):
        self.assertEqual(fuse_for(2.5), 3.0)
        self.assertEqual(fuse_for(30.0), 30.0)
        self.assertEqual(fuse_for(30.01), 35.0)
        self.assertEqual(gauge_for(15.0), 16)
        self.assertEqual(gauge_for(15.01), 14)
        self.assertEqual(gauge_for(1.0), 26)

    def test_rules_catch_bad_changes(self):
        cases = [
            ({"wheel_spinup_w": 200.0}, "lower wheel_spinup_w to 107 W"),
            ({"bms_cont_a": 20.0}, "over 80% of the BMS's 20 A"),
            ({"main_feed_awg": 14}, "main fuse 30 A is over what the 14 AWG"),
            ({"main_feed_mm": 3000.0}, "battery feed drops"),
            ({"lift_wires": (("lift gearmotor", 2, 26),)}, "lift lead (26 AWG"),
            ({"servo_lead_awg": 24}, "servo supply (24 AWG"),
            ({"stepper_amps": 6.0}, "stepper coils (22 AWG"),
            ({"base_motor_stall_a": 16.0}, "H-bridge base channel"),
            ({"elev_act_run_a": 12.0}, "H-bridge elevation channel"),
        ]
        for kw, msg in cases:
            bad = Feeder(**kw).check_power()
            self.assertTrue(any(msg in r for r in bad), (kw, bad))
        self.assertTrue(any("BMS" in r for r in Feeder(wheel_spinup_w=200.0).check()))


class RegenTest(unittest.TestCase):
    """Regenerative braking (2026-11-14): the bus with the pack, with the contactor open, and the coast-down bound."""

    def test_defaults_pass_and_the_build_runs_it(self):
        import inspect
        p = Feeder()
        self.assertEqual(p.check_regen(), [])
        self.assertIn("self.check_regen()", inspect.getsource(Feeder.check))
        d = p.regen_braking()
        self.assertAlmostEqual(d["bus_w"], 2 * p.wheel_spinup_w * p.regen_eff)
        self.assertLess(d["diode_bus_v"], p.switched_v_max)

    def test_isolated_bus_against_brute_force(self):
        p = Feeder()
        d = p.regen_braking()
        c, P = d["c_f"], d["bus_w"]
        for case in d["estop"].values():
            v, t, dt = case["v0"], 0.0, 1e-6
            crossed = None
            while t < case["window_ms"] / 1e3 - 1e-12:
                v += P / v / c * dt
                t += dt
                if crossed is None and v >= p.switched_v_max:
                    crossed = t
            self.assertAlmostEqual(v, case["peak_v"], delta=0.02 * case["peak_v"])
            self.assertAlmostEqual(crossed * 1e3, case["to_limit_ms"], delta=0.05 * case["to_limit_ms"] + 0.01)

    def test_failing_designs_are_named(self):
        no_diode = Feeder(regen_diode=False).check_regen()
        self.assertTrue(any("isolated bus" in r and "regen_diode" in r for r in no_diode))
        unguarded = Feeder(regen_brake_max_v=29.2).check_regen()
        self.assertTrue(any("REGEN_BRAKE_MAX_MV" in r for r in unguarded))
        self.assertTrue(any("charge limit" in r for r in Feeder(bms_charge_a=5.0).check_regen()))
        self.assertTrue(any("reverse rating" in r for r in Feeder(regen_diode_vr=30.0).check_regen()))
        self.assertTrue(any("regen diode" in r for r in Feeder(regen_diode_a=10.0).check_regen()))

    def test_coast_is_a_lower_bound(self):
        """Drag torque rising with speed (bearings plus air), equal to launch_drag_w at the top speed: integrated, it
        takes at least as long as coast_s's constant-torque bound, from the top speed and from 80% of it."""
        p = Feeder()
        w0 = max(p.launch_rpm) * 2 * math.pi / 60
        tau0 = p.launch_drag_w / w0
        inertia = p.launch_wheel_kgm2
        for air in (0.0, 0.5, 0.9):
            a, b = (1 - air) * tau0, air * tau0 / (w0 * w0)
            for start, end in ((1.0, 0.8), (0.8, 0.3)):
                w, t, dt = start * w0, 0.0, 1e-3
                while w > end * w0:
                    w -= (a + b * w * w) / inertia * dt
                    t += dt
                bound = p.coast_s(start * max(p.launch_rpm), end * max(p.launch_rpm))
                self.assertGreaterEqual(t + dt, bound)
                if air == 0.0:
                    self.assertAlmostEqual(t, bound, delta=0.01 * bound)
        d = p.regen_braking()
        self.assertLess(d["slow_20pct"]["brake_s"], d["slow_20pct"]["coast_s"])
        self.assertAlmostEqual(d["wheel_j"] / p.launch_drag_w * 2 / d["coast_to_rest_s"], 1.0, places=6)


class BrakesAndBouncesInARowTest(unittest.TestCase):
    """Several ESC brakes in a row against the firmware's guard, and several contact bounces in a row (2026-11-14)."""

    def test_single_threshold_chatters_and_the_band_does_not(self):
        p = Feeder()
        old = p.regen_guard(0.0)
        self.assertGreaterEqual(old["flips_max"], old["ticks"] - 2)      # flips every tick inside the band
        lo, hi = old["chatter_band_v"]
        self.assertLess(lo, p.regen_brake_max_v - old["rise_v"])
        self.assertGreater(hi - lo, old["rise_v"])
        new = p.regen_guard()
        self.assertLessEqual(new["flips_max"], 1)
        self.assertIsNone(new["chatter_band_v"])
        self.assertGreater(p.regen_brake_hyst_v, new["needed_hyst_v"])
        # just under the needed band still flips; just over does not
        self.assertGreater(p.regen_guard(new["needed_hyst_v"] - 0.01)["flips_max"], 1)
        self.assertLessEqual(p.regen_guard(new["needed_hyst_v"] + 0.01)["flips_max"], 1)
        bad = Feeder(regen_brake_hyst_v=0.0).check_regen()
        self.assertTrue(any("REGEN_BRAKE_HYST_MV" in r for r in bad), bad)
        self.assertEqual(p.check_regen(), [])

    def test_brakes_in_a_row_do_not_creep_the_pack(self):
        p = Feeder()
        g = p.regen_guard()
        d = p.regen_braking()
        # a 20% slow-down of both wheels returns 36% of their energy, less the ESC's loss
        self.assertAlmostEqual(g["slow_j"], 2 * 0.36 * d["wheel_j"] * p.regen_eff, delta=1e-6)
        self.assertGreater(g["slows_per_pct"], 50)
        # a loaded reading lets braking start from a pack resting above the threshold, still short of the cut
        self.assertGreater(g["loaded_top_cell_v"], d["brake"]["top_cell_v"])
        self.assertLess(g["loaded_top_cell_v"], p.bms_cell_ovp_v - 0.02)
        bad = Feeder(regen_brake_max_v=28.0).check_regen()
        self.assertTrue(any("hold speed" in r for r in bad), bad)

    def test_bounce_train_matches_the_closed_form(self):
        p = Feeder()
        d = p.contactor_inrush()
        # one make with no bounce: the precharge closing, as the closed form gives it (the relay's own path adds
        # under the idle load's worth)
        one = p.contactor_bounce_train(p.bus_idle_a, 1, 1.0)
        self.assertAlmostEqual(one["makes"][-1]["peak_a"], d["precharge"]["close"]["peak_a"], delta=p.bus_idle_a + 0.05)
        # a single long bounce after a long close: the re-close sees contactor_bounce's gap
        long = Feeder(contactor_bounce_ms=200.0, bounce_counts=(1,), bounce_open_fracs=(0.5,))
        tr = long.contactor_bounce_train(p.bus_idle_a, 1, 0.5)
        rp = p.precharge_ohm + d["r_ohm"]
        want = p.bus_idle_a * rp * (1 - math.exp(-0.1 / (rp * d["c_f"])))
        self.assertAlmostEqual(tr["makes"][1]["gap_v"], want, delta=0.01)

    @staticmethod
    def _reference_bounce_train(p, load_a, n, open_frac):
        """`contactor_bounce_train` as it was before the settle phase could stop early (perf note 2026-11-15): every
        phase stepped to its end, the same float operations in the same order."""
        d = p.contactor_inrush()
        r, l, c = d["r_ohm"], d["l_h"], d["c_f"]
        vp = p.battery_v_max
        rp = p.precharge_ohm + r if p.precharge_ohm > 0 else math.inf
        v = vp - (d["precharge"]["residual_v"] if d["precharge"] else vp)
        i, win = 0.0, p.contactor_bounce_ms / 1e3
        t_open, t_shut = open_frac * win / n, (1 - open_frac) * win / n
        settle = 20 * max(r * c, math.sqrt(l * c))
        h0 = min(math.sqrt(l * c), r * c, l / r) / 60
        pre = (lambda vx: (vp - vx) / rp) if rp != math.inf else (lambda vx: 0.0)
        makes, breaks, arc_j = [], [], 0.0
        for k in range(n + 1):
            dur = t_shut if k < n else settle
            steps = max(int(math.ceil(dur / h0)), 1)
            h, peak, gap = dur / steps, 0.0, vp - v
            for _ in range(steps):
                a1, b1 = (i + pre(v) - load_a) / c, (vp - r * i - v) / l
                vv, ii = v + a1 * h / 2, i + b1 * h / 2
                a2, b2 = (ii + pre(vv) - load_a) / c, (vp - r * ii - vv) / l
                vv, ii = v + a2 * h / 2, i + b2 * h / 2
                a3, b3 = (ii + pre(vv) - load_a) / c, (vp - r * ii - vv) / l
                vv, ii = v + a3 * h, i + b3 * h
                a4, b4 = (ii + pre(vv) - load_a) / c, (vp - r * ii - vv) / l
                v += (a1 + 2 * a2 + 2 * a3 + a4) * h / 6
                i += (b1 + 2 * b2 + 2 * b3 + b4) * h / 6
                peak = max(peak, i)
            makes.append({"gap_v": gap, "peak_a": peak})
            if k == n:
                break
            breaks.append(i)
            arc_j += 0.5 * l * i * i
            i = 0.0
            if rp == math.inf:
                v = max(v - load_a * t_open / c, 0.0)
            else:
                floor = vp - load_a * rp
                v = floor + (v - floor) * math.exp(-t_open / (rp * c))
        return {"n": n, "open_frac": open_frac, "makes": makes, "breaks_a": breaks, "arc_j": arc_j,
                "peak_a": max(m["peak_a"] for m in makes), "max_gap_v": max(m["gap_v"] for m in makes),
                "break_a": max(breaks) if breaks else 0.0}

    def test_settle_stops_early_with_the_same_bits(self):
        # 2026-11-15: the settle phase stops once the energy norm proves the current cannot reach its peak again.
        # The result must be the reference's to the last bit, with and without the precharge resistor, idle and
        # with the stepper's load, a long and a short bounce window.
        from otr_cad.params import _settle_contracts
        p = Feeder()
        d = p.contactor_inrush()
        r, l, c = d["r_ohm"], d["l_h"], d["c_f"]
        h = min(math.sqrt(l * c), r * c, l / r) / 60
        self.assertTrue(_settle_contracts(r, l, c, 1 / (p.precharge_ohm + r), h))   # the fast path is taken
        self.assertTrue(_settle_contracts(r, l, c, 0.0, h))
        self.assertFalse(_settle_contracts(r, l, c, 0.0, 400 * h))                   # a step too long to contract
        for q in (p, Feeder(precharge_ohm=0.0), Feeder(contactor_bounce_ms=2.0, bus_idle_a=4.0)):
            for load in (q.bus_idle_a, q.bus_idle_a + 6.0):
                for n, f in ((1, 1.0), (1, 0.2), (3, 0.5), (10, 0.8)):
                    self.assertEqual(repr(q.contactor_bounce_train(load, n, f)),
                                     repr(self._reference_bounce_train(q, load, n, f)), (q.precharge_ohm, load, n, f))

    def test_cached_bounce_trains_match_the_reference_and_stay_private(self):
        # 2026-11-18: trains are cached by the exact numbers they read. A hit must be the reference's bits, a caller
        # that edits its copy must not change the next caller's, and a Feeder differing only in a field the train
        # never reads must reuse the cache with the same answer.
        from otr_cad import params
        p = Feeder()
        params._BOUNCE_TRAINS.clear()
        ref = repr(self._reference_bounce_train(p, p.bus_idle_a, 3, 0.5))
        first = p.contactor_bounce_train(p.bus_idle_a, 3, 0.5)
        self.assertEqual(len(params._BOUNCE_TRAINS), 1)
        first["makes"][0]["peak_a"] = -1.0
        first["breaks_a"].append(99.0)
        self.assertEqual(repr(p.contactor_bounce_train(p.bus_idle_a, 3, 0.5)), ref)
        q = Feeder(stepper_enable_after_ms=p.stepper_enable_after_ms + 7)
        self.assertEqual(repr(q.contactor_bounce_train(p.bus_idle_a, 3, 0.5)), ref)
        self.assertEqual(len(params._BOUNCE_TRAINS), 1)
        # a field the train does read is a new entry with its own answer
        w = Feeder(contactor_bounce_ms=p.contactor_bounce_ms * 2)
        self.assertEqual(repr(w.contactor_bounce_train(p.bus_idle_a, 3, 0.5)),
                         repr(self._reference_bounce_train(w, p.bus_idle_a, 3, 0.5)))
        self.assertEqual(len(params._BOUNCE_TRAINS), 2)
        # contactor_bounces, which reads contactor_inrush once for all its trains, gives the reference's trains
        for run in p.contactor_bounces()["idle"]["runs"][:4]:
            self.assertEqual(repr(run), repr(self._reference_bounce_train(p, p.bus_idle_a, run["n"], run["open_frac"])))

    def test_several_bounces_never_make_more_than_the_first_closing(self):
        p = Feeder()
        b = p.contactor_bounces()
        first = p.contactor_bounce_train(p.bus_idle_a, 1, 1.0)["makes"][-1]["peak_a"]
        for run in b["idle"]["runs"]:
            for m in run["makes"][1:]:
                self.assertLessEqual(m["gap_v"], p.contactor_inrush()["precharge"]["residual_v"] + 1e-6)
        for case in b.values():
            self.assertLess(case["worst"]["peak_a"], p.contactor_make_a)
        # with the driver enabled its load drags the bus further while a bounce is open, and a touch too short to have
        # charged the bus leaves the open starting from the precharge's gap: worse than contactor_bounce's one bounce
        # after a full charge (24.9 A at the defaults), still under the make limit
        single = p.contactor_bounce()["stepper enabled"]["peak_a"]
        self.assertGreater(b["stepper enabled"]["worst"]["peak_a"], single + 5)
        self.assertGreater(b["stepper enabled"]["worst"]["max_gap_v"], p.contactor_bounce()["stepper enabled"]["gap_v"])
        self.assertAlmostEqual(b["idle"]["worst"]["peak_a"], first, delta=0.5)
        self.assertEqual(b["idle"]["makes_max"], max(p.bounce_counts) + 1)
        self.assertEqual(p.check_inrush(), [])
        # with no precharge every make of the train is a full inrush: the check names it
        bad = Feeder(precharge_ohm=0.0).check_inrush()
        self.assertTrue(any("bounces" in r for r in bad), bad)


class PotPickupParamsTest(unittest.TestCase):
    """The elevation pot's pickup from the motor pair's PWM (2026-11-14, `elev_pot_pickup`, `check_elev_pot`)."""

    def test_defaults_pass_and_the_cable_check_runs_it(self):
        import inspect
        p = Feeder()
        self.assertEqual(p.check_elev_pot(), [])
        self.assertIn("self.check_elev_pot()", inspect.getsource(Feeder))
        d = p.elev_pot_pickup()
        self.assertAlmostEqual(d["run_m"], p.elev_lead_design()["run_m"])
        self.assertAlmostEqual(d["step_v"], p.battery_v_max * d["cm_pf"] / (d["c_nf"] * 1e3 + d["cm_pf"]), places=9)
        self.assertLess(d["err_mm"], 0.1)
        self.assertEqual(d["bad_read_frac"], 0.0)

    def test_the_closed_form_matches_stepping_the_node(self):
        p = Feeder()
        for nf in (0.0, 100.0, 1000.0):
            n = p._elev_pot_node(nf)
            for duty in (0.4, 0.7):
                # step the RC node edge by edge for many periods from zero error
                e, steps = 0.0, 400
                dt = n["period"] / steps
                trace = []
                for k in range(steps * 400):
                    ph = (k % steps) / steps
                    if k % steps == 0:
                        e += n["a"]
                    if k % steps == round(duty * steps):
                        e -= n["a"]
                    if k >= steps * 399:
                        trace.append((ph, e))
                    e *= math.exp(-dt / n["tau"])
                for ph, v in trace[::37]:
                    self.assertAlmostEqual(p.elev_pot_error_v(duty, ph, filter_nf=nf), v, delta=1e-6 + 1e-4 * n["a"])
                # the mean over a period is zero: many readings at random phase average to the true position
                self.assertLess(abs(sum(v for _, v in trace) / len(trace)), 0.01 * n["a"] + 1e-6)

    def test_rules_catch_a_small_or_missing_filter_and_a_slow_one(self):
        bad = Feeder(elev_pot_filter_nf=100.0).check_elev_pot()     # ESP-IDF's example bypass capacitor
        self.assertTrue(any("deadband" in r for r in bad), bad)
        self.assertTrue(any("stall check" in r for r in bad), bad)
        none = Feeder(elev_pot_filter_nf=0.0)
        self.assertTrue(none.elev_pot_pickup()["clips_rail"])
        self.assertGreater(none.elev_pot_pickup()["bad_read_frac"], 0.05)
        self.assertTrue(any("lags" in r for r in Feeder(elev_pot_filter_nf=10000.0).check_elev_pot()))
        # the chosen 1 uF holds over the assumptions' spread
        for r in (2500.0, 20000.0):
            for pf in (10.0, 60.0):
                self.assertEqual(Feeder(elev_pot_ohm=r, elev_lead_mutual_pf_m=pf).check_elev_pot(), [], (r, pf))
        # at the default assumptions 220 nF to 2.3 uF passes: 1 uF sits inside with room for the pot and the bundle
        self.assertTrue(Feeder(elev_pot_filter_nf=200.0).check_elev_pot())
        self.assertEqual(Feeder(elev_pot_filter_nf=220.0).check_elev_pot(), [])
        self.assertEqual(Feeder(elev_pot_filter_nf=2200.0).check_elev_pot(), [])
        self.assertTrue(Feeder(elev_pot_filter_nf=2400.0).check_elev_pot())


class InrushTest(unittest.TestCase):
    """Contactor inrush and precharge (2026-11-14): the closed-form R-L-C against brute force, and the checks."""

    @staticmethod
    def _brute(v, r, l, c, t_end, n=40000):
        """RK4 on L di/dt = V - R i - q / C, dq/dt = i. Returns (peak current, its time, integral of i^2 dt)."""
        dt = t_end / n
        i = q = 0.0
        best, t_best, i2t = 0.0, 0.0, 0.0

        def f(i, q):
            return (v - r * i - q / c) / l, i
        for k in range(n):
            a1, b1 = f(i, q)
            a2, b2 = f(i + dt / 2 * a1, q + dt / 2 * b1)
            a3, b3 = f(i + dt / 2 * a2, q + dt / 2 * b2)
            a4, b4 = f(i + dt * a3, q + dt * b3)
            i_new = i + dt / 6 * (a1 + 2 * a2 + 2 * a3 + a4)
            q += dt / 6 * (b1 + 2 * b2 + 2 * b3 + b4)
            i2t += dt * (i * i + i_new * i_new) / 2
            i = i_new
            if i > best:
                best, t_best = i, (k + 1) * dt
        return best, t_best, i2t

    def test_closed_form_matches_brute_force_in_every_damping(self):
        v, l, c = 29.2, 0.68e-6, 2.3e-3
        crit = 2 * math.sqrt(l / c)
        for r in (0.3 * crit, crit, 3 * crit):
            i, tp, ip = rlc_step(v, r, l, c)
            peak, t_peak, i2t = self._brute(v, r, l, c, t_end=max(12 * r * c, 60 * math.sqrt(l * c)))
            self.assertAlmostEqual(ip, peak, delta=1e-3 * peak, msg=r)
            self.assertAlmostEqual(tp, t_peak, delta=0.02 * tp, msg=r)
            self.assertAlmostEqual(c * v * v / (2 * r), i2t, delta=0.01 * i2t, msg=r)   # the fuse's I^2 t, any damping

    def test_time_above_a_level(self):
        i, tp, ip = rlc_step(29.2, 0.064, 0.68e-6, 2.3e-3)
        dt, n = 5e-8, 0
        t = 0.0
        while t < 2e-3:
            n += i(t) > 150.0
            t += dt
        self.assertAlmostEqual(time_above(i, tp, 150.0, 2e-3), n * dt, delta=1e-7)
        self.assertEqual(time_above(i, tp, ip + 1, 2e-3), 0.0)

    def test_defaults_pass_and_a_direct_close_does_not(self):
        p = Feeder()
        self.assertEqual(p.check_inrush(), [])
        d = p.contactor_inrush()
        # a direct close is many times the contactor's rating, and limited only by the loop's resistance
        self.assertGreater(d["direct"]["peak_a"], 10 * p.contactor_make_a / 2)
        self.assertLess(d["direct"]["peak_a"], p.battery_v_max / d["r_ohm"])
        self.assertGreater(d["damping"], 1.0)
        pre = d["precharge"]
        self.assertAlmostEqual(pre["peak_a"], p.battery_v_max / (p.precharge_ohm + d["r_ohm"]))
        self.assertLess(d["closing"]["peak_a"], p.contactor_make_a)
        # the residual is the idle loads' drop across the resistor once the delay is many time constants
        self.assertGreater(p.precharge_delay_s, 20 * pre["tau_ms"] / 1e3)
        self.assertAlmostEqual(pre["residual_v"], p.bus_idle_a * (p.precharge_ohm + d["r_ohm"]), places=6)
        self.assertAlmostEqual(d["esc_branch_i2t"], d["direct"]["i2t"] / 4)
        self.assertTrue(any("contactor makes" in r and "add the precharge" in r for r in Feeder(precharge_ohm=0).check_inrush()))
        import inspect
        self.assertIn("self.check_inrush()", inspect.getsource(Feeder.check))   # the build runs it (check() is slow)

    def test_rules_catch_bad_changes(self):
        cases = [
            ({"precharge_ohm": 0.0}, "contactor makes"),
            ({"precharge_ohm": 0.0, "esc_cap_uf": 2000.0}, "short-circuit trip for"),
            ({"precharge_delay_s": 0.02}, "lengthen precharge_delay_s"),
            ({"bus_idle_a": 3.0}, "contactor makes"),
            ({"precharge_ohm": 2.0}, "precharge relay makes"),
        ]
        for kw, msg in cases:
            bad = Feeder(**kw).check_inrush()
            self.assertTrue(any(msg in r for r in bad), (kw, bad))


class PrechargeStartupTest(unittest.TestCase):
    """Start-up loads during the precharge (2026-11-14): the stepped bus against closed forms, and the firmware's
    servo gate."""

    def test_no_start_up_loads_is_the_closed_form(self):
        p = Feeder(stepper_holds_at_power_up=False)
        d = p.contactor_inrush()
        for delay in (0.005, 0.02, 0.5):
            q = Feeder(stepper_holds_at_power_up=False, precharge_delay_s=delay)
            b = q.precharge_bus(q.battery_v_max)
            held = q.bus_idle_a * (q.precharge_ohm + d["r_ohm"])
            want = held + (q.battery_v_max - held) * math.exp(-delay / ((q.precharge_ohm + d["r_ohm"]) * d["c_f"]))
            self.assertAlmostEqual(b["gap_v"], want, delta=1e-4 * q.battery_v_max, msg=delay)

    def test_a_constant_power_load_settles_on_the_quadratic_root(self):
        # V (Vp - V) / R - idle V = P, the upper root, once the delay is long
        for vp in (24.0, 29.2):
            p = Feeder(precharge_delay_s=2.0, stepper_holds_at_power_up=True)
            b = p.precharge_bus(vp)
            rp = p.precharge_ohm + p.contactor_inrush()["r_ohm"]
            w = b["loads"][0]["w"]
            a, bb = 1 / rp, -(vp / rp - p.bus_idle_a)
            v = (-bb + math.sqrt(bb * bb - 4 * a * w)) / (2 * a)
            self.assertAlmostEqual(b["bus_v"], v, delta=1e-3, msg=vp)
            self.assertLess(w, b["max_w"])

    def test_the_old_servo_gate_fails_and_the_new_one_passes(self):
        old = Feeder(servo_pulse_at_rest=True, stepper_holds_at_power_up=True)   # the firmware and wiring before 2026-11-14
        bad = old.check_inrush()
        self.assertTrue(any("bus held" in r and "shuttle servo seeking home" in r for r in bad), bad)
        low = old.contactor_inrush()["startup"]["low"]
        # at the low end the servo and stepper ask more than the resistor can pass: the bus chatters at their threshold
        self.assertGreater(sum(x["w"] for x in low["loads"]), low["max_w"] - old.bus_idle_a * old.battery_v_min)
        self.assertGreater(low["loads"][0]["starts"], 10)
        self.assertGreater(low["close"]["peak_a"], 3 * old.contactor_make_a)
        self.assertEqual(Feeder().check_inrush(), [])
        new = Feeder(stepper_holds_at_power_up=True)   # the servo gate alone, ENABLE still tied to GND
        self.assertEqual(new.check_inrush(), [])
        d = new.contactor_inrush()
        plain = Feeder().contactor_inrush()["closing"]["peak_a"]
        # the stepper's holding current alone doubles what the contactor makes, still under its assumed limit
        self.assertGreater(d["closing"]["peak_a"], 2 * plain)
        self.assertLess(d["closing"]["peak_a"], new.contactor_make_a)

    def test_enable_held_off_is_the_closed_form(self):
        # with the driver held off nothing starts during the precharge: the closing is the idle-load closed form
        p = Feeder()
        d = p.contactor_inrush()
        self.assertEqual(p.startup_loads(p.battery_v_min), [])
        self.assertAlmostEqual(d["closing"]["peak_a"], d["precharge"]["close"]["peak_a"], places=9)

    def test_the_20_mohm_pack_cases_pass_once_enable_is_wired(self):
        for kw in ({"pack_ohm": 0.02, "esc_cap_uf": 470.0, "loop_uh_per_m": 1.0},
                   {"pack_ohm": 0.02, "esc_cap_uf": 2000.0, "loop_uh_per_m": 0.3}):
            tied = Feeder(stepper_holds_at_power_up=True, **kw)
            gated = Feeder(**kw)
            self.assertGreater(tied.contactor_inrush()["closing"]["peak_a"],
                               gated.contactor_inrush()["closing"]["peak_a"], kw)
            self.assertEqual(gated.check_inrush(), [], kw)

    def test_bounce_gap_is_the_precharge_relaxation(self):
        p = Feeder()
        b = p.contactor_bounce()
        d = p.contactor_inrush()
        rp = p.precharge_ohm + d["r_ohm"]
        want = p.bus_idle_a * rp * (1 - math.exp(-p.contactor_bounce_ms / 1e3 / (rp * d["c_f"])))
        self.assertAlmostEqual(b["idle"]["gap_v"], want, places=9)
        # a bounce far longer than the time constant leaves the full I x R gap, the precharge's own residual
        long = Feeder(contactor_bounce_ms=1000.0).contactor_bounce()
        self.assertAlmostEqual(long["idle"]["gap_v"], d["precharge"]["residual_v"], delta=1e-6)
        self.assertGreater(b["stepper enabled"]["peak_a"], b["idle"]["peak_a"])
        self.assertLess(b["stepper enabled"]["peak_a"], p.contactor_make_a)

    def test_enable_delay_shorter_than_pull_in_and_bounce_fails(self):
        bad = Feeder(stepper_enable_after_ms=40.0).check_inrush()
        self.assertTrue(any("CONTACTOR_SETTLE_MS" in r for r in bad), bad)
        self.assertEqual(Feeder(stepper_enable_after_ms=60.0).check_inrush(), [])
        bad = Feeder(contactor_bounce_ms=200.0, stepper_enable_after_ms=300.0, bus_idle_a=3.0).check_inrush()
        self.assertTrue(any("bounce" in r for r in bad), bad)

    def test_firmware_holds_the_driver_off_until_the_contactor(self):
        fw = Path(__file__).resolve().parents[2] / "firmware" / "esp32"
        src = (fw / "main.py").read_text()
        self.assertIn("Pin(AZ_EN_PIN, Pin.OUT, value=1)", src)
        self.assertIn("if not self.power.enabled:", src)
        cfg = (fw / "config.py").read_text()
        self.assertIn(f"CONTACTOR_SETTLE_MS = {Feeder.stepper_enable_after_ms:g}", cfg)

    def test_firmware_gives_the_servo_no_pulse_before_a_feed(self):
        src = (Path(__file__).resolve().parents[2] / "firmware" / "esp32" / "main.py").read_text()
        self.assertNotIn("hold the shuttle retracted (also from power-up)", src)
        self.assertIn("self.gate.pwm.duty_u16(0)", src)
        self.assertFalse(Feeder.servo_pulse_at_rest)


@unittest.skipUnless(HAVE_CAD, "build123d not installed")
class PowerBomTest(unittest.TestCase):
    def test_bom_fuse_list_is_the_model_s(self):
        from collections import Counter
        from otr_cad.feeder import COTS_EXTRA
        row = next(name for name, _, _ in COTS_EXTRA if name.startswith("ATO blade fuses: "))
        listed = Counter()
        for item in row.split(": ", 1)[1].split(", "):
            amps, _, rest = item.partition(" A")
            listed[float(amps)] += int(rest.strip(" x") or 1)
        self.assertEqual(listed, Counter(b["fuse_a"] for b in Feeder().power_distribution()["branches"]))


class EstopResetTest(unittest.TestCase):
    """Reset at the machine (2026-11-18, `estop_reset_chain`, `check_estop_reset`; quality audit 2026-11-08)."""

    def test_defaults_pass_and_the_build_runs_the_check(self):
        import inspect
        self.assertEqual(Feeder().check_estop_reset(), [])
        self.assertIn("self.check_estop_reset()", inspect.getsource(Feeder.check))

    def test_release_never_powers_the_bus_and_reset_does(self):
        p = Feeder()
        d = p.precharge_delay_s
        r = p.estop_reset()
        self.assertEqual(r["power_up"]["spans"], [])
        self.assertEqual(r["reset_held"]["spans"], [])                 # held: nothing until it is let go
        self.assertEqual(r["reset"]["spans"], [(round(1.3 + d, 3), None)])
        for k in ("estop_released", "fob_restored", "reset_taped_down"):
            self.assertEqual(r[k]["spans"], [(round(1.3 + d, 3), 4.0)], k)
        self.assertEqual(r["reset_after_release"]["spans"][-1], (round(8.2 + d, 3), None))
        self.assertEqual(r["reset_while_running"]["spans"][0][1], 4.0)  # pressing RESET while running drops the bus
        # RESET pressed while the e-stop is still down sets nothing: the release afterwards stays dark
        held = p.estop_reset_chain([(1.0, "estop", True), (2.0, "reset", True), (2.2, "reset", False),
                                    (3.0, "estop", False)], 10.0)
        self.assertEqual(held["spans"], [])

    def test_the_old_wiring_and_a_welded_contact_re_power_on_release(self):
        old = Feeder(estop_reset_latch=False)
        r = old.estop_reset_chain([(4.0, "estop", True), (5.0, "estop", False)], 10.0)
        self.assertEqual(r["spans"][-1], (5.0 + old.precharge_delay_s, None))
        self.assertTrue(old.check_estop_reset())
        w = Feeder().estop_reset()["no_welded"]["spans"]
        self.assertEqual(w[-1][1], None)                                 # the one fault that defeats the latch

    def test_contact_ratings_are_checked(self):
        self.assertTrue(any("RESET's NC" in b for b in Feeder(reset_button_dc_a=0.2).check_estop_reset()))
        self.assertTrue(any("K0" in b for b in Feeder(latch_relay_a=0.1).check_estop_reset()))

    @unittest.skipUnless(HAVE_CAD, "build123d not installed")   # otr_cad.feeder imports build123d
    def test_bom_lists_the_latch_and_the_button(self):
        from otr_cad.feeder import COTS_EXTRA
        names = [n for n, _, _ in COTS_EXTRA]
        self.assertTrue(any("RESET" in n and "1 NO + 1 NC" in n for n in names), names)
        self.assertTrue(any("reset latch K0" in use for _, _, use in COTS_EXTRA))


class DeckCableParamsTest(unittest.TestCase):
    """The deck-side cable run (2026-11-14): routing, ties and lead losses on the routed lengths."""

    def test_defaults_pass_and_the_route_adds_up(self):
        p = Feeder()
        self.assertEqual(p.check_deck_cables(), [])
        d = p.deck_cable_route()
        # every run's rounded length is its corner-to-corner length less what each corner's arc saves
        for run in ("main", "stepper", "lift"):
            pts = p.deck_cable_paths()[run]
            sharp = sum(math.dist(a, b) for a, b in zip(pts, pts[1:]))
            self.assertLess(d["len_mm"][run], sharp)
            self.assertGreater(d["len_mm"][run], sharp - 4 * (2 - math.pi / 2) * d["bend_r"][run] - 1e-6)
        # the drawn path is continuous and ends in the clamp's bore, vertical, on the axis
        m = d["main"]
        self.assertLess(max(math.dist(a, b) for a, b in zip(m, m[1:])), 400.0)
        self.assertAlmostEqual(m[-1][0], p.head_x)
        self.assertAlmostEqual(m[-1][1], 0.0)
        self.assertAlmostEqual(m[-2][0], p.head_x, places=6)
        self.assertGreaterEqual(d["straight_min_mm"], 0.0)
        # the run lies on the saddles' base against the post's inner face
        self.assertAlmostEqual(p.deck_cable_y + d["od_mm"]["deck"] / 2 + p.deck_saddle_base, p.post_half_y - p.rail_w)
        self.assertGreater(d["od_mm"]["deck"], d["od_mm"]["post"])
        self.assertGreater(d["od_mm"]["post"], d["od_mm"]["axis"])
        # the servo's supply now runs along this route (it was a straight deck-to-axis estimate)
        self.assertAlmostEqual(p.servo_supply(0.8, 376.0)["run_m"] * 1000,
                               d["to_clamp_mm"] + p.cable_twist()["run_mm"] + 376.0
                               + abs(p.cable_clip_x - p.crank_x) + abs(p.cable_clip_z - p.shuttle_zc) + p.servo_top_y, places=6)

    def test_lead_losses_follow_the_wire_table(self):
        p = Feeder()
        e = p.deck_cable_electrics()
        for awg, row in e["awg"].items():
            ohm = AWG_OHM_PER_M[awg]
            self.assertAlmostEqual(row["stepper_frac"], 2 * e["stepper_m"] * ohm / p.stepper_coil_ohm)
            self.assertAlmostEqual(row["lift_drop_v"], p.lift_motor_stall_a * 2 * e["lift_m"] * ohm)
            self.assertAlmostEqual(row["phase_mohm"], e["phase_m"] * ohm * 1000)
        # the chosen gauges pass and the next thinner standard ones do not, for the stepper (26) and the phases (16)
        self.assertLessEqual(e["stepper"]["stepper_frac"], p.stepper_lead_frac)
        self.assertGreater(e["awg"][26]["stepper_frac"], p.stepper_lead_frac)
        self.assertLessEqual(e["phase"]["phase_frac"], p.esc_phase_loss_frac)
        self.assertGreater(e["awg"][16]["phase_frac"], p.esc_phase_loss_frac)
        self.assertLessEqual(e["lift"]["lift_frac"], p.lift_drop_frac)
        self.assertGreater(e["awg"][24]["lift_frac"], p.lift_drop_frac)
        self.assertGreater(e["phase_m"], p.deck_cable_route()["to_clamp_mm"] / 1000)

    def test_rules_catch_bad_changes(self):
        cases = [
            ({"deck_cable_bend_r": 15.0}, "bends at 15 mm"),
            ({"deck_cable_z_low": 395.0}, "cannot turn up into the axis clamp"),
            ({"deck_tie_max_mm": 50.0}, "ties are up to"),
            ({"stepper_wires": (("azimuth stepper coils", 4, 26),)}, "stepper lead (26 AWG"),
            ({"lift_wires": (("lift gearmotor", 2, 24),)}, "lift lead (24 AWG"),
            ({"head_wires": (("launcher motor phases", 6, 16), ("wheel tachometers", 6, 26),
                             ("shuttle servo signal", 1, 26), ("shuttle servo supply and return", 2, 20))},
             "launcher phase extension (16 AWG"),
        ]
        for kw, msg in cases:
            bad = Feeder(**kw).check_deck_cables()
            self.assertTrue(any(msg in r for r in bad), (kw, bad))
        self.assertTrue(any("deck cable" in r for r in Feeder(deck_cable_bend_r=15.0).check()))

    def test_ties_hold_every_stretch(self):
        p = Feeder()
        t = p.deck_cable_ties()
        seq = [q for k in ("deck", "post", "crossbar", "arm") for q in t[k]] + [(p.head_x, 0.0, p.cable_clamp_z)]
        self.assertLessEqual(max(math.dist(a, b) for a, b in zip(seq, seq[1:])), p.deck_tie_max_mm)
        # deck ties lie on the deck run, post ties on the post's face, hangers under the crossbar and the clamp arm
        dz = p.deck_cable_route()["deck_z"]
        for x, y, z in t["deck"]:
            self.assertAlmostEqual(y, p.deck_cable_y)
            self.assertGreater(z, dz)
        for x, y, z in t["crossbar"] + t["arm"]:
            self.assertAlmostEqual(z, p.deck_cable_z_low)


@unittest.skipUnless(HAVE_CAD, "build123d not installed")
class DeckCableCadTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from otr_cad import feeder as F
        cls.F = F
        cls.p = Feeder()
        cls.parts = F.all_parts(cls.p)

    def _solids(self, name):
        return next(x for x in self.parts if x.name == name).placed()

    def test_runs_clear_every_part_and_the_head_at_the_actuator_limits(self):
        # the build's sweeps walk -15..+45 deg; a runaway or a hand can take the head to the actuator's own limits,
        # where its rear dips lowest, and turn it to the hard stops' reach
        from otr_cad.package import clashes, cross_clashes
        p = self.p
        mine = [(f"{n}[{i}]", s) for n in ("deck_cable_main", "deck_cable_stepper", "deck_cable_lift", "deck_cable_saddle",
                                           "deck_cable_hanger", "stepper_driver_carrier")
                for i, s in enumerate(self._solids(n))]
        ext, ret = p.elev_act_limits()
        own = clashes(mine)
        for elev in (ext, ret):
            for az in (-p.az_reach_deg, p.az_reach_deg):
                moving, _ = self.F.turned_solids(p, elev, az)
                both = clashes(moving)   # clashes(moving + mine) split as in the lift test above: same pass/fail
                self.assertEqual(both + cross_clashes(moving, mine) + own, own + both, (elev, az))
        self.assertEqual(own, [])

    def test_saddles_and_carrier_land_on_their_holes(self):
        p = self.p
        deck = next(x for x in self.parts if x.name == "base_deck")
        circles = {(round(e.arc_center.X, 2), round(e.arc_center.Y, 2))
                   for e in deck.flat.edges() if e.geom_type == GeomType.CIRCLE}
        for x, y in self.F.deck_cable_saddle_holes(p):
            self.assertIn((round(x, 2), round(y, 2)), circles)
        cx, cy = self.F.CARRIER_XY
        for hx, hy in self.F.CARRIER_HOLES:
            self.assertIn((round(cx + hx, 2), round(cy + hy, 2)), circles)

    def test_the_route_misses_a_shifted_run(self):
        # the check can fail: the main run moved 40 mm toward the battery passes through it
        from build123d import Location
        from otr_cad.package import clashes
        run = self._solids("deck_cable_main")[0].moved(Location((0, -40, 0)))
        battery = self._solids("battery")[0]
        self.assertNotEqual(clashes([("run", run), ("battery", battery)]), [])


if __name__ == "__main__":
    unittest.main()
