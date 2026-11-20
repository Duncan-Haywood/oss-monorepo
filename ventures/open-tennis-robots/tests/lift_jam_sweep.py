"""The lift's jam cutoff on the simulated feeder (2026-11-15; cad/README.md "Lift jam cutoff").

    PYTHONPATH=src python3 tests/lift_jam_sweep.py           # everything
    PYTHONPATH=src python3 tests/lift_jam_sweep.py --belt    # belt stretch only
    PYTHONPATH=src python3 tests/lift_jam_sweep.py --duty    # duty held to the battery against the fixed duty
    PYTHONPATH=src python3 tests/lift_jam_sweep.py --sense   # high-side sense against the low-side shunt it replaced
    PYTHONPATH=src python3 tests/lift_jam_sweep.py --chain   # the belt as a chain of masses against lumped and rigid
    PYTHONPATH=src python3 tests/lift_jam_sweep.py --wear    # the facings' thickness loss off the disc stack's curve

The real firmware (main.py's FeederHw and controller.LiftRun, through tests/feeder_sim.py) drives the lift's MOSFET
and reads the comparator on GPIO 0 every 10 ms tick. Between its 1 ms steps this file integrates the plant at 0.1 ms:
the gearmotor as a DC motor at its output shaft (cad `Feeder.lift_motor_model`: winding resistance, inductance,
torque and back-EMF constants, the rotor's inertia through the gearbox plus the belt, caps and balls), the belt's
load (every flight loaded, or an empty belt), the flyback diode when the MOSFET is off, the shunt (high side since
2026-11-15, inside the diode's loop, so it sees the motor's current all cycle; `--sense` compares the low-side shunt
in the MOSFET's source, which sees it only while the MOSFET conducts), the 1 ms RC filter and the comparator at a trip current. With the MOSFET off, the diode also brakes the belt when its
loaded strand's weight drives the motor backwards.

A jam is a ball caught between a flight and the boot (at the drive pulley: the ball's own stiffness, from the ITF's
deformation test) or the hood (at the top pulley: the ball in series with 2.36 m of belt). Corners: the pack at the
charger's 29.2 V with a cold winding (most current and force) and at the 24 V cut with the winding 80 K over ambient
(least current: hardest to trip); the trip current at the low and high ends of its tolerance; the rotor's inertia
at half, one and two times the assumed figure. Every motor and belt figure is an assumption (cad params); the
firmware is real.

Since 2026-11-15 (cad/README.md "Lift coupling dynamics") the drive is three inertias by default: the rotor through
the gearbox, then the jaw coupling as a spring with free play (`Feeder.lift_coupler_model`: stiffness, gap, the
spider's damping), then the drive shaft with its coupling hub, plates and collars, then the slip hub, then the pulley
and belt. The mechanics step at 12.5 us there, since the light shaft against the coupling rings near 1 kHz. A loaded
belt at rest sits on the coupling's drive face; an empty one is put on the far face, so a start crosses the whole gap.
The firmware's soft start (config LIFT_RAMP_MS) is on; `_ramped(0)` switches it off. `coupler=None` gives the
two-inertia plant as first landed, and `slip=None` with it the rigid drive before the slip hub.

Since 2026-11-15 later (cad/README.md "Lift belt stretch") `belt=` adds the belt's stretch as a fourth inertia: the
pulley keeps part of the belt's inertia, the rest is a lumped mass on the two strands (`Feeder.lift_belt_model`), the
slack strand can go slack, a hood jam presses that mass and a boot jam the pulley. `belt=None`, the default, keeps the
belt rigid; `--belt` prints only that comparison.

Reported: for a start with every flight loaded, whether it tripped and how long the comparator stayed on; for a jam,
the time from the ball's contact to the motor's cut, the peak force on the flight, the energy put into the winding
over the 6 s after contact and when the lift gave up (FLAG_LIFT_JAM); and the same jam with the cutoff disabled. Over
the coupling's stiffness and play: the largest torque through it and whether a start slipped the hub, switched and
soft-started, loaded and empty; and the jam's peak and the coupling's torque.
"""

import math
import os
import sys

HERE = os.path.dirname(__file__)
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "cad"))
from feeder_sim import SimFeeder  # noqa: E402
from otr_cad.params import Feeder  # noqa: E402
from tennisbots import protocol as P  # noqa: E402

DT = 1e-4
SUB = 10                     # plant steps per firmware millisecond
MECH_SUB = 8                 # mechanical sub-steps per plant step with the jaw coupling in (12.5 us)
DIODE_V = 0.7
BALL_ZETA = 0.1              # a ball's damping ratio on the jam's spring (rebound about 0.75)
CORNERS = (("29.2 V cold", 29.2, 0.0), ("24 V hot", 24.0, 80.0))
INERTIAS = (0.5, 1.0, 2.0)
TRIPS = ("lo", "hi")
WHERE = ("boot", "hood")
FEEDER_KW = {}               # Feeder overrides for `start` and `jam` (`sense_report` swaps in the low-side sense)
LOW_SIDE = {"lift_sense_side": "low", "lift_shunt_ohm": 0.05, "lift_sense_r2": 2.4e3, "lift_shunt_w": 3.0}


class Plant:
    """`slip`: None for a rigid drive (the pulley keyed to the gearmotor's shaft, as before 2026-11-15), "lo", "nom"
    or "hi" for the slip hub at the low end, middle or high end of its set torque (`Feeder.lift_slip_design`), or a
    sticking torque in N m (`wear_report`: a worn hub off the disc stack's curve, `Feeder.lift_slip_wear`)."""

    def __init__(self, p: Feeder, volts, rise_k, j_factor=1.0, trip="lo", loaded=True, slip="nom", coupler="nom",
                 belt=None, chain=None):
        m = p.lift_motor_model()
        c = p.lift_jam_cutoff()
        self.p, self.m = p, m
        self.v = volts
        self.r_w = m["winding_ohm"] * (1 + 0.00393 * rise_k)
        self.r = self.r_w + m["lead_ohm"] + p.lift_shunt_ohm
        self.l = m["l_h"]
        self.kt, self.ke = m["kt"], m["ke"]
        self.t_f = m["kt"] * p.lift_motor_noload_a                     # no-load loss as friction at the output
        self.j_m = p.lift_rotor_kgm2 * j_factor * p.lift_gear_ratio ** 2
        self.j_b = m["moving_kg"] * m["r_m"] ** 2
        self.j = self.j_m + self.j_b
        self.rp = m["r_m"]
        if slip is None:
            self.t_stick = self.t_slide = math.inf
        else:
            t = slip if isinstance(slip, (int, float)) else \
                p.lift_slip_nm * {"lo": 1 - p.lift_slip_tol, "nom": 1.0, "hi": 1 + p.lift_slip_tol}[slip]
            self.t_stick, self.t_slide = t, t * p.lift_slip_kinetic
        self.locked = True
        self.wb = 0.0                # belt side's speed (the same as the motor side's, w, while the hub is stuck)
        self.slid_ms = 0.0
        self.slide_j = 0.0
        d = p.lift_design()
        self.t_load = (d["pull_n"] if loaded else 0.1 * d["pull_n"]) * self.rp
        self.trip_v = c["trip_lo_a" if trip == "lo" else "trip_hi_a"] * p.lift_shunt_ohm
        self.rc = p.lift_sense_rc_s
        self.i = self.w = self.s = self.vf = 0.0
        self.k = 0.0
        self.s_jam = None
        self.c_damp = 0.0
        self.force = 0.0
        self.winding_j = 0.0
        # The jaw coupling (2026-11-15, `Feeder.lift_coupler_model`): None keeps the rotor keyed straight to the shaft
        # (the two-inertia plant as first landed); "nom" takes the assumed stiffness and backlash; (k N m/rad, gap
        # degrees) sets them. With a coupling the shaft's own inertia sits between it and the hub, and the plant's
        # mechanics step at DT / MECH_SUB, since the shaft against the coupling alone rings at about 0.6-1.3 kHz.
        self.coupled = coupler is not None
        self.coupler_nm = 0.0          # largest torque through the coupling
        self.reversals = 0             # the jaws leaving one face and striking the other (the spider hammered)
        self.free_ms = 0.0             # time with the jaws inside the gap, touching neither face
        if self.coupled:
            cm = p.lift_coupler_model()
            k, gap = (cm["k_nm_rad"], cm["backlash_rad"]) if coupler == "nom" else (coupler[0], math.radians(coupler[1]))
            self.kc, self.half_gap = k, gap / 2
            self.j_s = cm["j_shaft"]
            j_load = self.j_s + self.j_b
            self.cc = 2 * cm["zeta"] * math.sqrt(k * self.j_m * j_load / (self.j_m + j_load))
            # twist, rotor less shaft. A loaded belt at rest has rolled back onto the drive face (its weight holds the
            # shaft against the rotor); an empty one may rest anywhere, worst on the far face, so a start crosses the gap.
            self.phi = self.half_gap if loaded else -self.half_gap
            self.ws = 0.0
            self._face = 1 if loaded else -1      # the face the jaws last touched
        # The belt's stretch (2026-11-15, `Feeder.lift_belt_model`): None keeps the belt rigid; a number is c_spec as a
        # share of `lift_belt_cspec_n` (1.0 the assumed figure). Needs the coupling. The pulley side keeps
        # (1 - 4/pi^2) of the belt's inertia; the rest is a lumped mass on the two strands, which start stretched to
        # carry the belt's load (a loaded strand's weight holds it there at rest).
        self.elastic = belt is not None
        self.belt_n = 0.0              # largest net pull the strands put on the belt's mass
        self.slack_ms = 0.0            # time with the slack strand at zero tension
        if self.elastic:
            assert self.coupled, "belt stretch needs the coupling's plant"
            bm = p.lift_belt_model(belt)
            self.bm = bm
            self.ks, self.t0 = bm["k_strand_n_m"], bm["t0_n"]
            self.j_b = bm["j_pulley"]                 # the hub's belt side is now the pulley's share alone
            self.j_v = bm["j_mass"]
            m_v = self.j_v / self.rp ** 2
            self.cb = 2 * bm["zeta"] * math.sqrt(2 * self.ks * m_v)
            self.e = self.t_load / self.rp / (2 * self.ks)   # stretch, m: the two strands share the load
            self.wv = 0.0
            self.sv = 0.0

        # The belt as a chain (2026-11-15 later, `Feeder.lift_belt_chain`, the loop `lift_belt_axial_modes` solves):
        # None keeps the lumped or rigid belt above; a dict {"cspec": share of c_spec, "every": a ball on every n-th
        # up-strand flight} runs the loop as point masses two to a flight pitch on springs, both ends on the drive
        # pulley. Each segment's tension is floored at zero (it goes slack locally, not a whole strand at once). The
        # balls' pull (weight, rod and strip friction) acts on their own flights: the rated pull with a ball on every
        # flight, half with every other. The belt's and flights' weight acts down each strand. An empty belt carries a
        # tenth of the pull spread over the up strand's flights, as the rigid plant's 0.1. Damping: each node is
        # dragged towards the pulley's speed in proportion to its mass, at the rate that gives the first stuck mode
        # `lift_belt_zeta` (higher modes get less; a per-segment dashpot that damped the first mode as much would be
        # unstable at this step). A hood jam presses the up strand's top node; a boot jam the pulley.
        self.chained = chain is not None
        self.seg_max_n = 0.0           # largest tension in any segment
        if self.chained:
            assert self.coupled and not self.elastic, "the chain needs the coupling's plant and no lumped belt"
            g = 9.81
            ch = p.lift_belt_chain(chain.get("every", 1), chain.get("cspec", 1.0), True, nodes_per_pitch=2)
            self.ch = ch
            nn = ch["n"] - 1
            self.ck = ch["k_n_m"]
            self.cm = list(ch["mass"])
            self.top = ch["top_node"]
            self.t0 = p.lift_tension_design()["t0_n"]
            self.j_b = ch["m_wrap_kg"] * self.rp ** 2           # the hub's belt side: the drive pulley's half wrap
            # the rated pull (`lift_design`'s, as the rigid plant takes it) with a ball on every flight; every other halves it
            full = len(p.lift_belt_chain(1, nodes_per_pitch=2)["ball_nodes"])
            pull = self.t_load / self.rp * (len(ch["ball_nodes"]) / full if loaded else 1.0)
            ball_kg = p.ball_g / 1000
            ext = [0.0] * nn
            up, down = set(ch["up_nodes"]), set(ch["down_nodes"])
            balls = ch["ball_nodes"] if loaded else ch["up_flight_nodes"]
            for i in range(nn):
                m_own = self.cm[i] - (ball_kg if (loaded and i in ch["ball_nodes"]) else 0.0)
                ext[i] = -m_own * g if i in up else (m_own * g if i in down else 0.0)
            for i in balls:
                ext[i] -= pull / len(balls)
            self.cext = ext
            f1 = [f for f in p.lift_belt_axial_modes(chain.get("every", 1), chain.get("cspec", 1.0),
                                                     nodes_per_pitch=2)["modes_hz"] if f > 1.0][0]
            self.f1 = f1
            self.calpha = 2 * p.lift_belt_zeta * 2 * math.pi * f1
            # at rest: T[j+1] = T[j] - ext[j], the strands at the drive pulley averaging T0 (`lift_strand_tension`'s
            # convention: T0 - P / 2 and T0 + P / 2 there, each strand's weight on top going up)
            t = [0.0] * (nn + 1)
            for j in range(nn):
                t[j + 1] = t[j] - ext[j]
            shift = self.t0 - (t[0] + t[nn]) / 2
            t = [x + shift for x in t]
            # the loop's length is fixed, so its stretches sum to zero: the reference tension is their mean
            self.t0 = sum(t) / len(t)
            u, acc = [0.0] * nn, 0.0
            for i in range(nn):
                acc += (t[i] - self.t0) / self.ck
                u[i] = acc
            self.cu, self.cv = u, [0.0] * nn

    def coupler_torque(self):
        """Torque the coupling passes from the rotor to the shaft: the spider's spring past the gap, its damping only
        while the jaws touch, and never pulling a face it is leaving."""
        g = self.half_gap
        if self.phi > g:
            return max(0.0, self.kc * (self.phi - g) + self.cc * (self.w - self.ws))
        if self.phi < -g:
            return min(0.0, self.kc * (self.phi + g) + self.cc * (self.w - self.ws))
        return 0.0

    def jam(self, where):
        k_ball = self.p.ball_k_n_m
        self.where = where
        if where == "boot" or self.elastic or self.chained:   # elastic or chained: the stretch to the hood is in the plant
            k = k_ball
        else:
            k_belt = self.p.lift_belt_cspec_n / (self.p.lift_design()["centre_mm"] / 1000)
            k = 1 / (1 / k_ball + 1 / k_belt)
        self.k = k
        self.c_damp = 2 * BALL_ZETA * math.sqrt(k * self.j / self.rp ** 2)
        if self.chained and where == "hood":
            self.s_jam = self.cu[self.top]
        else:
            self.s_jam = self.sv if (self.elastic and where == "hood") else self.s

    def belt_force(self):
        """Net pull of the two strands on the belt's mass: T0 + k e on the tight one less T0 - k e on the slack one,
        each floored at zero, plus the belt's own damping on the stretch rate."""
        tight = max(0.0, self.t0 + self.ks * self.e)
        slack = max(0.0, self.t0 - self.ks * self.e)
        return tight - slack + self.cb * (self.wb - self.wv) * self.rp, slack == 0.0

    def step(self, duty):
        self.last_duty = duty
        on = duty > 0
        if on:
            vm = self.v * duty
            self.i = (self.i + DT / self.l * (vm - self.ke * self.w)) / (1 + DT * self.r / self.l)
        else:
            # the flyback diode across the motor: it carries the winding's current down to zero after a cut, and it
            # conducts again when the belt drives the motor backwards (the loaded strand's weight), which brakes it
            # (high side the shunt is inside that loop; low side, in the MOSFET's source, it is not)
            r_loop = self.r - (0.0 if self.p.lift_sense_side == "high" else self.p.lift_shunt_ohm)
            self.i = max(0.0, (self.i + DT / self.l * (-DIODE_V - self.ke * self.w)) / (1 + DT * r_loop / self.l))
        self.winding_j += self.i * self.i * self.r_w * DT
        f = 0.0
        if self.s_jam is not None and self.s > self.s_jam and not self.coupled:   # coupled: per sub-step below
            f = max(0.0, self.k * (self.s - self.s_jam) + self.c_damp * self.wb * self.rp)
        self.force = f
        t_m = self.kt * self.i                    # the motor's torque at the gearbox's output
        t_b = -self.t_load - f * self.rp          # what the belt side has on it besides the hub
        if self.coupled:
            self._step_coupled(t_m)
        elif self.locked:
            drive = t_m + t_b
            if abs(self.w) < 1e-3 and abs(drive) <= self.t_f:
                a = -self.w / DT
            else:
                sign = 1.0 if (self.w > 0 or (self.w == 0 and drive > 0)) else -1.0
                a = (drive - self.t_f * sign) / self.j
            t_hub = self.j_b * a - t_b            # what the hub must pass to keep the belt side with the motor
            if abs(t_hub) <= self.t_stick:
                self.w = self.wb = self.w + a * DT
            else:
                self.locked = False
                self._slide_dir = 1.0 if t_hub > 0 else -1.0
        if not self.coupled and not self.locked:
            rel = self.w - self.wb
            d = (1.0 if rel > 0 else -1.0) if abs(rel) > 1e-9 else self._slide_dir
            t_hub = self.t_slide * d
            dm = t_m - t_hub
            if abs(self.w) < 1e-3 and abs(dm) <= self.t_f:
                self.w = 0.0
            else:
                sign = 1.0 if (self.w > 0 or (self.w == 0 and dm > 0)) else -1.0
                self.w += (dm - self.t_f * sign) / self.j_m * DT
            self.wb += (t_hub + t_b) / self.j_b * DT
            self.slid_ms += DT * 1000
            self.slide_j += abs(t_hub * (self.w - self.wb)) * DT
            if (self.w - self.wb) * d <= 0:       # the speeds met: stuck again, sharing momentum
                self.w = self.wb = (self.j_m * self.w + self.j_b * self.wb) / self.j
                self.locked = True
        if not self.coupled:
            self.s += self.wb * self.rp * DT
        if self.p.lift_sense_side == "high":       # inside the diode loop: the motor's current, on or freewheeling
            shunt = self.i * self.p.lift_shunt_ohm
        else:                                      # in the MOSFET's source: only while it conducts
            shunt = self.i * self.p.lift_shunt_ohm * duty if on else 0.0
        self.vf += (shunt - self.vf) * DT / self.rc
        return self.vf > self.trip_v


    def _chain_step(self, h, f_top):
        """One sub-step of the chain's node speeds; returns the torque the loop puts on the drive pulley. `f_top` is a
        hood jam's force on the top node, against travel. Segment j joins node j - 1 to node j, the pulley's travel
        standing in at both ends."""
        u, v, m, ext = self.cu, self.cv, self.cm, self.cext
        k, t0, a = self.ck, self.t0, self.calpha
        sp, vp = self.s, self.wb * self.rp
        nn = len(u)
        left_u, slack = sp, False
        t_prev = None
        t_first = 0.0
        drag = 0.0
        tmax = self.seg_max_n
        for j in range(nn + 1):
            right_u = u[j] if j < nn else sp
            tj = t0 + k * (right_u - left_u)
            if tj <= 0.0:
                tj = 0.0
                slack = True
            elif tj > tmax:
                tmax = tj
            if j == 0:
                t_first = tj
            else:
                i = j - 1
                fd = a * m[i] * (v[i] - vp)
                drag += fd
                fi = tj - t_prev + ext[i] - fd
                if i == self.top:
                    fi -= f_top
                v[i] += fi / m[i] * h
            t_prev = tj
            left_u = right_u
        self.seg_max_n = tmax
        net = t_prev - t_first                      # tight (down) strand in, less the slack (up) strand out
        if net > self.belt_n:
            self.belt_n = net
        if slack:
            self.slack_ms += h * 1000
        return (t_first - t_prev + drag) * self.rp

    def _step_coupled(self, t_m):
        """One DT of the three-inertia drive: rotor (j_m) - coupling - shaft (j_s) - slip hub - belt side (j_b).
        Semi-implicit Euler at DT / MECH_SUB: speeds from the torques, then the twist and the belt from the new speeds.
        The ball's force is recomputed every sub-step from the belt's travel.

        The state lives in locals for the sub-steps and is written back once (perf note 2026-11-20,
        docs/history/ci-perf-2026-11-20-lift-jam-plant-locals.md): `coupler_torque` and `belt_force` are inlined with
        every float operation in the same order, and `max(0.0, x)` / `max(a, b)` are the comparisons they stand for
        (max keeps its first argument on a tie), and `abs(x) <= c` is `-c <= x <= c`, so each step is bit-for-bit the old one. The chain's step reads `s`
        and `wb` from the plant, so they are written back before it."""
        h = DT / MECH_SUB
        hms = h * 1000
        el = self.elastic
        chained = self.chained
        s_jam = self.s_jam
        hood = (el or chained) and s_jam is not None and self.where == "hood"
        chain_hood = hood and chained
        k, c_damp, rp = self.k, self.c_damp, self.rp
        t_load = self.t_load
        g, kc, cc = self.half_gap, self.kc, self.cc
        t_f, j_m, j_s, j_b = self.t_f, self.j_m, self.j_s, self.j_b
        jsb = j_s + j_b
        t_stick, t_slide = self.t_stick, self.t_slide
        if el:
            t0, ks, cb, j_v = self.t0, self.ks, self.cb, self.j_v
            sv, wv, e = self.sv, self.wv, self.e
        if chained:
            top, cu, cv = self.top, self.cu, self.cv
        w, ws, wb, phi, s = self.w, self.ws, self.wb, self.phi, self.s
        locked, face_was = self.locked, self._face
        slide_dir = getattr(self, "_slide_dir", None)   # set at the first slip
        force, coupler_nm = self.force, self.coupler_nm
        slid_ms, slide_j, free_ms, reversals = self.slid_ms, self.slide_j, self.free_ms, self.reversals
        for _ in range(MECH_SUB):
            f = 0.0
            if chain_hood:
                s_at, w_at = cu[top], cv[top] / rp
            elif hood:
                s_at, w_at = sv, wv
            else:
                s_at, w_at = s, wb
            if s_jam is not None and s_at > s_jam:
                f = k * (s_at - s_jam) + c_damp * w_at * rp
                if not f > 0.0:
                    f = 0.0
            if f > force:
                force = f
            if el:
                tight = t0 + ks * e
                if not tight > 0.0:
                    tight = 0.0
                slack = t0 - ks * e
                if not slack > 0.0:
                    slack = 0.0
                fb = tight - slack + cb * (wb - wv) * rp
                if fb > self.belt_n:
                    self.belt_n = fb
                if slack == 0.0:
                    self.slack_ms += hms
                t_v = fb * rp - t_load - (f * rp if hood else 0.0)   # on the belt's mass
                t_b = -fb * rp - (0.0 if hood else f * rp)           # on the pulley
                wv += t_v / j_v * h
            elif chained:
                self.s, self.wb = s, wb
                t_b = self._chain_step(h, f if hood else 0.0) - (0.0 if hood else f * rp)
            else:
                t_b = -t_load - f * rp
            # coupler_torque(): the spider's spring past the gap, its damping only while the jaws touch
            if phi > g:
                tc = kc * (phi - g) + cc * (w - ws)
                if tc > 0.0:
                    if tc > coupler_nm:
                        coupler_nm = tc
                else:
                    tc = 0.0
            elif phi < -g:
                tc = kc * (phi + g) + cc * (w - ws)
                if tc < 0.0:
                    if -tc > coupler_nm:
                        coupler_nm = -tc
                else:
                    tc = 0.0
            else:
                tc = 0.0
            dm = t_m - tc
            if -1e-3 < w < 1e-3 and -t_f <= dm <= t_f:
                w = 0.0
            else:
                sign = 1.0 if (w > 0 or (w == 0 and dm > 0)) else -1.0
                w += (dm - t_f * sign) / j_m * h
            if locked:
                a = (tc + t_b) / jsb
                t_hub = j_b * a - t_b
                if -t_stick <= t_hub <= t_stick:
                    ws = wb = ws + a * h
                else:
                    locked = False
                    slide_dir = 1.0 if t_hub > 0 else -1.0
            if not locked:
                rel = ws - wb
                d = (1.0 if rel > 0 else -1.0) if (rel > 1e-9 or rel < -1e-9) else slide_dir
                t_hub = t_slide * d
                ws += (tc - t_hub) / j_s * h
                wb += (t_hub + t_b) / j_b * h
                slid_ms += hms
                slide_j += abs(t_hub * (ws - wb)) * h
                if (ws - wb) * d <= 0:
                    ws = wb = (j_s * ws + j_b * wb) / jsb
                    locked = True
            phi += (w - ws) * h
            s += wb * rp * h
            if chained:
                for i in range(len(cu)):
                    cu[i] += cv[i] * h
            if el:
                e += (wb - wv) * rp * h
                sv += wv * rp * h
            face = 1 if phi > g else (-1 if phi < -g else 0)
            if face == 0:
                free_ms += hms
            else:
                if face_was not in (0, face):
                    reversals += 1
                face_was = face
        self.w, self.ws, self.wb, self.phi, self.s = w, ws, wb, phi, s
        if el:
            self.sv, self.wv, self.e = sv, wv, e
        self.locked, self._face = locked, face_was
        if slide_dir is not None:
            self._slide_dir = slide_dir
        self.force, self.coupler_nm = force, coupler_nm
        self.slid_ms, self.slide_j, self.free_ms, self.reversals = slid_ms, slide_j, free_ms, reversals

def _sim(volts=None):
    sim = SimFeeder()
    if volts is not None:                  # the battery reading the firmware holds the lift's duty to (LIFT_V_REF_MV)
        sim.pack_mv = int(volts * 1000)
    for _ in range(4):                     # the contactor's coil settles; heartbeats keep the watchdog quiet
        sim.write(P.encode(P.HEARTBEAT))
        sim.run_ms(100)
    return sim


def _run(sim, plant, ms, on_ms=None):
    """Advance `ms` milliseconds; `on_ms(t, plant, duty)` is called after each one. Returns nothing."""
    hw = sim.hw
    for t in range(ms):
        if t % 100 == 0:
            sim.write(P.encode(P.HEARTBEAT))
        duty = hw.lift_pwm.duty / 65535
        over = False
        for _ in range(SUB):
            over = plant.step(duty)
        sim.lift_over = over
        sim.run_ms(1)
        if on_ms is not None:
            on_ms(t, plant, duty)


def start(volts, rise_k, j_factor, trip, loaded=True, slip="lo", coupler="nom", belt=None, chain=None):
    """Kick the lift from rest. (tripped, ms the comparator was on, speed reached as a share of no-load); the plant's
    `slid_ms` says whether the hub slipped."""
    p = Feeder(**FEEDER_KW)
    sim, plant = _sim(volts), Plant(p, volts, rise_k, j_factor, trip, loaded, slip, coupler, belt, chain)
    start.plant = plant
    sim.hw.lift.kick(sim.us // 1000)
    over = [0]
    _run(sim, plant, 1500, lambda t, pl, d: over.__setitem__(0, over[0] + (1 if sim.lift_over else 0)))
    return sim.hw.lift.trips > 0 or sim.hw.lift.jammed, over[0], plant.w / plant.m["noload_rad_s"]


def jam(volts, rise_k, j_factor, trip, where, cutoff=True, after_ms=6000, slip="nom", coupler="nom", belt=None,
        chain=None):
    """Run 1 s, then a ball jams. Returns a dict: ms from contact to the first cut (None: never), peak force on the
    flight before that cut and over the whole run, joules in the winding after contact, ms to FLAG_LIFT_JAM."""
    p = Feeder(**FEEDER_KW)
    sim, plant = _sim(volts), Plant(p, volts, rise_k, j_factor, trip, slip=slip, coupler=coupler, belt=belt, chain=chain)
    hw = sim.hw
    if not cutoff:
        hw.lift.blank_ms = 10 ** 9
    hw.lift.kick(sim.us // 1000)
    _run(sim, plant, 1000)
    plant.jam(where)
    plant.winding_j = 0.0
    out = {"cut_ms": None, "first_peak_n": 0.0, "peak_n": 0.0, "jammed_ms": None}

    def watch(t, pl, duty):
        out["peak_n"] = max(out["peak_n"], pl.force)
        if out["cut_ms"] is None:
            out["first_peak_n"] = max(out["first_peak_n"], pl.force)
            if hw.lift_pwm.duty == 0:
                out["cut_ms"] = t
        if out["jammed_ms"] is None and hw.flags() & P.FLAG_LIFT_JAM:
            out["jammed_ms"] = t
        if t % 1000 == 0:
            hw.lift.kick(sim.us // 1000)       # balls keep being fed: each one restarts the run-on

    _run(sim, plant, after_ms, watch)
    out["winding_j"] = plant.winding_j
    out["slid_ms"], out["slide_j"] = plant.slid_ms, plant.slide_j
    out["coupler_nm"], out["reversals"] = plant.coupler_nm, plant.reversals
    out["belt_n"], out["slack_ms"] = plant.belt_n, plant.slack_ms
    out["seg_max_n"] = plant.seg_max_n
    return out


CASES = (("hub lo, trip hi", "lo", "hi"), ("hub hi, trip lo", "hi", "lo"), ("rigid, trip lo", None, "lo"))
LOADS = (("loaded", True), ("empty", False))


def _ramped(ramp_ms):
    """Run `start` and `jam` with the firmware's soft start set to `ramp_ms` (config LIFT_RAMP_MS is the default)."""
    def mk(volts=None):
        sim = _sim0(volts)
        sim.hw.lift.ramp_ms = ramp_ms
        return sim
    return mk


_sim0 = _sim


def coupler_starts(ramp_ms, loaded):
    """Every start corner (pack, rotor 0.5-2x) at each coupling stiffness and gap, hub at its lowest, trip at its
    lowest. Returns {(k, gap): (largest coupling torque, starts that slipped the hub, longest ms over the trip,
    any tripped)}."""
    global _sim
    p = Feeder()
    _sim = _ramped(ramp_ms)
    out = {}
    try:
        for k in p.lift_coupler_k_sweep:
            for gap in p.lift_coupler_backlash_sweep:
                worst = slips = over_ms = 0
                tripped = False
                for _, v, rise in CORNERS:
                    for jf in INERTIAS:
                        t, over, _ = start(v, rise, jf, "lo", loaded=loaded, slip="lo", coupler=(k, gap))
                        worst = max(worst, start.plant.coupler_nm)
                        slips += start.plant.slid_ms > 0
                        over_ms = max(over_ms, over)
                        tripped = tripped or t
                out[(k, gap)] = (worst, slips, over_ms, tripped)
    finally:
        _sim = _sim0
    return out


def coupler_jams(case):
    """A jam at the assumed rotor over every pack corner, boot and hood, at each coupling stiffness and gap.
    Returns {(k, gap): (peak N on a flight, largest coupling torque, slowest cut ms, latest give-up ms)}."""
    p = Feeder()
    _, slip, trip = case
    out = {}
    for k in p.lift_coupler_k_sweep:
        for gap in p.lift_coupler_backlash_sweep:
            peak = tq = cut = gave = 0
            for where in WHERE:
                for _, v, rise in CORNERS:
                    r = jam(v, rise, 1.0, trip, where, slip=slip, coupler=(k, gap))
                    peak, tq = max(peak, r["peak_n"]), max(tq, r["coupler_nm"])
                    cut = max(cut, r["cut_ms"] if r["cut_ms"] is not None else math.inf)
                    gave = max(gave, r["jammed_ms"] if r["jammed_ms"] is not None else math.inf)
            out[(k, gap)] = (peak, tq, cut, gave)
    return out


BELTS = (None, 0.5, 1.0, 2.0)       # rigid, then c_spec at half, one and two times the assumed figure


def _belt_label(b):
    return "rigid" if b is None else f"{b:g}x"


def belt_report():
    """Belt stretch as a fourth inertia (2026-11-15; cad/README.md "Lift belt stretch"): the drive's modes, then starts
    and jams with the belt rigid and at each c_spec. Printed alone by `--belt`."""
    p = Feeder()
    print("Belt stretch (each strand c_spec / centre; 4/pi^2 of the belt's mass on the strands, the rest on the pulley):")
    for b in BELTS[1:]:
        bm = p.lift_belt_model(b)
        print(f"  c_spec {b:g}x ({p.lift_belt_cspec_n * b:.0f} N): strand {bm['k_strand_n_m']:.0f} N/m, belt mass alone "
              f"{bm['f_belt_hz']:.0f} Hz; hub stuck {bm['f_stuck_hz']:.0f} and {bm['f_upper_hz']:.0f} Hz (rigid belt "
              f"{bm['f_rigid_hz']:.0f} Hz); slack strand goes slack past {bm['slack_at_n']:.0f} N net")
    print("\nStarts, hub at its lowest, trip lo (2 packs x 3 rotors): largest coupling torque, starts that slipped the hub "
          "of 6, largest net belt pull; columns " + ", ".join(_belt_label(b) for b in BELTS))
    global _sim
    try:
        for ramp in (0, p.lift_ramp_ms):
            _sim = _ramped(ramp)
            for cp in ("nom", (max(p.lift_coupler_k_sweep), 3.0), (max(p.lift_coupler_k_sweep), 5.0)):
                for label, loaded in LOADS:
                    cells = []
                    for b in BELTS:
                        worst = slips = pull = 0
                        tripped = False
                        for _, v, rise in CORNERS:
                            for jf in INERTIAS:
                                t, _, _ = start(v, rise, jf, "lo", loaded=loaded, slip="lo", coupler=cp, belt=b)
                                pl = start.plant
                                worst, pull = max(worst, pl.coupler_nm), max(pull, pl.belt_n)
                                slips += pl.slid_ms > 0
                                tripped = tripped or t
                        cells.append(f"{worst:4.2f} N m s{slips} {pull:3.0f} N{' TRIP' if tripped else ''}")
                    spider = "nominal" if cp == "nom" else f"{cp[0]:g} N m/rad {cp[1]:g} deg"
                    ramp_s = "switched" if ramp == 0 else f"{ramp:g} ms ramp"
                    print(f"  {ramp_s:11} {spider:20} {label:6} " + " | ".join(cells))
    finally:
        _sim = _sim0
    print("\nJams, rotor 1x, nominal coupling: peak N on a flight, ms to the cut, ms to give up, largest net belt pull, ms "
          "the slack strand spent slack")
    for where in WHERE:
        for name, v, rise in CORNERS:
            for case, slip, trip in CASES[:2]:
                cells = []
                for b in BELTS:
                    r = jam(v, rise, 1.0, trip, where, slip=slip, belt=b)
                    cells.append(f"{r['peak_n']:3.0f} N cut {r['cut_ms']:3d} gave {r['jammed_ms']:4d} belt {r['belt_n']:3.0f} N "
                                 f"slack {r['slack_ms']:3.0f}")
                print(f"  {where:4} {name:11} {case:15} " + " | ".join(cells))


CHAINS = (("rigid", None, None), ("lumped 1x", 1.0, None), ("chain 0.5x", None, {"cspec": 0.5, "every": 1}),
          ("chain 1x", None, {"cspec": 1.0, "every": 1}), ("chain 2x", None, {"cspec": 2.0, "every": 1}),
          ("chain 1x /2", None, {"cspec": 1.0, "every": 2}))


def chain_report():
    """The belt as a chain against the lumped and rigid belts (2026-11-15 later; cad/README.md "Lift belt as a chain").
    The chain's modes from the same node layout, then starts and jams. Printed alone by `--chain`."""
    p = Feeder()
    print("Chain (two nodes a flight pitch, both ends on the drive pulley; hub stuck) against the 8-node reference and the "
          "lumped belt: first stuck modes, Hz")
    for cs in p.lift_belt_cspec_sweep:
        for every in (1, 2):
            coarse = [f for f in p.lift_belt_axial_modes(every, cs, f_max_hz=200.0, nodes_per_pitch=2)["modes_hz"] if f > 1.0]
            fine = [f for f in p.lift_belt_axial_modes(every, cs, f_max_hz=200.0)["modes_hz"] if f > 1.0]
            bm = p.lift_belt_model(cs)
            print(f"  c_spec {cs:g}x, a ball every {every}: chain {', '.join(f'{f:.1f}' for f in coarse[:3])}; reference "
                  f"{', '.join(f'{f:.1f}' for f in fine[:3])}; lumped {bm['f_stuck_hz']:.1f}, {bm['f_upper_hz']:.1f}")
    labels = ", ".join(c[0] for c in CHAINS)
    print("\nStarts, hub at its lowest, trip lo (2 packs x 3 rotors): largest coupling torque, starts that slipped the hub "
          f"of 6, largest net belt pull, ms any segment was slack (most of the 6); columns {labels}")
    global _sim
    try:
        for ramp in (0, p.lift_ramp_ms):
            _sim = _ramped(ramp)
            for cp in ("nom", (max(p.lift_coupler_k_sweep), 5.0)):
                for label, loaded in LOADS:
                    cells = []
                    for _, b, ch in CHAINS:
                        worst = slips = pull = slack = 0
                        tripped = False
                        for _, v, rise in CORNERS:
                            for jf in INERTIAS:
                                t, _, _ = start(v, rise, jf, "lo", loaded=loaded, slip="lo", coupler=cp, belt=b, chain=ch)
                                pl = start.plant
                                worst, pull = max(worst, pl.coupler_nm), max(pull, pl.belt_n)
                                slack = max(slack, pl.slack_ms)
                                slips += pl.slid_ms > 0
                                tripped = tripped or t
                        cells.append(f"{worst:4.2f} N m s{slips} {pull:3.0f} N {slack:3.0f} ms{' TRIP' if tripped else ''}")
                    spider = "nominal" if cp == "nom" else f"{cp[0]:g} N m/rad {cp[1]:g} deg"
                    ramp_s = "switched" if ramp == 0 else f"{ramp:g} ms ramp"
                    print(f"  {ramp_s:11} {spider:20} {label:6} " + " | ".join(cells))
    finally:
        _sim = _sim0
    print("\nJams, rotor 1x, nominal coupling (6 s): peak N on a flight, ms to the cut, ms to give up, largest net belt pull "
          f"(the chain: tight strand in less slack strand out at the drive pulley), tightest segment; columns {labels}")
    worst = {}
    for where in WHERE:
        for name, v, rise in CORNERS:
            for case, slip, trip in CASES[:2]:
                cells = []
                for col, b, ch in CHAINS:
                    r = jam(v, rise, 1.0, trip, where, slip=slip, belt=b, chain=ch)
                    w = worst.setdefault(col, [0, 0, 0, 0, 0])
                    w[0], w[1] = max(w[0], r["peak_n"]), max(w[1], r["cut_ms"] if r["cut_ms"] is not None else math.inf)
                    w[2] = max(w[2], r["jammed_ms"] if r["jammed_ms"] is not None else math.inf)
                    w[3], w[4] = max(w[3], r["belt_n"]), max(w[4], r["seg_max_n"])
                    cut = "never" if r["cut_ms"] is None else f"{r['cut_ms']:3d}"
                    cells.append(f"{r['peak_n']:3.0f} N cut {cut} gave {r['jammed_ms']} belt {r['belt_n']:3.0f} N "
                                 f"seg {r['seg_max_n']:3.0f} N")
                print(f"  {where:4} {name:11} {case:15} " + " | ".join(cells))
    print("\nWorst over every jam: peak N on a flight, slowest cut ms, latest give-up ms, largest net belt pull N, tightest "
          "segment N")
    for col, w in worst.items():
        print(f"  {col:12} {w[0]:4.0f} {w[1]:6g} {w[2]:6g} {w[3]:5.0f} {w[4]:5.0f}")
    return worst


def _fixed_duty():
    """Run `start` and `jam` with the firmware's duty fixed (LIFT_V_REF_MV 0), as before 2026-11-15."""
    def mk(volts=None):
        sim = _sim0(volts)
        sim.hw.lift.v_ref_mv = 0
        return sim
    return mk


def duty_report():
    """The duty held to the battery (2026-11-15; cad/README.md "Lift duty follows the battery") against the fixed duty,
    at both packs: the firmware's duty and belt speed after 1.5 s, starts (every flight loaded, hub lo, trip lo, rotor
    0.5-2x) and jams (rotor 1x, boot and hood, both hub/trip cases). Printed alone by `--duty`."""
    global _sim
    p = Feeder()
    c = p.lift_jam_cutoff()
    print(f"Duty held to {p.lift_v_ref:g} V / battery: {c['duty_lo_v']:.2f} at {p.battery_v_min:g} V, {c['duty_hi_v']:.2f} at "
          f"{p.battery_v_max:g} V; the trip in motor amps on a full pack is {c['trip_hi_a_full_pack']:.2f} A at most "
          f"({'the same as at the cut: high-side sense' if c['sense'] == 'high' else 'raised 1/duty: low-side shunt'}), "
          f"a hot stall there {c['stall_margin_hi_v']:.2f}x it (at {p.battery_v_min:g} V {c['stall_margin_lo_v']:.2f}x)")
    print(f"{'duty':6} {'corner':12} {'pwm':>5} {'speed':>6} {'starts tripped':>15} {'max over ms':>12} | jams: "
          f"{'slowest cut':>11} {'peak N':>7} {'latest give-up':>15} {'winding J':>10}")
    try:
        for label, mk in (("held", _sim0), ("fixed", _fixed_duty())):
            _sim = mk
            for name, v, rise in CORNERS:
                tripped = over_ms = 0
                pwm = speed = None
                for jf in INERTIAS:
                    t, over, sp = start(v, rise, jf, "lo")
                    tripped += t
                    over_ms = max(over_ms, over)
                    if jf == 1.0:
                        speed = sp
                        pwm = start.plant.last_duty
                cut = peak = gave = wj = 0
                for where in WHERE:
                    for _, slip, trip in CASES[:2]:
                        r = jam(v, rise, 1.0, trip, where, slip=slip)
                        cut = max(cut, r["cut_ms"] if r["cut_ms"] is not None else math.inf)
                        gave = max(gave, r["jammed_ms"] if r["jammed_ms"] is not None else math.inf)
                        peak, wj = max(peak, r["peak_n"]), max(wj, r["winding_j"])
                print(f"{label:6} {name:12} {pwm:5.2f} {speed:6.0%} {tripped:>12d}/3 {over_ms:12d} | {cut:>11g} {peak:7.0f} "
                      f"{gave:>15g} {wj:10.0f}")
    finally:
        _sim = _sim0


def sense_report():
    """The shunt inside the diode loop with an INA186-class amplifier (2026-11-15; cad/README.md "Lift current sense
    inside the diode loop") against the low-side shunt in the MOSFET's source as landed before it (0.05 ohm, 2.4k),
    duty held to the battery: the trip in motor amps at each pack's duty, starts (every flight loaded, hub lo, trip
    lo, rotor 0.5-2x) and jams (rotor 1x, boot and hood, hub lo/trip hi and hub hi/trip lo). Printed alone by
    `--sense`."""
    global FEEDER_KW
    print(f"{'sense':5} {'corner':12} {'pwm':>5} {'trip A':>11} {'slide A':>7} {'starts tripped':>15} {'max over ms':>12} | "
          f"jams: {'slowest cut':>11} {'peak N':>7} {'latest give-up':>15} {'winding J':>10}")
    try:
        for label, kw in (("high", {}), ("low", LOW_SIDE)):
            FEEDER_KW = kw
            p = Feeder(**kw)
            c, h = p.lift_jam_cutoff(), p.lift_slip_design()
            for name, v, rise in CORNERS:
                duty = p.lift_duty_at(v)
                scale = 1.0 if p.lift_sense_side == "high" else c["duty_lo_v"] / duty
                tripped = over_ms = 0
                pwm = None
                for jf in INERTIAS:
                    t, over, _ = start(v, rise, jf, "lo")
                    tripped += t
                    over_ms = max(over_ms, over)
                    if jf == 1.0:
                        pwm = start.plant.last_duty
                cut = peak = gave = wj = 0
                for where in WHERE:
                    for _, slip, trip in CASES[:2]:
                        r = jam(v, rise, 1.0, trip, where, slip=slip)
                        cut = max(cut, r["cut_ms"] if r["cut_ms"] is not None else math.inf)
                        gave = max(gave, r["jammed_ms"] if r["jammed_ms"] is not None else math.inf)
                        peak, wj = max(peak, r["peak_n"]), max(wj, r["winding_j"])
                trips = f"{c['trip_lo_a'] * scale:.2f}-{c['trip_hi_a'] * scale:.2f}"
                print(f"{label:5} {name:12} {pwm:5.2f} {trips:>11} {h['slide_lo_a']:7.2f} {tripped:>12d}/3 {over_ms:12d} | "
                      f"{cut:>11g} {peak:7.0f} {gave:>15g} {wj:10.0f}")
    finally:
        FEEDER_KW = {}


SPRINGS = (("one A 12.5 x 0.7 disc (to 2026-11-16)",
            {"lift_slip_spring_t": 0.7, "lift_slip_spring_h0": 0.3, "lift_slip_spring_count": 1}),
           ("four B 12.5 x 0.5 discs in series (now)", {}))
WORN_COUPLER = (80.0, 5.0)        # the stiffest, most worn spider: where soft starts slip the hub first


def wear_case(torque_nm):
    """One hub torque over the corners that bound it. Soft starts, empty belt, rotor 0.5-2x and both packs (6), at the
    nominal coupling and the worn stiff spider: starts that slipped. Jams at the assumed rotor, boot and hood, both packs
    (4), trip at its highest: the slowest cut (inf: never cut) and the latest give-up; trip at its lowest: the peak."""
    out = {}
    for label, cp in (("nom", "nom"), ("worn", WORN_COUPLER)):
        slips = 0
        for _, v, rise in CORNERS:
            for jf in INERTIAS:
                start(v, rise, jf, "lo", loaded=False, slip=torque_nm, coupler=cp)
                slips += start.plant.slid_ms > 0
        out[f"slips_{label}"] = slips
    cut = gave = peak = 0
    for where in WHERE:
        for _, v, rise in CORNERS:
            r = jam(v, rise, 1.0, "hi", where, slip=torque_nm)
            cut = max(cut, r["cut_ms"] if r["cut_ms"] is not None else math.inf)
            gave = max(gave, r["jammed_ms"] if r["jammed_ms"] is not None else math.inf)
            peak = max(peak, jam(v, rise, 1.0, "lo", where, slip=torque_nm)["peak_n"])
    out.update(cut_ms=cut, gave_ms=gave, peak_n=peak)
    return out


def wear_thresholds(iters=7):
    """Bisect the hub's sticking torque for the two floors a worn hub crosses: the lowest at which every jam corner
    (boot and hood, both packs, trip at its highest) is still cut, and the lowest at which no soft start on an empty
    belt (6 corners) slips with the worn stiff spider. Returns (cut floor, start floor), each to about 0.01 N m."""
    def cut_all(t):
        return all(jam(v, rise, 1.0, "hi", where, slip=t)["cut_ms"] is not None
                   for where in WHERE for _, v, rise in CORNERS)

    def no_slip(t):
        for _, v, rise in CORNERS:
            for jf in INERTIAS:
                start(v, rise, jf, "lo", loaded=False, slip=t, coupler=WORN_COUPLER)
                if start.plant.slid_ms > 0:
                    return False
        return True

    out = []
    for ok in (cut_all, no_slip):
        lo, hi = 0.2, 1.0
        for _ in range(iters):
            mid = (lo + hi) / 2
            lo, hi = (lo, mid) if ok(mid) else (mid, hi)
        out.append(hi)
    return tuple(out)


def wear_report():
    """The facings' thickness loss as a sweep axis (2026-11-16; cad/README.md "Slip hub wear"). For each disc stack and
    each loss in `lift_slip_loss_sweep_um`, the worn hub at its lowest setting and friction (`Feeder.lift_slip_wear`)
    on the real firmware; then the new hub warm at its highest setting and friction."""
    p = Feeder()
    c = p.lift_jam_cutoff()
    print(f"Slip hub wear: set {p.lift_slip_nm:g} N m; the worn corner is the set at -{p.lift_slip_set_tol:.0%} and the "
          f"friction at -{p.lift_slip_mu_spread:.0%}, times the disc stack's load left after the loss. Trip "
          f"{c['trip_lo_a']:.2f}-{c['trip_hi_a']:.2f} A; plate allows {c['plate_allow_n']:.0f} N. Starts: soft, empty "
          f"belt, 6 corners, slips at the nominal / worn stiff spider {WORN_COUPLER}. Jams: 4 corners; cut and "
          f"give-up at the highest trip, peak at the lowest.")
    for name, kw in SPRINGS:
        q = Feeder(**kw)
        sp, w = q.lift_slip_spring(), q.lift_slip_wear()
        print(f"\n{name}: set {sp['set_mm'] * 1000:.0f} um of {sp['stroke_mm'] * 1000:.0f} um, "
              f"{sp['rate_n_um']:.2f} N/um, stack {sp['stack_mm']:.2f} mm; budget {w['budget_um']:.0f} um; design loss "
              f"{w['loss_um']:.0f} um (set {q.lift_slip_loss_um:g} + cold {w['shrink_um']:.1f} + {q.lift_slip_jams} "
              f"jams x {w['jam_um']:.3f}); warm high corner {w['hi_nm']:.2f} N m")
        print(f"  {'loss um':>7} {'load':>5} {'hub N m':>7} {'slips':>7} {'cut ms':>7} {'gave up':>8} {'peak N':>7}")
        for loss, ratio, nm in w["sweep"]:
            if nm <= 0.05:
                print(f"  {loss:7g} {ratio:5.0%} {nm:7.2f}  the stack is unloaded: the pulley spins free, the belt stops")
                continue
            r = wear_case(nm)
            print(f"  {loss:7g} {ratio:5.0%} {nm:7.2f} {r['slips_nom']:3d}/{r['slips_worn']:<3d} {r['cut_ms']:7g} "
                  f"{r['gave_ms']:8g} {r['peak_n']:7.0f}")
        r = wear_case(w["hi_nm"])
        print(f"  warm, new {w['hi_nm']:7.2f} N m: slips {r['slips_nom']}/{r['slips_worn']}, cut by {r['cut_ms']:g} ms, "
              f"peak {r['peak_n']:.0f} N")
    cut_floor, start_floor = wear_thresholds()
    print(f"\nFloors (bisected): every jam is still cut down to {cut_floor:.2f} N m; no soft start slips with the worn "
          f"stiff spider down to {start_floor:.2f} N m (the band's bottom is {p.lift_slip_nm * (1 - p.lift_slip_tol):.2f})")


def main():
    p = Feeder()
    c = p.lift_jam_cutoff()
    h = p.lift_slip_design()
    cm = p.lift_coupler_model()
    print(f"trip {c['trip_a']:.2f} A ({c['trip_lo_a']:.2f}-{c['trip_hi_a']:.2f}), blanking {p.lift_jam_blank_ms:g} ms, "
          f"soft start {p.lift_ramp_ms:g} ms, plate allows {c['plate_allow_n']:.0f} N, weld {c['weld_allow_n']:.0f} N")
    print(f"slip hub {p.lift_slip_nm:g} N m set ({h['stick_lo_nm']:.2f}-{h['stick_hi_nm']:.2f} sticking, "
          f"{h['slide_lo_nm']:.2f}-{h['slide_hi_nm']:.2f} sliding; {h['slide_lo_a']:.2f} A sliding at the lowest)")
    print(f"jaw coupling {cm['k_nm_rad']:g} N m/rad, {p.lift_coupler_backlash_deg:g} deg play, zeta {cm['zeta']:g} "
          f"(swept {p.lift_coupler_k_sweep} N m/rad, {p.lift_coupler_backlash_sweep} deg); inertias: rotor "
          f"{cm['j_motor']:.2e}, shaft side {cm['j_shaft']:.2e}, belt side {cm['j_belt']:.2e} kg m^2; modes "
          f"{cm['f_stuck_hz']:.0f} Hz hub stuck, {cm['f_sliding_hz']:.0f} Hz sliding; rated {p.lift_coupler_nm:g} N m")
    print("\nStart, every flight loaded, hub at its lowest, nominal coupling (1.5 s):")
    print(f"{'corner':12} {'J x':>4} {'trip':>4} {'tripped':>8} {'over ms':>8} {'speed':>6} {'slid ms':>8} {'coupler':>8}")
    for name, v, rise in CORNERS:
        for jf in INERTIAS:
            for trip in TRIPS:
                tripped, over, speed = start(v, rise, jf, trip)
                print(f"{name:12} {jf:4g} {trip:>4} {str(tripped):>8} {over:8d} {speed:6.0%} {start.plant.slid_ms:8.1f} "
                      f"{start.plant.coupler_nm:8.2f}")
    print(f"\nStarts over the coupling's stiffness and play (2 packs x 3 rotors each; hub {h['stick_lo_nm']:.2f} N m, "
          f"its lowest): largest coupling torque, starts that slipped the hub of 6, longest ms over the trip")
    for ramp in (0, p.lift_ramp_ms):
        for label, loaded in LOADS:
            res = coupler_starts(ramp, loaded)
            print(f"  {'switched' if ramp == 0 else f'{ramp:g} ms soft start'}, {label} belt:")
            for (k, gap), (tq, slips, over, tripped) in res.items():
                print(f"    {k:4g} N m/rad {gap:3g} deg  {tq:5.2f} N m ({tq / h['stick_lo_nm']:4.0%} of the hub)  "
                      f"slipped {slips}  over {over:3d} ms{'  TRIPPED' if tripped else ''}")
    print("\nJam after 1 s at speed, a ball fed every second, nominal coupling (6 s):")
    print(f"{'where':5} {'corner':12} {'J x':>4} {'case':16} {'cut ms':>7} {'first N':>8} {'peak N':>7} {'winding J':>10} "
          f"{'hub J':>6} {'coupler':>8} {'gave up ms':>10}")
    for where in WHERE:
        for name, v, rise in CORNERS:
            for jf in INERTIAS:
                for case, slip, trip in CASES:
                    r = jam(v, rise, jf, trip, where, slip=slip, coupler=None if slip is None else "nom")
                    print(f"{where:5} {name:12} {jf:4g} {case:16} {str(r['cut_ms']):>7} {r['first_peak_n']:8.0f} "
                          f"{r['peak_n']:7.0f} {r['winding_j']:10.0f} {r['slide_j']:6.1f} {r['coupler_nm']:8.2f} "
                          f"{str(r['jammed_ms']):>10}")
    print("\nJams over the coupling's stiffness and play (rotor 1x; both packs, boot and hood): peak N on a flight, "
          "largest coupling torque, slowest cut, latest give-up")
    for case in CASES[:2]:
        print(f"  {case[0]}:")
        for (k, gap), (peak, tq, cut, gave) in coupler_jams(case).items():
            print(f"    {k:4g} N m/rad {gap:3g} deg  peak {peak:4.0f} N  coupler {tq:4.2f} N m  cut by {cut:4g} ms  "
                  f"gave up by {gave:5g} ms")
    print("\nThe same jam with no cutoff, hub at its set torque, nominal coupling (6 s; the run-on is 16 s and restarts "
          "with every ball):")
    for where in WHERE:
        for name, v, rise in CORNERS:
            r = jam(v, rise, 1.0, "lo", where, cutoff=False)
            print(f"{where:5} {name:12} peak {r['peak_n']:5.0f} N, winding {r['winding_j']:5.0f} J, "
                  f"hub {r['slide_j']:5.0f} J, coupler {r['coupler_nm']:4.2f} N m")

    print()
    belt_report()
    print()
    duty_report()
    print()
    sense_report()


if __name__ == "__main__":
    if "--belt" in sys.argv[1:]:
        belt_report()
    elif "--duty" in sys.argv[1:]:
        duty_report()
    elif "--sense" in sys.argv[1:]:
        sense_report()
    elif "--chain" in sys.argv[1:]:
        chain_report()
    elif "--wear" in sys.argv[1:]:
        wear_report()
    else:
        main()
