"""The assembly guides, generated from the same model as the parts.

`python -m otr_cad collector` (and `feeder`) writes `guide/ASSEMBLY.md` and one drawing per step (`guide/step_NN.svg`): the parts a
step adds in black over the machine built so far in grey. The guide is checked as it is made, so it cannot drift from
the package:

* every placed part goes on in exactly one step, and every BOM line that is not a made part is used up by the steps,
  to the unit (`tally`);
* each part a step adds touches something already built (or the step says it starts a sub-assembly), so the order
  can be followed (`order_problems`);
* every bolted joint's length is checked against the stack the CAD puts under it: nyloc nuts get their full height
  and two threads proud, heat-set inserts their full length and no bottoming out, shoulder bolts a free fit
  (`joint_checks`);
* the emptying hatch comes off a hung drum: out of its seat and up along its slot past the axle spacer, with nothing
  in the way (`hatch_check`).

The first build of these checks (2026-11-20) found the package as committed could not be put together as drawn:
see cad/README.md, "Assembly guide". The feeder's steps and joints are in `feeder_guide.py` (2026-11-20, second
build); `steps(p)` and `joints(p)` hand out the robot's own, and the checks below are shared. Two more rules came
with the feeder: a screw into a T-nut must catch the nut and stop short of the slot's floor, and a screw's head must
go in along its axis (`access_problems`: a counterbore closed at the far end cannot take a screw).

The nut side of every through-bolt (2026-11-21, `spanner_checks`): a ring spanner and the hand holding it, laid on
the nut and turned about the bolt's axis 5 degrees at a time against what is on the work when the step comes. Each
nut must take a spanner at some angle (to hold it while the head turns), and a hex head that is itself turned with a
spanner must swing 30 degrees (a 12-point ring's step) at its head or at its nut.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from build123d import Box, Compound, Cylinder, ExportSVG, Location

from . import collector as C
from .params import Collector, Feeder

NYLOC_H = {3: 4.0, 4: 5.0, 5: 5.0, 6: 6.0, 8: 8.0}  # DIN 985 nut heights, mm
PITCH = {3: 0.5, 4: 0.7, 5: 0.8, 6: 1.0, 8: 1.25}
INSERT_LEN = 5.7                          # the BOM's short M4 insert
RIVET_FLANGE = 1.0                        # a standard M5 rivet nut's flange, which sits under the cover
TNUT = (4.0, 8.0)   # mm past an extrusion's face: catches an M5 slot-6 T-nut under its lip, short of the slot floor (assumed)
WASHER = {3: 0.5, 5: 1.0, 6: 1.6, 8: 1.6}  # ISO 7089 thickness, mm
HATCH_TURN = 90       # degrees about +y the drum turns for the hatch's slot to point down (hatch_check)
THUMB_GRIP_R = 10.0   # mm: a finger and thumb round a 12 mm knurled thumb-screw head (assumed)
NUT_AF = {3: 5.5, 4: 7.0, 5: 8.0, 6: 10.0, 8: 13.0}      # ISO 4032 / DIN 985 across flats: the spanner's size, mm
SPANNER_LEN = {3: 85.0, 4: 100.0, 5: 110.0, 6: 130.0, 8: 165.0}  # a combination spanner's length, mm (assumed, typical)
GRIP = 35.0          # mm of the shank's end the fingers cover (assumed)
HAND_W = 20.0        # mm the fingers add to the shank's width (assumed)
HAND_D = 25.0        # mm the fingers stand off the spanner's face, away from the work (assumed)
REACH_IN = 150.0     # mm of hand and wrist behind the grip, along the shank: the hand comes from outside (assumed)
SWING_DEG = 30       # degrees a 12-point ring spanner needs between grips (an open end flipped over: the same)
SPANNER_STEP = 5     # degrees between the spanner angles tried
DRUM_AXLE_SPANNER = 200.0   # mm: the 13 mm spanner on the drum axle's nut, inside the drum; a 165 mm one leaves the
#                             fingers between the rods, in a 7-degree window per gap (cad/README.md, 2026-11-21)


@dataclass
class Step:
    title: str
    parts: list[str] = field(default_factory=list)            # every placement of each named part, or "name[i]" for one
    fasteners: list[tuple[str, int]] = field(default_factory=list)
    tools: str = ""
    text: str = ""
    new_subassembly: bool = False                             # its first part need not touch what is built
    image: bool = True
    on_sub: bool = False                                      # drawn on the sub-assembly alone
    reach: float = 0.5                                        # mm a part may sit from what holds it (fits, shafts)
    loose: list[str] = field(default_factory=list)            # parts the step names as not yet mounted in the CAD


def steps(p) -> list[Step]:
    """The robot's steps: the collector's below, the feeder's in `feeder_guide`."""
    if isinstance(p, Feeder):
        from . import feeder_guide
        return feeder_guide.steps(p)
    return collector_steps(p)


def collector_steps(p: Collector) -> list[Step]:
    from .package import fasteners
    F = {name: qty for name, qty, _ in fasteners(p)}
    shoulder = next(n for n in F if "shoulder bolt" in n)
    return [
        Step("Prepare the printed parts and the drum discs", [], [
            ("M4 heat-set insert, 5.7 mm long", 26), ("M5 rivet nut (blind insert), aluminium", 12)],
            "soldering iron with an M4 insert tip, M5 rivet nut tool",
            f"Melt one M4 insert into each {p.insert_hole_d:g} mm pocket: 4 in the top face of each motor clamp "
            "cradle (where the cap meets it), 2 in the underside of each cradle, 2 in the underside of each pivot "
            "block, 2 in the underside of each yoke-lift switch tower, 4 in the underside of the mast socket's flange, and 2 in the "
            "underside of the caster adapter (the two pockets on its centre line). Press each one flush and square. Set an M5 "
            f"rivet nut in each of the six {p.rivet_nut_hole_d:g} mm holes of both drum discs, flange on the outer "
            f"face (the face away from the rods). A standard {RIVET_FLANGE:g} mm flange holds the cover that far off "
            "the disc; the arm gap allows for it.", image=False),
        Step("Lay out the base plate", ["base_plate"], [], "",
             "Deburr every hole. The plate's top face is the side the motors sit on; the strap slots are nearest "
             "the front (drum) end.", new_subassembly=True),
        Step("Mast socket, caster adapter and ball caster", ["mast_socket", "caster_adapter", "ball_caster"],
             [("M4 x 20 socket cap screw", 4), ("M4 x 10 socket cap screw", 2)], "3 mm hex key",
             "Stand the mast socket on the top face over the four rear holes, hold the caster adapter under the "
             "plate with its counterbores facing down, and drive the four M4 x 20 screws up through adapter and "
             "plate into the socket's inserts. Their heads sit in the counterbores, below the caster's seat. Then "
             "hold the caster's flange to the adapter and drive an M4 x 10 up through each of its two holes into "
             f"the adapter's inserts. The adapter is drawn for holes on {p.caster_hole_pitch:g} mm: measure your "
             "caster's, and if they differ set `caster_hole_pitch` (and `caster_flange`) and rebuild before printing."),
        Step("Drive motors", ["motor_clamp_cradle", "gearmotor", "motor_clamp_cap"],
             [("M4 x 12 socket cap screw", 4), ("M4 x 50 socket cap screw", 8)], "3 mm hex key",
             "Screw each cradle down with two M4 x 12 from under the plate. Lay a gearmotor in each cradle, output "
             f"shaft outward, its face {p.motor_face_inset:g} mm inside the plate's edge, and clamp it with a cap "
             "and four M4 x 50. Tighten the caps evenly until the motor cannot turn in the clamp; do not crush the "
             "gearbox. Route the motor and encoder leads toward the electronics tray."),
        Step("Wheels", ["wheel"], [], "hex key for the hub's grub screw",
             f"Push a hub and wheel onto each 6 mm D shaft, flat side to the grub screw, leaving {p.wheel_gap:g} mm "
             "between the wheel and the plate's edge.", reach=p.wheel_gap + p.motor_face_inset + 0.5),
        Step("Pivot blocks", ["pivot_block"], [("M4 x 12 socket cap screw", 4)], "3 mm hex key",
             "Screw both pivot blocks down from below with two M4 x 12 each, bores across the robot."),
        Step("Electronics tray on its standoffs", ["standoff", "electronics_tray", "pi_standoff"],
             [("M3 x 10 screw", 4), ("M3 x 8 screw", 4), ("M2.5 x 5 screw", 4)], "2.5 mm and 2 mm hex keys, 5 mm spanner",
             "On the bench first, while both faces of the tray can be reached: screw the Pi's four 6 mm standoffs "
             "to the top face over its M2.5 holes (the 49 x 58 mm pattern) with an M2.5 x 5 up through each, and "
             "tighten with a spanner on the hex. Then screw the four 30 mm standoffs on from under the plate with "
             "M3 x 10, and the tray onto them with M3 x 8. The e-stop hole is at the tray's front corner."),
        Step("Battery", ["battery"], [("25 mm hook-and-loop strap, 600 mm", 1), ("15 A blade fuse + holder", 1)],
             "", "Strap the pack down through the two slots in front of the motors. Put the fuse holder on the "
             "positive lead within 100 mm of the terminal, and leave the fuse out until the last step."),
        Step("Drum cage (a sub-assembly on the bench)", ["drum_disc", "drum_bearing", "drum_rod", "rod_clamp_ring"],
             [("M4 x 16 button head + nyloc nut", 12)], "arbor press or vice, 2.5 mm hex key, 7 mm spanner",
             f"Press a 608 bearing into each disc's bore, flush with the outer face (it stands 2 mm proud on the "
             f"rod side). Stand one disc outer face down, push the {p.n_rods} rods through, lower the second disc "
             f"over them, and check every rod end is flush with both outer faces: the rods set the "
             f"{p.drum_len:g} mm between the discs. Bolt a clamp ring over the rod ends on each side, six M4 x 16 "
             "button heads with nylocs inside the drum. Spin the cage on a rod through the bearings: it should run "
             "true to about 2 mm at the rim.", new_subassembly=True),
        Step("End covers", ["drum_cover", "drum_hatch"],
             [("M5 x 12 button head", 6), ("M5 thumb screw, 12 mm", 6)], "3 mm hex key",
             "Bolt the plain cover to one end with six M5 button heads into the rivet nuts. The slotted cover is "
             "the emptying hatch: fit it to the other end with the six thumb screws.", on_sub=True),
        Step("Hang the drum on the yoke", ["yoke_arm", "axle_spacer"],
             [(shoulder, 2), ("M8 x 30 hex bolt + M8 nyloc nut", 2)],
             f"4 mm hex key, two 10 mm and two 13 mm spanners (the one on the nut {DRUM_AXLE_SPANNER:g} mm or longer)",
             "Fit each arm to its pivot block with a shoulder bolt from outside and an M6 nyloc inside the block. "
             "Tighten it onto the shoulder: the arm must still swing freely. Stand the drum between the arms, put "
             "an axle spacer through each cover's centre hole onto the bearing's inner race, and bolt each arm "
             "end to it with an M8 x 30 from outside, nyloc on the inner race: hold it with "
             "the long spanner put in straight between two rods, so your fingers are outside the rods, and turn the "
             "head outside the arm. The "
             "drum should roll freely and the arms lift and drop on their own weight."),
        Step("Yoke-lift switches (the front bumper)", ["bump_switch_tower", "bump_switch", "bump_switch_lever"],
             [("M4 x 12 socket cap screw", 4), ("M4 washer (ISO 7089)", 4), ("M2 x 10 self-tapping screw (for plastic)", 4)],
             "3 mm hex key, small Phillips screwdriver, multimeter, a 10 mm block",
             f"On the bench (the wheel hides the screws once it is on), screw each switch to the outboard face of its "
             f"tower with two M2 self-tappers, roller toward the pivot and lever in the arm's plane. Stand each tower behind its pivot block, outboard face to the arm, and "
             f"fit two M4 x 12 with washers up through the base plate's slots, finger tight, tower in the middle of "
             f"its slots. With a meter on the switch, stand both drum discs on a {p.bump_lift_mm:g} mm block and slide "
             f"each tower along its slots until its switch just clicks closed; tighten. Off the block, both read open. "
             f"The lobe on each arm then holds its switch closed from {p.bump_lift_mm:g} mm of drum rise to the "
             f"yoke's stop, where the lobe lands on the plate."),
        Step("Mast and camera", ["mast_tube"], [("Wide-angle camera module + 1 m ribbon/USB", 1)], "",
             "Push the tube into the socket (an M4 grub screw if it rattles) and mount the camera at the top, "
             "looking forward and down over the drum."),
        Step("Electronics", ["raspberry_pi"], [("M2.5 x 4 screw", 4),
                                 ("ESP32 dev board (ESP32-WROOM-32)", 1), ("Dual DC motor driver, 10 A/ch, PWM+DIR", 1),
                                 ("5 V 5 A buck converter", 1), ("22 mm NC mushroom e-stop + 24 V contactor", 1),
                                 ("BNO085 (or similar) IMU", 1)],
             "screwdrivers, crimp tool, multimeter",
             "Screw the Pi onto its standoffs with four M2.5 x 4, nothing longer: the standoff is threaded right "
             "through and the screw from below fills its lower half. Mount the ESP32, motor driver, buck converter and IMU on the 10 mm M3 "
             "grid. Fit the e-stop in its hole and the contactor beside it. Wire to hardware/electronics.md (pin "
             "map, power budget, e-stop chain). Run each yoke-lift switch's common and normally-open tags to GND and "
             "GPIO 13 (left) or 14 (right): the switch closes when its arm lifts, which the firmware reads as the "
             "bumper.", image=False),
        Step("Before the first power-up", [], [], "multimeter",
             "With the fuse out: check the e-stop opens the contactor's coil circuit, and that there is no short "
             "from battery positive to the frame. Then fit the fuse with the wheels off the ground and the e-stop "
             "pressed, release it, and flash firmware/esp32. Read hardware/safety.md before the robot drives "
             "on its own.", image=False),
    ]


# ------------------------------------------------------------------------ checks

def _entries(names) -> list[tuple[str, int | None]]:
    """A step's part entries as (name, placement index or None for every placement)."""
    out = []
    for n in names:
        if n.endswith("]") and "[" in n:
            base, i = n[:-1].split("[")
            out.append((base, int(i)))
        else:
            out.append((n, None))
    return out


def tally(p, parts, bom_rows) -> list[str]:
    """Every placement of every placed part in exactly one step; every bought line the steps use up exactly."""
    bad = []
    by = {pt.name: pt for pt in parts}
    seen: dict[tuple[str, int], int] = {}
    named: dict[str, int] = {}
    for st in steps(p):
        for name, i in _entries(st.parts):
            named[name] = named.get(name, 0) + 1
            pt = by.get(name)
            idx = range(len(pt.placements)) if pt is not None and i is None else [i] if i is not None else []
            for k in idx:
                seen[(name, k)] = seen.get((name, k), 0) + 1
    placed = {pt.name for pt in parts if pt.placements}
    for name in sorted(placed | set(named)):
        pt = by.get(name)
        if pt is None or not pt.placements:
            if named.get(name, 0) != 1:
                bad.append(f"assembly guide: part {name} is fitted in {named.get(name, 0)} steps, not 1")
            continue
        counts = [seen.get((name, k), 0) for k in range(len(pt.placements))]
        if len(counts) == 1 or len(set(counts)) == 1:
            if counts[0] != 1:
                bad.append(f"assembly guide: part {name} is fitted in {counts[0]} steps, not 1")
        else:
            bad += [f"assembly guide: part {name}[{k}] is fitted in {c} steps, not 1" for k, c in enumerate(counts) if c != 1]
    used: dict[str, int] = {}
    for st in steps(p):
        for item, qty in st.fasteners:
            used[item] = used.get(item, 0) + qty
    loose = {r["item"]: r["qty"] for r in bom_rows if r["item"] not in placed and r["kind"] == "cots"}
    for item in sorted(set(loose) | set(used)):
        if loose.get(item) != used.get(item):
            bad.append(f"assembly guide: {item}: BOM {loose.get(item)}, steps use {used.get(item, 0)}")
    return bad


def _placed(parts, names):
    by = {pt.name: pt for pt in parts}
    out = []
    for name, i in _entries(names):
        if name in by:
            shapes = by[name].placed()
            out += [(name, s) for k, s in enumerate(shapes) if i is None or k == i]
    return out


def order_problems(p, parts) -> list[str]:
    """Each step's parts, with what is built, form one connected whole: nothing is left floating."""
    bad, built = [], []
    for k, st in enumerate(steps(p), 1):
        pending = _placed(parts, st.parts)
        held = [] if st.new_subassembly else list(built)
        if not held and pending:
            held.append(pending.pop(0)[1])
        grew = True
        while pending and grew:
            grew = False
            for item in list(pending):
                s = item[1]
                if any(_near(s, h, st.reach) and s.distance_to(h) <= st.reach for h in held):
                    held.append(s)
                    pending.remove(item)
                    grew = True
        bad += [f"assembly guide step {k}: {name} touches nothing fitted before it" for name, _ in pending
                if name not in st.loose]
        built += [s for _, s in _placed(parts, st.parts)]
    return bad


def _near(a, b, pad: float = 1.0) -> bool:
    A, B = a.bounding_box(), b.bounding_box()
    return (A.min.X - pad <= B.max.X and B.min.X - pad <= A.max.X and A.min.Y - pad <= B.max.Y
            and B.min.Y - pad <= A.max.Y and A.min.Z - pad <= B.max.Z and B.min.Z - pad <= A.max.Z)


AXIS_ROT = {"z": (0, 0, 0), "y": (-90, 0, 0), "x": (0, 90, 0)}   # each turns local z onto the world axis (+)


def frame_of(point, axis) -> Location:
    """The joint's frame: local z along the fastener's axis. `axis` is "x", "y" or "z" (the frame's origin is `point`
    with that coordinate zeroed, so local z reads the world coordinate) or a Location whose z is the axis."""
    if isinstance(axis, Location):
        return axis
    i = "xyz".index(axis)
    o = list(point)
    o[i] = 0.0
    return Location(tuple(o), AXIS_ROT[axis])


def _stack(parts, point, axis, start: float, sign: int, r_in: float, r_out: float, gaps: bool = False,
           gap: float = 0.05):
    """Parts a fastener's shank meets along `axis` from `start` (its head face) going `sign`, as contiguous
    (name, near face, far face) intervals measured from the head face; stops at the first gap over 0.05 mm (or, with
    `gaps`, runs on through gaps: a through-bolt across an open frame)."""
    if not isinstance(axis, Location) and axis in ("y", "z") and not gaps:
        rot = {"z": (0, 0, 0), "y": (90, 0, 0)}[axis]      # the collector's joints, measured as first built
        i = "xyz".index(axis)
        ring = Cylinder(r_out, 1400).moved(Location(point, rot)) - Cylinder(r_in, 1402).moved(Location(point, rot))
        back = None
    else:
        fr = frame_of(point, axis)
        ring = (Cylinder(r_out, 1400) - Cylinder(r_in, 1402)).moved(fr)
        back, i = fr.inverse(), 2
    hits = []
    for pt in parts:
        for s in pt.placed():
            if not _near(ring, s, 0.0):
                continue
            x = ring & s
            if not x or x.volume <= 1e-3:
                continue
            # each separate piece is its own interval: a part the axis crosses twice (the lift belt's envelope above
            # and below the drawn flight) does not fill the space between (added 2026-11-21)
            for piece in (x.solids() or [x]):
                if piece.volume <= 1e-3:
                    continue
                bb = (piece.moved(back) if back is not None else piece).bounding_box()
                lo, hi = (bb.min.X, bb.min.Y, bb.min.Z)[i], (bb.max.X, bb.max.Y, bb.max.Z)[i]
                a, b = sorted(((lo - start) * sign, (hi - start) * sign))
                if b > 0.01:
                    hits.append((pt.name, round(max(a, 0.0), 3), round(b, 3)))
    hits = sorted(set(hits), key=lambda h: (h[1], h[2], h[0]))     # a piece read twice is one interval
    if gaps:
        return hits
    chain, reach = [], 0.0
    for h in hits:
        if h[1] > reach + gap:
            break
        chain.append(h)
        reach = max(reach, h[2])
    return chain


@dataclass
class Joint:
    name: str
    fastener: str
    length: float            # under-head length (shoulder length for a shoulder bolt)
    d: int                   # thread diameter
    kind: str                # nut | insert | shoulder | clamp (a shoulder bolt clamped on `into`) | rivet | standoff | tnut | tapped
    point: tuple
    axis: object             # "x" | "y" | "z" or a Location whose z is the axis (see frame_of)
    start: float
    sign: int
    hole_r: float
    head_r: float
    into: str = ""           # insert / standoff / rivet / tnut / tapped joints: the part the thread is in
    room: float = 0.0        # insert joints: depth of pocket and pilot from the part's face; tapped: thread depth
    nut_h: float = 0.0       # nut joints: the nut's height (0: a nyloc, NYLOC_H)
    extra: float = 0.0       # washers under the head and nut, mm
    far: str = ""            # nut joints that cross open frame: the last part clamped (the stack runs through gaps)
    access: bool = False     # check the head goes in along the axis, clear of the parts it clamps (access_problems)
    gap: float = 0.05        # largest gap the stack may cross (a printed part's clearance to the plate it bolts to)
    insert_len: float = INSERT_LEN   # insert joints: the insert's length
    thread: float = 0.0      # clamped shoulder bolts: the thread's length past the shoulder
    free: float = 0.0        # clamped shoulder bolts: width on the shoulder the CAD does not draw (a clevis eye)
    play: float = 1.0        # clamped shoulder bolts: most open length the shoulder may leave (designed gaps + float)
    bolt: str = ""           # a fastener drawn as a part (the feeder's shoulder bolts): left out of its own stack
    holes: tuple = ()        # access: the joint's other holes (points; same axis, seat and direction)
    mirror_y: bool = False   # access: the joint is also made mirrored through y = 0 (the robot's other side)
    step: str = ""           # access: the start of the title of the step it goes in (default: the one step whose
    #                          fasteners name it)
    bench: bool = False      # access: driven on the bench before its step's parts go on the machine (the step's
    #                          parts alone must leave the head's path clear)
    tool_r: float = 0.0      # access: radius of the tool's (or fingers') path behind the head, 0 for the head's
    hex_head: bool = False   # a hex head turned with a spanner (not a key): spanner_checks swings one at the head
    spanner_len: float = 0.0  # the spanner the step asks for on the nut, mm (0: SPANNER_LEN for its size)


def joints(p) -> list[Joint]:
    """The robot's bolted joints: the collector's below, the feeder's in `feeder_guide`."""
    if isinstance(p, Feeder):
        from . import feeder_guide
        return feeder_guide.joints(p)
    return collector_joints(p)


def collector_joints(p: Collector) -> list[Joint]:
    from .package import fasteners
    shoulder = next(n for n, _, _ in fasteners(p) if "shoulder bolt" in n)
    ymid = p.motor_face_y - p.clamp_len / 2
    top = p.axle_z + p.motor_d / 2 + p.clamp_wall
    yb = C.pivot_y(p)
    cb = C._clamp_bolts(p)[0]
    cv = C._cover_bolts(p)[0]
    yo = p.disc_inner_y + p.plate_t
    ring_out = yo + p.clamp_ring_t
    arm_out = p.arm_inner_y + p.arm_t
    pilot_cradle = p.axle_z - p.base_top - 6
    bh = p.bump_switch_design()
    cbs = C._clamp_bolts(p)
    cvs = C._cover_bolts(p)
    tower = C._bump_tower_bolts(p)
    casters = C._caster_bolts(p)
    flange = C._caster_flange_holes(p)
    pis = C._pi_holes(p)
    corners = C._tray_corners(p)
    cbx = p.clamp_bolt_x
    sw_z = p.pivot_z + p.bump_sw_hole_pitch / 2
    return [
        Joint("motor clamp cap", "M4 x 50 socket cap screw", 50, 4, "insert", (cbx, ymid + 12, 0), "z",
              top, -1, 2.3, 3.5, "motor_clamp_cradle", pilot_cradle, access=True, mirror_y=True,
              holes=((-cbx, ymid + 12, 0), (cbx, ymid - 12, 0), (-cbx, ymid - 12, 0))),
        Joint("cradle to base", "M4 x 12 socket cap screw", 12, 4, "insert", (22, ymid, 0), "z", p.base_z, 1, 2.3,
              3.5, "motor_clamp_cradle", 12, access=True, mirror_y=True, holes=((-22, ymid, 0),), step="Drive motors"),
        Joint("pivot block to base", "M4 x 12 socket cap screw", 12, 4, "insert", (p.pivot_x + 12, yb, 0), "z",
              p.base_z, 1, 2.3, 3.5, "pivot_block", 12, access=True, mirror_y=True, holes=((p.pivot_x - 12, yb, 0),),
              step="Pivot blocks"),
        Joint("caster adapter + plate to mast socket", "M4 x 20 socket cap screw", 20, 4, "insert",
              (*casters[3], 0), "z", p.caster_height + C.CASTER_CBORE, 1, 2.3, 3.5, "mast_socket",
              C.MAST_FLANGE_H - 1.5, access=True, holes=tuple((*c, 0) for c in casters[:3])),
        Joint("rod clamp ring", "M4 x 16 button head + nyloc nut", 16, 4, "nut",
              (p.drum_x + cb[0], 0, p.drum_z + cb[1]), "y", ring_out, -1, 2.3, 3.5, access=True, mirror_y=True,
              holes=tuple((p.drum_x + c[0], 0, p.drum_z + c[1]) for c in cbs[1:])),
        Joint("fixed cover", "M5 x 12 button head", 12, 5, "rivet", (p.drum_x + cv[0], 0, p.drum_z + cv[1]), "y",
              -(yo + p.cover_t), 1, 3.6, 4.5, "drum_disc", access=True,
              holes=tuple((p.drum_x + c[0], 0, p.drum_z + c[1]) for c in cvs[1:])),
        Joint("hatch", "M5 thumb screw, 12 mm", 12, 5, "rivet", (p.drum_x + cv[0], 0, p.drum_z + cv[1]), "y",
              yo + p.cover_t, -1, 3.6, 4.5, "drum_disc", access=True, tool_r=THUMB_GRIP_R,
              holes=tuple((p.drum_x + c[0], 0, p.drum_z + c[1]) for c in cvs[1:])),
        Joint("yoke pivot", shoulder, p.pivot_shoulder, 6, "shoulder", (p.pivot_x, 0, p.pivot_z), "y", arm_out, -1,
              4.3, 6.0, access=True, mirror_y=True),
        Joint("drum axle", "M8 x 30 hex bolt + M8 nyloc nut", 30, 8, "nut", (p.drum_x, 0, p.drum_z), "y", arm_out,
              -1, 4.3, 5.9, access=True, mirror_y=True, hex_head=True, spanner_len=DRUM_AXLE_SPANNER),
        Joint("switch tower to base", "M4 x 12 socket cap screw", 12, 4, "insert", (*tower[0], 0),
              "z", p.base_z, 1, 2.3, 3.5, "bump_switch_tower", 12, extra=0.8, access=True,
              holes=tuple((*t, 0) for t in tower[1:]), step="Yoke-lift"),
        Joint("switch to tower", "M2 x 10 self-tapping screw (for plastic)", 10, 2, "tapped",
              (bh["x_body"], 0, sw_z), "y", bh["y_mid"] + p.bump_sw_body[2] / 2, -1,
              1.0, 1.9, "bump_switch_tower", C.BUMP_PILOT_DEPTH, access=True, mirror_y=True, bench=True,
              holes=((bh["x_body"], 0, sw_z - p.bump_sw_hole_pitch),)),
        Joint("caster flange to adapter", "M4 x 10 socket cap screw", 10, 4, "insert",
              (p.caster_x + flange[1][0], flange[1][1], 0), "z",
              p.caster_height - p.caster_flange[2], 1, 2.3, 3.5, "caster_adapter", C.caster_pilot(p), access=True,
              holes=((p.caster_x + flange[0][0], flange[0][1], 0),)),
        Joint("Pi standoff to tray", "M2.5 x 5 screw", 5, 2.5, "standoff", (*pis[0], 0), "z",
              p.base_top + p.standoff_h, 1, 1.4, 2.2, "pi_standoff", p.pi_standoff_h / 2, access=True, bench=True,
              holes=tuple((*h, 0) for h in pis[1:])),
        Joint("Pi to standoff", "M2.5 x 4 screw", 4, 2.5, "standoff", (*pis[0], 0), "z",
              p.base_top + p.standoff_h + p.tray_t + p.pi_standoff_h + p.pi_pcb_t, -1, 1.4, 2.2, "pi_standoff",
              p.pi_standoff_h / 2, access=True, holes=tuple((*h, 0) for h in pis[1:])),
        Joint("standoff to base", "M3 x 10 screw", 10, 3, "standoff", (*corners[0], 0), "z", p.base_z,
              1, 1.8, 2.6, "standoff", access=True, holes=tuple((*c, 0) for c in corners[1:])),
        Joint("tray to standoff", "M3 x 8 screw", 8, 3, "standoff", (*corners[0], 0), "z",
              p.base_top + p.standoff_h + p.tray_t, -1, 1.8, 2.6, "standoff", access=True,
              holes=tuple((*c, 0) for c in corners[1:])),
    ]


def joint_checks(p, parts) -> tuple[list[dict], list[str]]:
    rows, bad = [], []
    for j in joints(p):
        chain = _stack([pt for pt in parts if pt.name != j.bolt] if j.bolt else parts, j.point, j.axis, j.start, j.sign, j.hole_r, j.head_r, gaps=bool(j.far), gap=j.gap)
        names = [c[0] for c in chain]
        if j.far:
            if j.far not in names:
                bad.append(f"joint {j.name}: the bolt never reaches {j.far} (stack {names})")
                continue
            chain = chain[:names.index(j.far) + 1]
            names = names[:len(chain)]
        if j.into:
            if j.into not in names:
                bad.append(f"joint {j.name}: the screw never reaches {j.into} (stack {names})")
                continue
            grip = next(c[1] for c in chain if c[0] == j.into)
            if j.kind == "rivet":
                grip += RIVET_FLANGE
        else:
            grip = chain[-1][2] if chain else 0.0
        grip += j.extra
        spare = j.length - grip
        if j.kind == "nut":
            nut = j.nut_h or NYLOC_H[j.d]
            need = nut + 2 * PITCH[j.d]
            what = "nyloc" if not j.nut_h else "nut"
            ok, rule = spare >= need, f"needs {need:g} mm past the stack for the {what} and two threads"
        elif j.kind == "insert":
            ok = j.insert_len <= spare <= j.room
            rule = f"{j.insert_len:g} to {j.room:g} mm past the face, the insert's length to the pocket's depth"
        elif j.kind == "clamp":
            # A shoulder bolt clamped on `into`: the shoulder ends on its face, the parts on the shoulder fill it but
            # for the designed gaps, and the thread past the shoulder takes the nut (or stays in the insert/tap).
            into_t = next(c[2] - c[1] for c in chain if c[0] == j.into)
            filled = sum(c[2] - c[1] for c in chain[:names.index(j.into)]) + j.free
            open_mm = grip - filled
            if j.nut_h:
                past = j.thread - into_t
                need = j.nut_h + 2 * PITCH[j.d]
                tok, trule = past >= need, f"its {j.thread:g} mm thread {past:g} mm past the {into_t:g} mm part, {need:g} for the nut and two threads"
            else:
                tok = j.d <= j.thread <= j.room
                trule = f"its {j.thread:g} mm thread {j.d:g} to {j.room:g} mm into the part"
            ok = abs(spare) <= 0.3 and 0 <= open_mm <= j.play and tok
            rule = (f"shoulder ends on the face (+-0.3); {open_mm:g} mm open on it (0 to {j.play:g}); " + trule)
        elif j.kind == "shoulder":
            ok, rule = 0 <= spare <= 1.0, "shoulder 0-1 mm longer than the stack, so the arm swings"
        elif j.kind == "rivet":
            ok, rule = 1.0 * j.d <= spare <= p.plate_t + 6, f"{j.d:g}-{p.plate_t + 6:g} mm into the rivet nut"
        elif j.kind == "tnut":
            ok = TNUT[0] <= spare <= TNUT[1]
            rule = f"{TNUT[0]:g} to {TNUT[1]:g} mm past the extrusion's face: catches the T-nut, short of the slot floor"
        elif j.kind == "tapped":
            ok = j.d <= spare <= j.room
            rule = f"{j.d:g} to {j.room:g} mm into the part's tapped hole (its thread depth)"
        elif j.room:   # a standoff whose thread depth is given: as much of it as 1.5 d asks, never past it
            need = min(1.5 * j.d, j.room - 1.0)
            ok = need <= spare <= j.room
            rule = f"{need:g} to {j.room:g} mm into the standoff (1.5 d, or its thread less 1 mm; never past it)"
        else:
            ok, rule = spare >= 1.5 * j.d, f"at least {1.5 * j.d:g} mm into the standoff"
        under = chain[:names.index(j.into)] if j.into else chain
        stack = " + ".join(f"{c[0]} {c[2] - c[1]:g}" for c in under)
        stack += f" + {RIVET_FLANGE:g} flange" if j.kind == "rivet" else ""
        stack += f" + {j.extra:g} washers" if j.extra else ""
        if j.far and len(under) > 1:
            span = under[-1][2] - under[0][1] - sum(c[2] - c[1] for c in under)
            stack += f" (+ {span:g} open)" if span > 0.05 else ""
        rows.append({"joint": j.name, "fastener": j.fastener, "stack": stack,
                     "grip_mm": round(grip, 2), "length_mm": j.length, "spare_mm": round(spare, 2), "rule": rule,
                     "ok": ok})
        if not ok:
            bad.append(f"joint {j.name}: {j.fastener} leaves {spare:.1f} mm past a {grip:.1f} mm stack; {rule}")
    return rows, bad


def _instances(j: Joint) -> list[tuple]:
    """Every hole the joint is made at, as (point, seat, direction): its first point, `holes`, and with `mirror_y`
    each of those mirrored through y = 0 (for a y-axis joint the seat and direction flip; otherwise the point's y)."""
    pts = [(j.point, j.start, j.sign)] + [(h, j.start, j.sign) for h in j.holes]
    if j.mirror_y:
        if j.axis == "y":
            pts += [((x, -y, z), -st, -sg) for (x, y, z), st, sg in pts]
        else:
            pts += [((x, -y, z), st, sg) for (x, y, z), st, sg in pts]
    return pts


def _head_path(j: Joint, point, start, sign, reach: float):
    """The cylinder a head (or the tool turning it) sweeps behind its seat, away from the stack, for `reach` mm."""
    fr = frame_of(point, j.axis)
    z0, z1 = sorted((start - sign * 0.1, start - sign * reach))
    return Cylinder(j.tool_r or j.head_r, z1 - z0).moved(fr * Location((0, 0, (z0 + z1) / 2)))


def _blockers(path, shapes, tol_mm3: float) -> list[tuple[str, float]]:
    out = []
    for name, s in shapes:
        if _near(path, s, 0.0):
            x = path & s
            if x and x.volume > tol_mm3:
                out.append((name, x.volume))
    return out


def access_problems(p, parts, reach: float = 60.0, tol_mm3: float = 1.0) -> list[str]:
    """Each joint marked `access`, at each of its holes: a cylinder the head's size, from the head's seat back along
    the axis for `reach` mm (a hex key's), must stay clear of the part(s) the joint clamps. A counterbore closed at its
    far end fails: the screw cannot go in, and no key reaches it (the feeder's trough hangers, until 2026-11-20)."""
    bad = []
    by = {pt.name: pt for pt in parts}
    for j in joints(p):
        if not j.access:
            continue
        for k, (point, start, sign) in enumerate(_instances(j)):
            path = _head_path(j, point, start, sign, reach)
            chain = _stack(parts, point, j.axis, start, sign, j.hole_r, j.head_r)
            shapes = [(name, s) for name in dict.fromkeys(c[0] for c in chain) for s in by[name].placed()]
            hit = _blockers(path, shapes, tol_mm3)
            if hit:
                name, v = hit[0]
                where = f" (hole {k + 1})" if k else ""
                bad.append(f"joint {j.name}{where}: the {j.fastener}'s head cannot go in: {name} closes its path "
                           f"({v:.0f} mm^3 within {reach:g} mm of the seat)")
    return bad


def joint_step(p, j: Joint) -> int | None:
    """The 1-based step a joint goes in: the one its `step` names, else the one step whose fasteners list it."""
    st = steps(p)
    if j.step:
        hits = [k for k, s in enumerate(st, 1) if s.title.startswith(j.step)]
    else:
        hits = [k for k, s in enumerate(st, 1) if any(f == j.fastener for f, _ in s.fasteners)]
    return hits[0] if len(hits) == 1 else None


def built_at(p, parts, k: int) -> list[tuple[str, object]]:
    """(name, shape) of everything on the work when step k's screws go in: step k's parts, plus what came before on
    the same work (back to the sub-assembly the step belongs to, or the whole machine once it is joined)."""
    st = steps(p)
    first = 1
    if st[k - 1].on_sub or st[k - 1].new_subassembly:      # on a sub-assembly: back to the step that starts it
        first = k
        while first > 1 and not st[first - 1].new_subassembly:
            first -= 1
    return _placed(parts, [n for s in st[first - 1:k] for n in s.parts])


def step_access_problems(p, parts, reach: float = 60.0, tol_mm3: float = 1.0) -> list[str]:
    """Each `access` joint, at each hole, when its step comes: nothing on the work by then lies in the head's path
    (a bench joint: nothing among its own step's parts). Catches a screw the steps ask for after the part that hides
    it is on (2026-11-21)."""
    bad = []
    for j in joints(p):
        if not j.access:
            continue
        k = joint_step(p, j)
        if k is None:
            bad.append(f"joint {j.name}: no single step names its {j.fastener} (set Joint.step)")
            continue
        shapes = _placed(parts, steps(p)[k - 1].parts) if j.bench else built_at(p, parts, k)
        for h, (point, start, sign) in enumerate(_instances(j)):
            hit = _blockers(_head_path(j, point, start, sign, reach), shapes, tol_mm3)
            if hit:
                where = f" (hole {h + 1})" if h else ""
                names = ", ".join(sorted({n for n, _ in hit}))
                bad.append(f"joint {j.name}{where}: at step {k} the {j.fastener}'s head cannot be reached: {names} "
                           f"already in its path within {reach:g} mm")
                break
    return bad


def service_access(p, parts, reach: float = 60.0, tol_mm3: float = 1.0) -> list[dict]:
    """On the finished machine, the `access` joints whose head is hidden, and by what: the parts to take off first to
    reach them (a report for the guide, not a failure)."""
    allsh = [(pt.name, s) for pt in parts for s in pt.placed()]
    rows = []
    for j in joints(p):
        if not j.access:
            continue
        inst = _instances(j)
        hidden, by = 0, set()
        for point, start, sign in inst:
            hit = _blockers(_head_path(j, point, start, sign, reach), allsh, tol_mm3)
            if hit:
                hidden += 1
                by |= {n for n, _ in hit}
        if hidden:
            rows.append({"joint": j.name, "fastener": j.fastener, "hidden": hidden, "of": len(inst),
                         "behind": sorted(by)})
    return rows


def nut_seat(p, parts, j: Joint) -> float | None:
    """mm from the head's seat to the nut's seat along the bolt, or None for a joint with no nut: a nut joint's grip,
    a shoulder bolt's shoulder (its nut bears on the shoulder's end), a clamped shoulder bolt's far face of `into`."""
    if j.kind == "shoulder" and "nut" in j.fastener:
        return j.length
    if j.kind not in ("nut", "clamp") or (j.kind == "clamp" and not j.nut_h):
        return None
    shapes = [pt for pt in parts if pt.name != j.bolt] if j.bolt else parts
    chain = _stack(shapes, j.point, j.axis, j.start, j.sign, j.hole_r, j.head_r, gaps=bool(j.far), gap=j.gap)
    names = [c[0] for c in chain]
    end = j.far or j.into
    if end:
        return chain[names.index(end)][2] if end in names else None
    return (chain[-1][2] if chain else 0.0) + j.extra


def spanner_solid(d: int, hand: bool = True, length: float = 0.0):
    """A ring spanner for an M`d` nut in its own frame (its face on z = 0, its shank along +x), `length` long
    (SPANNER_LEN's for the size by default), and the hand on its end: the fingers over the last GRIP mm and the hand
    and wrist REACH_IN mm on along the shank."""
    s, length = NUT_AF[d], length or SPANNER_LEN[d]
    t, w = 0.4 * s + 2, 0.75 * s + 3                 # a typical ring end's thickness and shank width, mm (assumed)
    sp = Cylinder((1.65 * s + 1) / 2, t).moved(Location((0, 0, t / 2))) + Box(length, w, t).moved(
        Location((length / 2, 0, t / 2)))
    if hand:
        run = GRIP + REACH_IN
        sp += Box(run, w + HAND_W, HAND_D).moved(Location((length - GRIP + run / 2, 0, HAND_D / 2)))
    return sp


def spanner_free(j: Joint, d: int, point, seat: float, away: int, shapes, step: int = SPANNER_STEP,
                 tol_mm3: float = 1.0, length: float = 0.0) -> list[bool]:
    """At each angle about the bolt's axis (0, step, ...), whether the spanner and hand, face 0.2 mm off `seat` and
    standing `away` along the axis, miss `shapes`."""
    length = length or SPANNER_LEN[d]
    sp = spanner_solid(d, length=length)
    base = frame_of(point, j.axis) * Location((0, 0, seat + away * 0.2))
    if away < 0:
        base = base * Location((0, 0, 0), (180, 0, 0))
    reach = length + REACH_IN + 1
    env = Cylinder(reach, HAND_D + 1).moved(base * Location((0, 0, HAND_D / 2)))
    near = [(n, s) for n, s in shapes if _near(env, s, 0.0)]
    return [not _blockers(sp.moved(base * Location((0, 0, 0), (0, 0, a))), near, tol_mm3) for a in range(0, 360, step)]


def longest_run(free: list[bool], step: int = SPANNER_STEP) -> int:
    """Degrees in the longest run of free angles, round the circle."""
    if all(free):
        return 360
    best = cur = 0
    for f in free + free:
        cur = cur + 1 if f else 0
        best = max(best, cur)
    return best * step


def spanner_checks(p, parts) -> tuple[list[dict], list[str]]:
    """Every nut, at each of its holes, when its step comes (a bench joint: against its own step's parts): a spanner
    and the hand holding it must fit on at some angle, to hold the nut while the head turns. A hex head turned with a
    spanner (`hex_head`) needs SWING_DEG of swing at the head, or at the nut with the head held (2026-11-21)."""
    rows, bad = [], []
    for j in joints(p):
        seat = nut_seat(p, parts, j)
        if seat is None:
            continue
        k = joint_step(p, j)
        if k is None:
            bad.append(f"joint {j.name}: no single step names its {j.fastener} (set Joint.step)")
            continue
        shapes = _placed(parts, steps(p)[k - 1].parts) if j.bench else built_at(p, parts, k)
        if j.bolt:
            shapes = [(n, s) for n, s in shapes if n != j.bolt]
        holds, swings, heads, fails = [], [], [], []
        for h, (point, start, sign) in enumerate(_instances(j)):
            nut = longest_run(spanner_free(j, j.d, point, start + sign * seat, sign, shapes, length=j.spanner_len))
            head = longest_run(spanner_free(j, j.d, point, start, -sign, shapes)) if j.hex_head else None
            holds.append(nut)
            heads.append(head)
            where = f" (hole {h + 1})" if h else ""
            if nut == 0:
                fails.append(f"joint {j.name}{where}: at step {k} no angle takes a {NUT_AF[j.d]:g} mm spanner and "
                             f"the hand holding it on the nut")
            elif j.hex_head and head < SWING_DEG and nut < SWING_DEG:
                fails.append(f"joint {j.name}{where}: at step {k} neither the head ({head} deg) nor the nut ({nut} "
                             f"deg) swings a {NUT_AF[j.d]:g} mm spanner {SWING_DEG} deg")
        turned = [] if j.hex_head and min(heads) < SWING_DEG else ["head" if j.hex_head else "head (key)"]
        turned += ["nut"] if min(holds) >= SWING_DEG else []
        rows.append({"joint": j.name, "fastener": j.fastener, "step": k, "spanner_mm": NUT_AF[j.d],
                     "spanner_len": j.spanner_len or SPANNER_LEN[j.d],
                     "holes": len(holds), "nut_deg": min(holds), "head_deg": min(heads) if j.hex_head else None,
                     "turn": " or ".join(turned), "ok": not fails})
        bad += fails
    return rows, bad


def hatch_check(p: Collector, parts, tol_mm3: float = 1.0) -> list[str]:
    """The hatch, turned with the drum so its slot points down, lifts out of its seat and rises off the spacer."""
    hatch = next(pt for pt in parts if pt.name == "drum_hatch")
    others = [s for pt in parts if pt.name != "drum_hatch" for s in pt.placed()]
    turn = (Location((p.drum_x, 0, p.drum_z)) * Location((0, 0, 0), (0, HATCH_TURN, 0))
            * Location((-p.drum_x, 0, -p.drum_z)))
    bad = []
    for dx, dy, dz in C.hatch_off_path(p):
        s = hatch.shape.moved(Location((dx, dy, dz)) * turn * hatch.placements[0])
        for o in others:
            if _near(s, o, 0.0):
                v = (s & o).volume if (s & o) else 0.0
                if v > tol_mm3:
                    bad.append(f"hatch removal: hits a part at offset ({dx:g}, {dy:g}, {dz:g}) mm")
                    return bad
    return bad


DRUM_TURNS = ("drum_hatch", "drum_cover", "drum_disc", "drum_rod", "rod_clamp_ring", "drum_bearing", "axle_spacer")


def hatch_screw_window(p: Collector, parts, span: int = 60, tol_mm3: float = 1.0) -> list[int]:
    """Drum turns (whole degrees about +y from as drawn, 0 to span-1) at which a finger reaches every hatch thumb
    screw: each screw's grip path clear of every part that does not turn with the drum (the yoke arms)."""
    j = next(x for x in joints(p) if x.name == "hatch")
    still = [(pt.name, s) for pt in parts if pt.name not in DRUM_TURNS for s in pt.placed()]
    ok = []
    for a in range(span):
        turn = (Location((p.drum_x, 0, p.drum_z)) * Location((0, 0, 0), (0, a, 0))
                * Location((-p.drum_x, 0, -p.drum_z)))
        if not any(_blockers(_head_path(j, tuple((turn * Location(pt)).position), st, sg, 60.0), still, tol_mm3)
                   for pt, st, sg in _instances(j)):
            ok.append(a)
    return ok


def hatch_screw_problems(p: Collector, parts, need_deg: int = 3) -> list[str]:
    """With the drum turned for the hatch to come off (slot down, 90 degrees), every thumb screw can be reached, and
    stays reachable `need_deg` degrees either way (a drum stopped by hand is not exact). Found 2026-11-21: as drawn,
    one screw of six is behind the yoke arm; the arm hides a screw over 24 degrees of every 60."""
    ok = set(hatch_screw_window(p, parts))
    rem = HATCH_TURN % 60
    miss = [d for d in range(-need_deg, need_deg + 1) if (rem + d) % 60 not in ok]
    if miss:
        return [f"hatch removal: with the slot down a thumb screw is behind the yoke arm "
                f"(drum turned {HATCH_TURN + miss[0]:g} degrees)"]
    return []


def hatch_margin(p: Collector, parts) -> tuple[int, int]:
    """Degrees the drum may sit short of / past the slot-down turn with every thumb screw still reachable."""
    ok = set(hatch_screw_window(p, parts))
    rem = HATCH_TURN % 60
    lo = next(d for d in range(61) if (rem - d - 1) % 60 not in ok)
    hi = next(d for d in range(61) if (rem + d + 1) % 60 not in ok)
    return lo, hi


# ------------------------------------------------------------------------ output

VIEW = ((2600.0, -2200.0, 1700.0), (0, 0, 1), (60.0, 0.0, 150.0))  # origin, up, look-at: one camera


def _svg(new, built, path, view=VIEW) -> None:
    everything = Compound(children=[*built, *new])
    size = max(*(abs(v) for v in everything.bounding_box().size))
    svg = ExportSVG(scale=520 / size)
    svg.add_layer("built", line_color=(170, 170, 170), line_weight=0.25)
    svg.add_layer("new", line_color=(0, 0, 0), line_weight=0.5)
    vis_all, _ = everything.project_to_viewport(*view)
    vis_new, _ = Compound(children=new).project_to_viewport(*view)
    svg.add_shape(vis_all, layer="built")
    svg.add_shape(vis_new, layer="new")
    svg.write(str(path))


def _files(parts, name):
    pt = next((x for x in parts if x.name == name), None)
    if pt is None:
        return ""
    if pt.kind == "laser":
        return f"laser/{pt.name}__{pt.material.split()[0]}_{pt.thickness:g}mm.dxf"
    if pt.kind == "print":
        return f"print/{pt.name}.stl"
    return pt.spec


def write(out, p, parts, bom_rows, joint_rows, problems, drawings: bool = True, spanner_rows=None) -> None:
    folder = out / "guide"
    folder.mkdir(parents=True, exist_ok=True)
    st = steps(p)
    feeder = isinstance(p, Feeder)
    robot = "feeder" if feeder else "collector"
    if feeder:
        from . import feeder_guide as FG
    lines = [f"# {robot.capitalize()} assembly guide", "",
             f"Generated from the CAD (`python -m otr_cad {robot}`), with the parts list, the drawings and the",
             "checks below, so it changes when the design does. Design v0.2: **nobody has built one yet.** Read",
             "`hardware/safety.md` first. Report what you find: https://github.com/duncan-haywood/oss-monorepo/issues",
             "", "Each drawing shows the parts that step adds in black over what is already built in grey.", ""]
    if feeder:
        lines += FG.INTRO + [""]
    lines += ["## Steps", ""]
    for k, s in enumerate(st, 1):
        lines += [f"### {k}. {s.title}", ""]
        if s.image and drawings:
            lines += [f"![Step {k}: {s.title}](step_{k:02d}.svg)", ""]
        if s.parts:
            lines += ["| Part | Qty | File or what to buy |", "| --- | --- | --- |"]
            for name, i in _entries(s.parts):
                pt = next(x for x in parts if x.name == name)
                qty = 1 if i is not None else pt.qty
                lines.append(f"| {name}{'' if i is None else f' ({i + 1} of {pt.qty})'} | {qty} | {_files(parts, name)} |")
            lines.append("")
        if s.fasteners:
            lines += ["| Fastener or part | Qty |", "| --- | --- |"]
            lines += [f"| {item} | {qty} |" for item, qty in s.fasteners]
            lines.append("")
        if s.tools:
            lines += [f"Tools: {s.tools}.", ""]
        lines += [s.text, ""]
    lines += ["## Fastener lengths, checked against the CAD", "",
              "Each length is measured from the head's face through the parts the model puts under it.", "",
              "| Joint | Fastener | Stack (mm) | Grip | Length | Spare | Rule | |",
              "| --- | --- | --- | --- | --- | --- | --- | --- |"]
    for r in joint_rows:
        lines.append(f"| {r['joint']} | {r['fastener']} | {r['stack']} | {r['grip_mm']:g} | {r['length_mm']:g} | "
                     f"{r['spare_mm']:g} | {r['rule']} | {'pass' if r['ok'] else 'FAIL'} |")
    lines += ["", "## Other checks", ""]
    if feeder:
        lines += FG.other_checks(p)
    else:
        lines += ["- Every placed part is fitted in exactly one step, and the steps use every bought line of the BOM",
                  "  to the unit.",
                  "- Every part a step adds touches something fitted before it (two steps start sub-assemblies).",
                  "- The hatch comes off a hung drum: turn the drum until the hatch's slot points down, undo the six",
                  "  thumb screws, pull the hatch 3 mm out of its seat and lift it up off the axle spacer.",
                  "- Every screw goes in along its axis at every one of its holes, both sides of the robot: a",
                  "  cylinder the head's size (a finger and thumb's, 20 mm across, for the hatch's thumb screws),",
                  "  60 mm back from the seat, misses the parts the screw clamps, and misses everything already on",
                  "  the work when its step comes (the bench steps: everything that step adds).",
                  "- With the hatch's slot down, a finger reaches all six thumb screws: the yoke arm hides one",
                  "  screw over %d degrees of every 60 of drum turn, and the slot-down turn is %d degrees from that"
                  % (60 - len(hatch_screw_window(p, parts)), min(hatch_margin(p, parts))),
                  "  (stop the drum by hand within that and the arm is clear)."]
        service = service_access(p, parts)
        if service:
            lines += ["", "## Service access", "",
                      "On the finished robot these screws are hidden behind other parts; take those off first.", "",
                      "| Joint | Fastener | Hidden holes | Behind |", "| --- | --- | --- | --- |"]
            lines += [f"| {r['joint']} | {r['fastener']} | {r['hidden']} of {r['of']} | {', '.join(r['behind'])} |"
                      for r in service]
            lines += ["", "The drum's covers turn with the drum: turn it until the arm is clear of the screw."]
    if spanner_rows:
        lines += ["", "## Spanners on the nuts", "",
                  f"Each nut, at every one of its holes, when its step comes: a ring spanner of the nut's size (its "
                  f"length assumed: {', '.join(f'{NUT_AF[d]:g} mm, {SPANNER_LEN[d]:g} long' for d in sorted(NUT_AF))}, "
                  "unless the step asks for another) and",
                  f"the hand on its end ({GRIP:g} mm of fingers, then {REACH_IN:g} mm of hand and wrist along the "
                  f"shank, {HAND_D:g} mm deep) are laid on the nut and",
                  f"turned about the bolt {SPANNER_STEP} degrees at a time. \"Nut\" is the widest arc that is clear at "
                  f"the worst hole; a nut needs one clear angle to be held,",
                  f"and {SWING_DEG} degrees (a 12-point ring's step) to be turned. A hex head turned with a spanner "
                  "is swung the same way (\"Head\").", "",
                  "| Joint | Fastener | Step | Spanner on the nut | Holes | Nut (deg) | Head (deg) | Turn | |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
        for r in spanner_rows:
            head = "-" if r["head_deg"] is None else f"{r['head_deg']}"
            lines.append(f"| {r['joint']} | {r['fastener']} | {r['step']} | {r['spanner_mm']:g} mm, "
                         f"{r['spanner_len']:g} long | {r['holes']} | "
                         f"{r['nut_deg']} | {head} | {r['turn']} | {'pass' if r['ok'] else 'FAIL'} |")
    lines += [
              "", "Result when this package was built: " + ("all pass." if not problems else "; ".join(problems)), ""]
    (folder / "ASSEMBLY.md").write_text("\n".join(lines))
    if not drawings:
        return
    built, sub = [], []
    for k, s in enumerate(st, 1):
        new = [sh for _, sh in _placed(parts, s.parts)]
        if s.new_subassembly:
            sub = []
        if s.image and new:
            _svg(new, sub if (s.on_sub or s.new_subassembly) else built, folder / f"step_{k:02d}.svg",
                 FG.VIEW if feeder else VIEW)
        built += new
        sub += new
