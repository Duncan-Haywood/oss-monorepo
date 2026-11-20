"""The feeder's assembly guide: its steps and bolted joints, checked by the shared code in `guide.py`.

`python -m otr_cad feeder` writes `guide/ASSEMBLY.md` and one drawing per step (`guide/step_NN.svg`). The checks are
the collector's (part and BOM tally to the unit, step order, fastener stacks measured from the CAD) plus a head-access
check on the screws whose heads sit in a pocket, and a rule that a screw into an extrusion's end lands on one of its
core bores (`end_bore_problems`).

Writing it against the model (2026-11-20) found the package as committed could not be put together as drawn: see
cad/README.md, "Feeder assembly guide".
"""

from __future__ import annotations

import math

from build123d import Location

from . import feeder as F
from .guide import Joint, Step, WASHER
from .params import Feeder

# A screw into the end of a 2040 extrusion goes into one of its two core bores, 10 mm either side of the end's
# centre along the 40 mm side; the middle of the end is the web between the two cells and takes no screw.
CORE_OFFSET = 10.0
END_TAP_DEPTH = 15.0       # M5 tapped into an extrusion's core bore, mm (assumed: tap at least this deep)
NEMA17_THREAD = 4.5        # M3 thread depth in a NEMA 17's front flange (17HS4401 drawings), mm
M3_NUT_H = 2.4             # ISO 4032
STANDOFF_THREAD = 8.0      # M5 thread depth at each end of an 80 mm female-female standoff, mm (assumed: check yours)

VIEW = ((5200.0, -4300.0, 3200.0), (0, 0, 1), (-300.0, 0.0, 1100.0))  # origin, up, look-at

INTRO = [
    "The feeder is about 3 m wide and 2.7 m tall with the net poles up: build the base on the floor where it will",
    "stand, and have a second person for the hopper posts, the lift column and the poles. The steps go base first,",
    "then the mast and turntable, the head (on the bench), the hopper, the net and trough, the lift and the wiring.",
]


def _shelf(p: Feeder) -> Location:
    return F._shelf_frame(p)


def steps(p: Feeder) -> list[Step]:
    ins = F.INSERT_HOLE_D
    lift = p.lift_design()
    flights = lift["flights"]
    clips = len(p.lift_clip_z())
    ties = p.deck_cable_ties()
    hangers = len(p.trough_hanger_y)
    st = [
        Step("Prepare the printed parts and the test print", ["lift_bearing_fit_ring"], [
            ("M4 heat-set insert, 5.7 mm long", 8), ("M4 heat-set insert, 5.7 mm long (azimuth)", 3),
            ("M4 heat-set insert, 5.7 mm long (stops)", 4), ("M4 heat-set insert, 5.7 mm long (feed)", 12),
            ("M4 heat-set insert, 5.7 mm long (servo)", 6), ("M4 heat-set insert, 5.7 mm long (agitator)", 3),
            ("M4 heat-set insert, 5.7 mm long (spring bracket)", 2)],
            "soldering iron with an M4 insert tip",
            "Print the bearing fit ring first, press a spare F626 into each bore and run `python -m otr_cad fit-ring` "
            "(cad/README.md, \"Bearing fit test ring\"): it sets the lift boot's bearing pockets before you print the "
            f"boot. Then melt one M4 insert into each {ins:g} mm pocket, flush and square: two in each cheek foot "
            "(the underside and the face toward the cheek), three in the top of the gear sector, two in the underside "
            "of each azimuth stop block, one in each side of the feed floor and the feed roof at each screw (eight), "
            "four in the sleeve socket's flange, one in each servo bracket leg and tab (five), one in the shuttle's "
            "+y side, three in the top of the agitator's motor mount and two in the top of the take-up spring's "
            "bracket. The feed floor's inserts sit 1.2 mm under "
            "the face the shuttle slides on: if setting one lifts that face, sand it flat.", image=False),
        Step("Base frame", ["net_beam", "rear_rail", "side_rail", "mast_rail"],
             [("M5 x 30 button head (frame)", 16), ("M5 x 50 button head (mast posts)", 8)],
             "M5 tap, 5.5 mm drill, 3 mm hex key, square",
             "Tap both core bores of each end of the side rails and mast rails M5, at least "
             f"{END_TAP_DEPTH:g} mm deep. Lay the net beam (front, 3 m), the rear rail and the two side rails on a flat "
             "floor and drill 5.5 mm through the net beam and the rear rail where each side rail's two bores meet "
             "them: two M5 x 30 through each into the side rail's end. Fit the two mast rails between the side rails "
             "the same way, through the side rails from outside. Square the frame corner to corner before the last "
             "screw is tight. While the mast rails are loose, drill 5.5 mm down through each one at the four mast "
             "posts' core bores (step 5) and push the eight M5 x 50 up through from below: their heads bear on the "
             "bottom slot's lips.", new_subassembly=True),
        Step("Levelling feet", ["levelling_foot"],
             [("M6 T-nut (slot 6) + M6 jam nut (levelling foot)", 2)], "13 mm spanner",
             f"Slide an M6 T-nut into the net beam's bottom slot {p.foot_half_y:g} mm either side of the middle and "
             "screw a foot's stud up into each. Set them to take the beam's ends just off the ground once the "
             "wheels carry the rest, then lock each with its jam nut.", reach=1.0),
        Step("Drive and idler wheels", ["drive_bracket", "idler_bracket", "gearmotor", "wheel"],
             [("M5 x 12 button head", 8), ("M5 T-nut (slot 6)", 8), ("M3 x 8 screw", 12),
              ("608 bearing, 8 x 22 x 7", 2), ("M8 x 60 bolt + nyloc nut", 2)],
             "3 mm and 2.5 mm hex keys, two 13 mm spanners",
             "Screw each gearmotor's face to the inside of a drive bracket (six M3 x 8), shaft out through the 14 mm "
             "hole. Bolt the drive brackets near the net beam and the idler brackets near the rear rail to the side "
             "rails' outer slots (two M5 x 12 into T-nuts each). Press a 608 into each idler bracket's bore; the "
             "idler wheels turn on an M8 x 60 through the bearing. Push the drive wheels' hubs onto the 6 mm D "
             "shafts, flat to the grub screw, 2 mm off the bracket.", reach=2.5),
        Step("Mast posts and cable crossbar", ["mast_post", "cable_crossbar"],
             [("2020 corner bracket with M5 screws and T-nuts (cable crossbar)", 2)], "4 mm and 3 mm hex keys",
             "Tap both core bores of each end of the four posts M5. Stand each post on its mast rail over two of "
             "the M5 x 50s from step 2 and screw them up into its bores (the post's 40 mm side runs along the net). "
             "Fit the 2020 crossbar between the two rear posts' inner faces with a corner bracket at each end, its "
             f"top {p.cable_clamp_z + 10:g} mm off the ground."),
        Step("Mast plate, azimuth stepper, home switch and hard stops",
             ["mast_plate", "az_stepper", "az_pinion", "home_switch_bracket", "home_switch", "home_switch_lever",
              "az_stop_block", "az_stop_pad"],
             [("M5 x 12 button head", 8), ("M3 x 8 screw (azimuth stepper)", 4),
              ("M3 x 12 socket cap screw + washer + nut (home switch)", 2), ("M2 x 10 self-tapping screw", 2),
              ("M4 x 12 socket cap screw (stops)", 4), ("Contact adhesive (polyurethane to PETG)", 1)],
             "3 mm, 2.5 mm and 1.5 mm hex keys",
             "Screw the mast plate onto the posts' top ends, two M5 x 12 into each post's bores. Hang the stepper "
             f"under it, shaft up through the {F.AZ_BOSS_D:g} mm hole, with four M3 x 8 from above (a NEMA 17's "
             f"flange threads are about {NEMA17_THREAD:g} mm deep: a longer screw bottoms before it clamps). Push "
             "the pinion on the shaft with its teeth's top face 0.5 mm over the plate, set screw on the flat. Glue "
             "a polyurethane pad on each stop block's face toward the gear sector and screw the blocks up from under "
             "the plate (two M4 x 12 each). Screw the home switch to its bracket (two M2) and the bracket to the "
             "plate through its slots (M3 x 12, washer and nut under the plate), set mid-slot for now; the last "
             "step sets it. (The pinion rides 5.5 mm over the stepper's face on its shaft, which is not modelled.)",
             reach=6.0),
        Step("Turntable bearing, plate and gear sector",
             ["turntable_bearing", "az_gear_sector", "turntable_plate", "cable_gland"],
             [("M5 x 12 button head", 8), ("M5 nut (turntable bearing)", 8),
              ("M4 x 12 socket cap screw (azimuth)", 3)], "3 mm hex key, 8 mm spanner",
             "Bolt the bearing's fixed ring to the mast plate (four M5 x 12 up from under the plate, nuts on the "
             "ring, through the access hole in the other ring) and the turntable plate to its turning ring (four "
             "from above, nuts under the ring). If your bearing's rings are tapped, leave the nuts out. Screw the "
             "gear sector up under the plate's +y edge, three M4 x 12 from above. Turn the plate by hand through "
             f"+-{p.az_stop_deg:g} deg: the sector meshes with the pinion all the way and stops on the pads. Push "
             "the cable gland into the plate's centre hole from above."),
        Step("Trunnion cheeks", ["cheek_foot", "trunnion_cheek", "trunnion_cheek_elev"],
             [("M4 x 12 socket cap screw", 8), ("Snap-in grommet for a 10 mm hole, 6 mm bore or more", 1)],
             "3 mm hex key",
             "Screw two feet to the outer face of each cheek (M4 x 12 through the cheek into the face inserts), then "
             "stand the cheeks on the turntable plate and screw the feet down from under it (M4 x 12 into the "
             "underside inserts). The cheek with the rear tab goes on the -y (guard) side. Snap the grommet into "
             "that cheek's small hole under the pivot."),
        Step("Head: motor plate, launcher motors and wheels (on the bench)",
             ["head_motor_plate", "launcher_motor", "launcher_wheel"],
             [("M4 x 12 socket cap screw (motors)", 8), ("Snap-in grommet for a 14 mm hole", 1)],
             "3 mm hex key",
             f"Lay the motor plate outer face up. Screw each outrunner to it (four M4 x 12 on the {p.motor_pitch:g} mm "
             "square; check that a screw reaches no further into your motor than its mounting threads go, or it "
             "can touch the windings). Fit each wheel's hub on its shaft from the plate's inner face. Snap the 14 mm "
             "grommet into the plate's wiring hole.", new_subassembly=True,
             reach=p.plate_half_y - p.wheel_head_w / 2 + 0.5),
        Step("Head: feed floor, roof column, shuttle and guard plate",
             ["head_standoff", "cable_clip", "feed_floor", "feed_roof_column", "feed_shuttle", "head_guard_plate"],
             [("M5 x 12 button head", 8), ("M4 x 12 socket cap screw (feed)", 8)], "3 mm hex key",
             "Slide the cable clip onto the rear lower standoff. Screw the four standoffs to the motor plate's inner "
             "face (M5 x 12), the feed floor and the roof column to it (M4 x 12 into their inserts), drop the "
             "shuttle on the floor under the column (insert side toward the motor plate), and close the head with "
             "the guard plate (four M5 x 12 into the standoffs, four M4 x 12 into the floor and roof). The shuttle "
             "must slide its full stroke by hand.", on_sub=True, reach=p.feed_clear + 0.2),
        Step("Head: shuttle drive", ["shuttle_servo_bracket", "shuttle_servo", "shuttle_crank", "shuttle_rod"],
             [("M4 x 12 socket cap screw (servo legs)", 3), ("M4 x 10 socket cap screw (servo tabs)", 2),
              ("M4 x 30 shoulder bolt (5 mm shoulder) + nyloc", 2)],
             "3 mm and 2.5 mm hex keys, 7 mm spanner",
             "Screw the servo bracket's three legs to the motor plate (M4 x 12 from inside the head into the leg "
             "inserts) and the servo into the cradle by its tabs (two M4 x 10). Centre the servo, screw the crank "
             "to its horn, and join crank and shuttle with the rod: one shoulder bolt through the rod and the "
             "plate's slot into the shuttle's insert, one through the rod and the crank with a nyloc. Turn the "
             "servo by hand through its range: the shuttle runs its stroke without binding.", on_sub=True, reach=1.5),
        Step("Hang the head and fit the elevation actuator",
             ["elev_actuator", "elev_actuator_rod", "elev_pin", "elev_anchor_bolt"],
             [("M8 x 120 bolt + nyloc nut + 4 washers", 1)], "13 mm spanners, 5 mm and 4 mm hex keys",
             "Lift the head between the cheeks and push the M8 pivot bolt through cheek, washer, head plate, head "
             "plate, washer and cheek, with a washer under the head and the nyloc. Tighten until the head swings "
             "freely with no end play. Fit the actuator's anchor eye to the guard cheek's tab and its rod eye to "
             "the guard plate's pin, each on its M6 shoulder bolt, nut inside. Drive it to the head's level "
             "position before you let go: the head is nose-heavy or tail-heavy depending on the pose.",
             reach=F.ELEV_EYE_MM - 2.5),
        Step("Deck, battery and stepper driver carrier", ["base_deck", "battery", "stepper_driver_carrier"],
             [("M5 x 12 button head", 10), ("M5 T-nut (slot 6)", 10),
              ("25 mm hook-and-loop strap, 600 mm (battery)", 1), ("M3 x 16 screw + nut (stepper driver carrier)", 4)],
             "3 mm and 2.5 mm hex keys",
             "Bolt the deck onto the side rails' top slots (ten M5 x 12 into T-nuts). Strap the battery down through "
             "the two slots, terminals toward the electronics. Screw the stepper driver carrier to the deck's M3 grid "
             "(four M3 x 16, nuts below), terminals to +y."),
        Step("Hopper posts and braces", ["hopper_post_rear", "hopper_post_front", "hopper_brace_x", "hopper_brace_y"],
             [("M5 x 16 button head (hopper)", 8), ("2020 corner bracket with M5 screws and T-nuts", 6)],
             "3 mm hex key, a second person",
             "Tap both core bores of each end of the four posts M5. Stand each on the deck and screw it down from "
             "under the deck (two M5 x 16 into its bores); the rear pair are the taller ones. Bolt the two x braces "
             "outside each side pair and the y brace behind the rear pair with a corner bracket at each end; leave "
             "them finger-tight until the shelf is on."),
        Step("Hopper shelf, sleeve socket and take-up sleeve", ["hopper_shelf", "hopper_spigot", "take_up_sleeve",
                                                                "take_up_spring_bracket", "take_up_spool",
                                                                "take_up_spring"],
             [("M5 x 16 button head (hopper)", 8), ("M4 x 12 socket cap screw (spigot)", 4),
              ("M4 x 12 button head (spring bracket)", 2),
              (f"M4 x {p.spring_axle_len:g} socket cap screw + nyloc nut (spring axle)", 1)],
             "3 mm and 2.5 mm hex keys, 7 mm spanner",
             "Screw the sleeve socket under the shelf's outlet hole (four M4 x 12 from above into its flange). Seat "
             "the constant-force spring's coil on the printed spool, band leaving the coil's front at the bottom, "
             "and hold the spool between the spring bracket's cheeks while the M4 axle goes through both cheeks and "
             "the spool; snug the nyloc so the spool still spins. Screw the bracket up under the shelf behind the "
             "socket (two M4 x 12 button heads from above into its inserts): the band should hang straight down past "
             "the socket's rear, clear of it. Lift the shelf onto the posts and screw it down into their top bores "
             "(two M5 x 16 each); the posts' tops are level, so shim each post's rear edge to the shelf's slope. Now "
             "tighten the braces. Push the take-up sleeve up into the socket, slot to the rear, and tape the band to "
             "the sleeve for now.", loose=["take_up_spring"]),
        Step("Agitator and tub", ["hopper_agitator_mount", "agitator_motor", "hopper_agitator", "hopper_tub"],
             [("M3 x 10 socket cap screw (agitator)", 4), ("M4 x 12 button head (agitator)", 3),
              ("M3 x 6 set screw + M3 heat-set insert", 1), ("25 mm strap, 1 m", 2)],
             "2.5 mm and 1.5 mm hex keys, soldering iron",
             "Screw the gearmotor's face to the mount (four M3 x 10 from the counterbores) and bolt the mount up under "
             "the shelf's small hole (three M4 x 12 from above). Cut the tub's two holes to match the shelf's, set "
             "it on and strap it down. Melt the M3 insert into the agitator's boss, push the agitator on the shaft "
             "through the tub's hole, a ball's radius over the floor, and tighten the set screw on the flat.",
             reach=1.5),
        Step("Feed hose and take-up collar", ["feed_hose", "take_up_collar"],
             [("Flexible-PVC adhesive or epoxy", 1), ("Hose clamp, 80-90 mm", 1),
              ("M3 x 8 pan head screw (spring band)", 1)], "screwdriver",
             "Bond the hose's top end 25 mm into the collar and let it cure. Slide the collar up the sleeve, tab "
             "through the slot, pull the spring's band down to the tab and screw its end to the tab's rear face "
             "(one M3 x 8 pan head into a 2.5 mm pilot). Push the hose's lower end over the roof "
             "column's socket and clamp it. Swing the head through its whole range: the hose must not kink or pull "
             "the collar out of the sleeve's bottom.", image=False, reach=1.5),
        Step("Net poles and camera bar", ["pole_foot", "net_pole_vertical", "pole_elbow", "net_pole_top",
                                          "camera_clamp", "camera_bar"],
             [("M5 x 12 button head (pole feet)", 4), ("M5 T-nut (slot 6)", 4),
              ("M4 x 25 socket cap screw (camera clamps)", 2), ("Knotless netting, 25-35 mm mesh", 1),
              ("Global-shutter camera module + cable", 2)], "long 3 mm hex key, 3.3 mm drill, a second person",
             "Screw each pole foot onto the net beam's top slot at its end (two M5 x 12 down the counterbores into "
             "T-nuts). Join the poles with the elbows on the ground, thread the two camera clamps onto the top "
             "pole, and stand the frame up into the feet. Slide the camera bar into the clamps; drill 3.3 mm "
             "through each clamp's wall into the pole socket and drive an M4 x 25 in as a pinch screw. Hang the "
             "netting from the top pole, mount the two cameras on the bar, and leave the net's bottom edge free for "
             "the trough."),
        Step("Catch trough", [*(f"trough_hanger_{'abcdefghij'[k]}" for k in range(hangers)), "trough_sump",
                              "trough_gutter_a", "trough_gutter_b"],
             [("M5 x 12 button head + T-nut (trough)", 2 * hangers), ("M5 x 40 button head + T-nut (sump)", 2),
              ("Half-round gutter end cap, 125 mm class", 2), ("Zip ties, 4.8 mm (trough)", hangers)],
             "long 3 mm hex key",
             "Each hanger is its own height: match its letter to the y in its notes. Bolt the hangers to the net "
             "beam's front slots (two M5 x 12 down each counterbore into T-nuts) and the sump by its rear tab (two "
             "M5 x 40, heads in the cavity). Cap each gutter run's outer end, lay the runs in the saddles with their "
             "low ends in the sump's saddles, and zip-tie each into its hanger. Lace the net's bottom edge to the "
             "gutters' back lips."),
        Step("Lift boot and drive (on the bench)",
             ["lift_boot", "lift_shaft_bearing", "lift_shaft", "lift_slip_collar", "lift_slip_plate",
              "lift_slip_facing", "lift_slip_spring", "lift_pulley[0]", "lift_shaft_coupler", "lift_motor_spacer",
              "lift_motor"],
             [("M3 x 6 screw (lift)", 6), ("M3 x 10 socket cap screw + M3 heat-set insert (lift)", 2)],
             "arbor press or vice, 2.5 and 1.5 mm hex keys, luggage scale",
             "Press the two flanged bearings into the boot (cad/README.md, \"Lift drive shaft\"). Build the slip hub "
             "on the drive shaft through the boot: collar, plate, facing, the pulley, facing, plate, four disc "
             "springs cone to cone, collar; set it to slip at 0.9 N m as the slip plates' notes say. Screw the "
             "gearmotor's face to the spacer's end wall (six M3 x 6 from inside), fit the coupling, and fix the "
             "spacer's ears to the boot (two M3 x 10 into inserts).", new_subassembly=True,
             reach=1.0),
        Step("Lift base plate and boot on the mast rails", ["lift_base_plate"],
             [("M5 x 12 button head + T-nut (lift)", 8), ("2040 corner bracket with M5 screws and T-nuts (lift)", 2)],
             "3 mm hex key",
             "Bolt the base plate across the mast rails at the lift (four M5 x 12 into T-nuts), then hang the boot "
             "under it on the four inner M5s. The boot's inlet arm butts against the sump's outlet stub at the net "
             "beam's rear face: glue or strap the joint."),
        Step("Lift column, belt, head and chute",
             ["lift_spine", "lift_rod", "lift_clip", "lift_belt", "lift_flight_cap", "lift_pulley[1]", "lift_head",
              "lift_jack_screw", "lift_strut", "lift_chute"],
             [("M5 x 12 button head + T-nut (lift)", 2 * clips + 4),
              ("2020 corner bracket with M5 screws and T-nuts (lift)", 2),
              ("8 mm axle, 60 mm, + two 608 bearings + e-clips", 1),
              ("PU cleat welding by the belt supplier (flights)", flights),
              ("M3 x 12 countersunk screw + nut (flight caps)", 2 * flights),
              ("UHMW-PE tape, 25 mm wide, self-adhesive", 1)],
             "3 mm hex key, 8 mm spanner, a second person",
             "Stick the UHMW tape on both 20 mm faces of the spine. Stand the spine in the boot's slot through the "
             "base plate and square it with the two 2040 corner brackets. Screw a flight cap to each welded cleat "
             f"(two M3 x 12 countersunk, {2 * flights} in all). Loop the belt over the bottom pulley and up the spine, "
             f"fit the {clips} rod clips up the spine with the three rods through them, then the head on the spine's "
             "top with the top pulley on its axle inside the belt loop. Tension with the jack screws to the figure "
             "in their notes, then tighten the head's four side M5s. Brace the spine to the front hopper post with "
             "the strut and push the chute into the head's socket over the tub.", reach=1.0),
        Step("Wiring: deck-side cables and the elevation lead",
             ["cable_clamp", "deck_cable_main", "deck_cable_stepper", "deck_cable_lift", "deck_cable_saddle",
              "deck_cable_hanger", "elev_lead_fixed", "elev_lead"],
             [("M5 x 16 button head + nyloc nut (deck cables)", 2 * len(ties["deck"])),
              ("M5 x 10 button head + T-nut (deck cables)", 2 * len(ties["post"]) + len(ties["crossbar"])),
              ("M5 x 12 button head + T-nut (cable clamp)", 1)],
             "3 mm hex key, 8 mm spanner, crimp tool",
             "Bolt the axis cable clamp to the crossbar's front slot (one M5 x 12 into a T-nut; the head drops into "
             "the pocket on top). Route the deck-side run as the manifest's cables line says: deck saddles (nylocs "
             "under the deck), the rear post's saddles, the crossbar hangers, up into the clamp's bore, then the "
             "twisting run to the gland with no ties on it. Run the elevation lead out of the gland's -y wall, "
             "across under the pivot and through the cheek's grommet to its tie on the actuator's body.", reach=12.0),
    ]
    used = {item for s in st for item, _ in s.fasteners}
    electronics = [(n, q) for n, q, _ in F.fasteners(p) + F.COTS_EXTRA if n not in used]   # the rest: wiring and boards
    st += [
        Step("Electronics", [], electronics, "screwdrivers, crimp tool, multimeter, soldering iron",
             "Mount and wire everything to hardware/electronics.md (pin map, power budget, fuses, e-stop, reset "
             "and precharge chain, lift jam cutoff) and the manifest's power and cables lines. Set the stepper "
             "driver's current and microsteps as the carrier's notes say. Put the ballast where the manifest's "
             "tip-over line says.", image=False),
        Step("Before the first power-up", [], [], "multimeter",
             "With the main fuse out: check the e-stop and the wireless remote each open the contactor's coil "
             "circuit, that RESET must be pressed and let go before anything moves, and that there is no short from "
             "battery positive to the frame. Then fit the fuse with the head level and nobody in front of the "
             "wheels, home the azimuth (the bracket's slots let you move the switch so it clicks mid-lobe), and run "
             "the lift empty. Read hardware/safety.md before it throws a ball.", image=False),
    ]
    return st


def other_checks(p: Feeder) -> list[str]:
    return [
        "- Every placement of every placed part is fitted in exactly one step, and the steps use every bought line",
        "  of the BOM to the unit.",
        "- Every part a step adds touches something fitted before it, within the step's allowance where a link is not",
        "  modelled (a motor shaft, a clevis eye, a sliding fit). Two steps start sub-assemblies on the bench; the",
        "  take-up spring is named as not yet mounted in the CAD.",
        "- The screws marked access go in along their axis: nothing of the parts they clamp lies within 60 mm",
        "  behind their heads (a counterbore closed at its far end fails).",
        f"- Every screw into an extrusion's end lands on one of its core bores, {CORE_OFFSET:g} mm either side of the",
        "  end's centre along the 40 mm side.",
    ]


# ------------------------------------------------------------------------ joints

def _hw(p: Feeder, x: float, z: float) -> tuple[float, float, float]:
    """A head-frame (x, z) point as world (x, 0, z)."""
    return (p.head_x + x, 0.0, p.launch_z + z)


def joints(p: Feeder) -> list[Joint]:
    zf = p.floor_top - p.feed_floor_t / 2
    zr = p.roof_bottom + p.feed_floor_t / 2
    so_x, so_z = F._standoffs(p)[0]
    leg_x, leg_z = F.SERVO_LEGS[0]
    tab_x, tab_y = F.servo_tab_screw(p)
    plate_out = p.plate_half_y + p.plate_t
    cheek_in = plate_out + p.cheek_gap
    cheek_out = cheek_in + p.plate_t
    fx, fy = F._foot_xy(p)[0]
    deck_x = -(p.base_depth - 30.0) + 30.0
    hw = p.base_half_w - p.rail_w / 2
    wx = p.wheel_x[0]
    sx, sy = F._stop_holes(p)[0]
    hx, hy = F._home_bracket_holes(p)[0]
    mx, my = F._az_motor_holes(p)[0]
    gx, gy = F._az_bolts(p)[1]
    post_x, post_y = F._post_xy(p)[0]
    hp_y = p.shelf_post_y
    shelf = _shelf(p)
    ax, ay = p.agit_xy
    bx, by = F._ring(p.agit_mount_bolt_r, 3, 90)[0]
    spig = Location((p.hopper_out_x, 0, p.hopper_out_z), (0, p.shelf_slope_deg, 0))
    kx, ky = F._ring(F.SPIGOT_BOLT_R, 4, 45)[0]
    spring_x = F.spring_screws(p)[0]
    saddle_x, saddle_y = F.deck_cable_saddle_holes(p)[0]
    clamp = F.cable_clamp_screw(p)
    foot = F.pole_foot_screws(p)[0]
    return [
        Joint("head standoff", "M5 x 12 button head", 12, 5, "standoff", _hw(p, so_x, so_z), "y", plate_out, -1,
              2.75, 4.75, "head_standoff", STANDOFF_THREAD),
        Joint("feed floor through the head plate", "M4 x 12 socket cap screw (feed)", 12, 4, "insert",
              _hw(p, -220.0, zf), "y", plate_out, -1, 2.2, 3.5, "feed_floor", F.FEED_PILOT_DEPTH, gap=p.feed_clear),
        Joint("feed roof through the head plate", "M4 x 12 socket cap screw (feed)", 12, 4, "insert",
              _hw(p, -220.0, zr), "y", plate_out, -1, 2.2, 3.5, "feed_roof_column", F.FEED_PILOT_DEPTH,
              gap=p.feed_clear),
        Joint("servo bracket leg", "M4 x 12 socket cap screw (servo legs)", 12, 4, "insert", _hw(p, leg_x, leg_z),
              "y", p.plate_half_y, 1, 2.2, 3.5, "shuttle_servo_bracket", F.SERVO_LEG_POCKET),
        Joint("servo tab", "M4 x 10 socket cap screw (servo tabs)", 10, 4, "insert", _hw(p, tab_x, p.shuttle_zc), "y",
              tab_y, -1, 2.2, 3.5, "shuttle_servo_bracket", F.SERVO_CRADLE_T),
        Joint("cheek foot to turntable plate", "M4 x 12 socket cap screw", 12, 4, "insert", (fx, fy, 0.0), "z",
              p.turntable_top - p.plate_t, 1, 2.2, 3.5, "cheek_foot", F.CHEEK_FOOT_V),
        Joint("cheek to cheek foot", "M4 x 12 socket cap screw", 12, 4, "insert",
              (fx, 0.0, p.turntable_top + 30.0), "y", cheek_in, 1, 2.2, 3.5, "cheek_foot", F.CHEEK_FOOT_W),
        Joint("gear sector under the turntable plate", "M4 x 12 socket cap screw (azimuth)", 12, 4, "insert",
              (gx, gy, 0.0), "z", p.turntable_top, -1, 2.2, 3.5, "az_gear_sector", p.az_gear_face_mm),
        Joint("azimuth stop block", "M4 x 12 socket cap screw (stops)", 12, 4, "insert", (sx, sy, 0.0), "z",
              p.mast_top_z, 1, 2.2, 3.5, "az_stop_block", F.STOP_POCKET),
        Joint("azimuth stepper flange", "M3 x 8 screw (azimuth stepper)", 8, 3, "tapped", (mx, my, 0.0), "z",
              p.mast_top_z + p.plate_t, -1, 1.7, 2.75, "az_stepper", NEMA17_THREAD),
        Joint("home switch bracket", "M3 x 12 socket cap screw + washer + nut (home switch)", 12, 3, "nut",
              (hx, hy, 0.0), "z", p.mast_top_z + p.plate_t + p.home_bracket_t, -1, 1.7, 2.75,
              nut_h=M3_NUT_H, extra=WASHER[3]),
        Joint("head pivot", "M8 x 120 bolt + nyloc nut + 4 washers", 120, 8, "nut", (p.head_x, 0.0, p.pivot_z), "y",
              cheek_out, -1, 4.3, 6.5, extra=2 * WASHER[8], far="trunnion_cheek_elev"),
        Joint("deck to side rail", "M5 x 12 button head", 12, 5, "tnut", (deck_x, hw, 0.0), "z",
              p.rail_top + p.plate_t, -1, 2.75, 4.75, "side_rail"),
        Joint("drive bracket to side rail", "M5 x 12 button head", 12, 5, "tnut",
              (wx - 15.0, 0.0, p.rail_z + p.rail_h / 2), "y", p.base_half_w + p.bracket_t, -1, 2.75, 4.75,
              "side_rail"),
        Joint("mast post to mast rail", "M5 x 50 button head (mast posts)", 50, 5, "tapped",
              (post_x, post_y + CORE_OFFSET, 0.0), "z", p.rail_z, 1, 2.75, 4.75, "mast_post", END_TAP_DEPTH),
        Joint("mast plate to mast post", "M5 x 12 button head", 12, 5, "tapped",
              (post_x, post_y + CORE_OFFSET, 0.0), "z", p.mast_top_z + p.plate_t, -1, 2.75, 4.75, "mast_post",
              END_TAP_DEPTH),
        Joint("hopper post to deck", "M5 x 16 button head (hopper)", 16, 5, "tapped",
              (p.post_rear_x, hp_y + CORE_OFFSET, 0.0), "z", p.rail_top, 1, 2.75, 4.75, "hopper_post_rear",
              END_TAP_DEPTH),
        Joint("sleeve socket under the shelf", "M4 x 12 socket cap screw (spigot)", 12, 4, "insert", (0, 0, 0),
              spig * Location((kx, ky, 0)), p.plate_t, -1, 2.2, 3.5, "hopper_spigot", F.SPIGOT_POCKET),
        Joint("spring bracket under the shelf", "M4 x 12 button head (spring bracket)", 12, 4, "insert", (0, 0, 0),
              spig * Location((spring_x, 0, 0)), p.plate_t, -1, 2.2, 3.8, "take_up_spring_bracket", F.SPRING_POCKET),
        Joint("agitator motor mount under the shelf", "M4 x 12 button head (agitator)", 12, 4, "insert", (0, 0, 0),
              shelf * Location((ax + bx, ay + by, 0)), p.plate_t, -1, 2.2, 3.8, "hopper_agitator_mount",
              F.AGIT_POCKET),
        Joint("trough hanger to net beam", "M5 x 12 button head + T-nut (trough)", 12, 5, "tnut",
              (0.0, p.trough_hanger_y[0], p.rail_z + 10.0), "x", F.TROUGH_WEB, -1, 2.75, 4.75, "net_beam",
              access=True),
        Joint("sump tab to net beam", "M5 x 40 button head + T-nut (sump)", 40, 5, "tnut",
              (0.0, p.sump_y, p.rail_z + 10.0), "x", p.trough_x0 + p.sump_wall, -1, 2.75, 4.75, "net_beam"),
        Joint("pole foot to net beam", "M5 x 12 button head (pole feet)", 12, 5, "tnut", (foot[0], foot[1], 0.0),
              "z", p.rail_top + F.POLE_FOOT_FLOOR, -1, 2.75, 4.75, "net_beam", access=True),
        Joint("cable clamp to crossbar", "M5 x 12 button head + T-nut (cable clamp)", 12, 5, "tnut",
              (0.0, 0.0, p.cable_clamp_z), "x", clamp, -1, 2.75, 4.75, "cable_crossbar"),   # head drops in from above
        Joint("deck cable saddle", "M5 x 16 button head + nyloc nut (deck cables)", 16, 5, "nut",
              (saddle_x, saddle_y, 0.0), "z", p.rail_top + p.plate_t + p.deck_saddle_base / 2, -1, 2.75, 4.75),
    ]


def end_bore_problems(p: Feeder, parts) -> list[str]:
    """Each screw into an extrusion's end (mast plate and mast rail into the mast posts, deck and shelf into the
    hopper posts) lands on one of the end's two core bores. Read from the holes the laser parts actually have."""
    bad = []
    by = {pt.name: pt for pt in parts}

    def holes(part, d):
        flat = by[part].flat
        out = []
        for w in flat.faces()[0].inner_wires():
            bb = w.bounding_box()
            if abs(bb.size.X - d) < 0.05 and abs(bb.size.Y - d) < 0.05:
                out.append(((bb.min.X + bb.max.X) / 2, (bb.min.Y + bb.max.Y) / 2))
        return out

    def check(plate, d, posts, to_plate):
        hs = holes(plate, d)
        for name, (x, y) in posts:
            cores = [to_plate(x, y + s * CORE_OFFSET) for s in (-1, 1)]
            centre = to_plate(x, y)
            got = [c for c in cores if any(math.dist(c, h) < 0.3 for h in hs)]
            if any(math.dist(centre, h) < 0.3 for h in hs):
                bad.append(f"{plate}: a hole at {name}'s end centre ({x:.0f}, {y:.0f}) lands on the web between "
                           "its core bores")
            if len(got) != 2:
                bad.append(f"{plate}: {len(got)} of {name}'s two core bores at ({x:.0f}, {y:.0f}) have a hole over them")

    ident = lambda x, y: (x, y)  # noqa: E731
    check("mast_plate", 5.5, [("mast_post", xy) for xy in F._post_xy(p)], ident)
    check("base_deck", 5.5, [(n, xy) for n, xy in zip(["hopper_post"] * 4, F._shelf_posts(p))], ident)
    s = math.radians(p.shelf_slope_deg)
    cx, _ = p.shelf_origin
    check("hopper_shelf", 5.5, [("hopper_post", xy) for xy in F._shelf_posts(p)],
          lambda x, y: ((x - cx) / math.cos(s), y))
    return bad
