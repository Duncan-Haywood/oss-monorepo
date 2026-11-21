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
"""

from __future__ import annotations

from dataclasses import dataclass, field

from build123d import Compound, Cylinder, ExportSVG, Location

from . import collector as C
from .params import Collector, Feeder

NYLOC_H = {3: 4.0, 4: 5.0, 5: 5.0, 6: 6.0, 8: 8.0}  # DIN 985 nut heights, mm
PITCH = {3: 0.5, 4: 0.7, 5: 0.8, 6: 1.0, 8: 1.25}
INSERT_LEN = 5.7                          # the BOM's short M4 insert
RIVET_FLANGE = 1.0                        # a standard M5 rivet nut's flange, which sits under the cover
TNUT = (4.0, 8.0)   # mm past an extrusion's face: catches an M5 slot-6 T-nut under its lip, short of the slot floor (assumed)
WASHER = {3: 0.5, 5: 1.0, 6: 1.6, 8: 1.6}  # ISO 7089 thickness, mm


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
            ("M4 heat-set insert, 5.7 mm long", 24), ("M5 rivet nut (blind insert), aluminium", 12)],
            "soldering iron with an M4 insert tip, M5 rivet nut tool",
            f"Melt one M4 insert into each {p.insert_hole_d:g} mm pocket: 4 in the top face of each motor clamp "
            "cradle (where the cap meets it), 2 in the underside of each cradle, 2 in the underside of each pivot "
            "block, 2 in the underside of each yoke-lift switch tower, and 4 in the underside of the mast socket's flange. Press each one flush and square. Set an M5 "
            f"rivet nut in each of the six {p.rivet_nut_hole_d:g} mm holes of both drum discs, flange on the outer "
            f"face (the face away from the rods). A standard {RIVET_FLANGE:g} mm flange holds the cover that far off "
            "the disc; the arm gap allows for it.", image=False),
        Step("Lay out the base plate", ["base_plate"], [], "",
             "Deburr every hole. The plate's top face is the side the motors sit on; the strap slots are nearest "
             "the front (drum) end.", new_subassembly=True),
        Step("Mast socket, caster adapter and ball caster", ["mast_socket", "caster_adapter", "ball_caster"],
             [("M4 x 20 socket cap screw", 4), ("Ball caster mounting screws", 1)], "3 mm hex key",
             "Stand the mast socket on the top face over the four rear holes, hold the caster adapter under the "
             "plate with its counterbores facing down, and drive the four M4 x 20 screws up through adapter and "
             "plate into the socket's inserts. Their heads sit in the counterbores, so the caster can then be "
             "screwed flat to the adapter: mark and drill its own holes clear of the four heads."),
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
        Step("Electronics tray on its standoffs", ["standoff", "electronics_tray"],
             [("M3 x 10 screw", 4), ("M3 x 8 screw", 4)], "2.5 mm hex key",
             "Screw the four 30 mm standoffs on from under the plate with M3 x 10, then the tray onto them with "
             "M3 x 8. The e-stop hole is at the tray's front corner."),
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
             [(shoulder, 2), ("M8 x 30 hex bolt + M8 nyloc nut", 2)], "4 mm hex key, two 10 mm and two 13 mm spanners",
             "Fit each arm to its pivot block with a shoulder bolt from outside and an M6 nyloc inside the block. "
             "Tighten it onto the shoulder: the arm must still swing freely. Stand the drum between the arms, put "
             "an axle spacer through each cover's centre hole onto the bearing's inner race, and bolt each arm "
             "end to it with an M8 x 30 from outside, nyloc on the inner race (reach it between the rods). The "
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
        Step("Electronics", [], [("Raspberry Pi 5 (4 GB) or Pi 4", 1), ("M2.5 x 6 screw + 6 mm standoff", 4),
                                 ("ESP32 dev board (ESP32-WROOM-32)", 1), ("Dual DC motor driver, 10 A/ch, PWM+DIR", 1),
                                 ("5 V 5 A buck converter", 1), ("22 mm NC mushroom e-stop + 24 V contactor", 1),
                                 ("BNO085 (or similar) IMU", 1)],
             "screwdrivers, crimp tool, multimeter",
             "Mount the Pi on its M2.5 pattern and the ESP32, motor driver, buck converter and IMU on the 10 mm M3 "
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
            if x and x.volume > 1e-3:
                bb = (x.moved(back) if back is not None else x).bounding_box()
                lo, hi = (bb.min.X, bb.min.Y, bb.min.Z)[i], (bb.max.X, bb.max.Y, bb.max.Z)[i]
                a, b = sorted(((lo - start) * sign, (hi - start) * sign))
                if b > 0.01:
                    hits.append((pt.name, round(max(a, 0.0), 3), round(b, 3)))
    hits.sort(key=lambda h: h[1])
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
    return [
        Joint("motor clamp cap", "M4 x 50 socket cap screw", 50, 4, "insert", (p.clamp_bolt_x, ymid + 12, 0), "z",
              top, -1, 2.3, 3.5, "motor_clamp_cradle", pilot_cradle),
        Joint("cradle to base", "M4 x 12 socket cap screw", 12, 4, "insert", (22, ymid, 0), "z", p.base_z, 1, 2.3,
              3.5, "motor_clamp_cradle", 12),
        Joint("pivot block to base", "M4 x 12 socket cap screw", 12, 4, "insert", (p.pivot_x + 12, yb, 0), "z",
              p.base_z, 1, 2.3, 3.5, "pivot_block", 12),
        Joint("caster adapter + plate to mast socket", "M4 x 20 socket cap screw", 20, 4, "insert",
              (p.caster_x + 20, 20, 0), "z", p.caster_height + C.CASTER_CBORE, 1, 2.3, 3.5, "mast_socket",
              C.MAST_FLANGE_H - 1.5),
        Joint("rod clamp ring", "M4 x 16 button head + nyloc nut", 16, 4, "nut",
              (p.drum_x + cb[0], 0, p.drum_z + cb[1]), "y", ring_out, -1, 2.3, 3.5),
        Joint("fixed cover", "M5 x 12 button head", 12, 5, "rivet", (p.drum_x + cv[0], 0, p.drum_z + cv[1]), "y",
              -(yo + p.cover_t), 1, 3.6, 4.5, "drum_disc"),
        Joint("hatch", "M5 thumb screw, 12 mm", 12, 5, "rivet", (p.drum_x + cv[0], 0, p.drum_z + cv[1]), "y",
              yo + p.cover_t, -1, 3.6, 4.5, "drum_disc"),
        Joint("yoke pivot", shoulder, p.pivot_shoulder, 6, "shoulder", (p.pivot_x, 0, p.pivot_z), "y", arm_out, -1,
              4.3, 6.0),
        Joint("drum axle", "M8 x 30 hex bolt + M8 nyloc nut", 30, 8, "nut", (p.drum_x, 0, p.drum_z), "y", arm_out,
              -1, 4.3, 5.9),
        Joint("switch tower to base", "M4 x 12 socket cap screw", 12, 4, "insert", (*C._bump_tower_bolts(p)[0], 0),
              "z", p.base_z, 1, 2.3, 3.5, "bump_switch_tower", 12, extra=0.8),
        Joint("switch to tower", "M2 x 10 self-tapping screw (for plastic)", 10, 2, "tapped",
              (bh["x_body"], 0, p.pivot_z + p.bump_sw_hole_pitch / 2), "y", bh["y_mid"] + p.bump_sw_body[2] / 2, -1,
              1.0, 1.9, "bump_switch_tower", C.BUMP_PILOT_DEPTH),
        Joint("standoff to base", "M3 x 10 screw", 10, 3, "standoff", (*C._tray_corners(p)[0], 0), "z", p.base_z,
              1, 1.8, 2.6, "standoff"),
        Joint("tray to standoff", "M3 x 8 screw", 8, 3, "standoff", (*C._tray_corners(p)[0], 0), "z",
              p.base_top + p.standoff_h + p.tray_t, -1, 1.8, 2.6, "standoff"),
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


def access_problems(p, parts, reach: float = 60.0, tol_mm3: float = 1.0) -> list[str]:
    """Each joint marked `access`: a cylinder the head's size, from the head's seat back along the axis for `reach`
    mm (a hex key's), must stay clear of the part(s) the joint clamps. A counterbore closed at its far end fails: the
    screw cannot go in, and no key reaches it (the feeder's trough hangers, until 2026-11-20)."""
    bad = []
    by = {pt.name: pt for pt in parts}
    for j in joints(p):
        if not j.access:
            continue
        fr = frame_of(j.point, j.axis)
        z0, z1 = sorted((j.start - j.sign * 0.1, j.start - j.sign * reach))    # behind the seat, away from the stack
        path = Cylinder(j.head_r, z1 - z0).moved(fr * Location((0, 0, (z0 + z1) / 2)))
        chain = _stack(parts, j.point, j.axis, j.start, j.sign, j.hole_r, j.head_r)
        for name in dict.fromkeys(c[0] for c in chain):
            for s in by[name].placed():
                if _near(path, s, 0.0):
                    x = path & s
                    if x and x.volume > tol_mm3:
                        bad.append(f"joint {j.name}: the {j.fastener}'s head cannot go in: {name} closes its path "
                                   f"({x.volume:.0f} mm^3 within {reach:g} mm of the seat)")
                        break
    return bad


def hatch_check(p: Collector, parts, tol_mm3: float = 1.0) -> list[str]:
    """The hatch, turned with the drum so its slot points down, lifts out of its seat and rises off the spacer."""
    hatch = next(pt for pt in parts if pt.name == "drum_hatch")
    others = [s for pt in parts if pt.name != "drum_hatch" for s in pt.placed()]
    turn = (Location((p.drum_x, 0, p.drum_z)) * Location((0, 0, 0), (0, 90, 0))
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


def write(out, p, parts, bom_rows, joint_rows, problems, drawings: bool = True) -> None:
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
                  "  thumb screws, pull the hatch 3 mm out of its seat and lift it up off the axle spacer."]
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
