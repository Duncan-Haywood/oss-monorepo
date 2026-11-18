"""Post-hoc diagnostic for milestone 7b (written after results.txt was read; not a test of any prediction).

Candidate explanation checked here: the integrator feed-forward shifts the tilt reference by c * integ, c = lat * ki * tau_max_nom
/ (m_nom g). A quasi-steady argument (kp * e = -ki * integ with no disturbance, so d(integ)/dt = (c - ki / kp) integ) says it runs
away when g_ff = lat * tau_max_nom * kp / (m_nom g) > 1. The printout shows that criterion does NOT separate the designs that
diverge (6b `above` designs, g_ff 0.68-0.97) from those that do not (retrained `above`, 0.94-1.02): the quasi-steady argument drops
the attitude and position dynamics. What does separate them is ki / kp: the `above` designs of milestone 6b lean on the integrator
(ki / kp 9-13 per s), the `below` designs barely use it (0.05-0.14), and the retrained `above` designs cut it to 3.7-4.4."""
import json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from codesign_cant import aero as A, poshold as P  # noqa: E402

runs = json.load(open(os.path.join(HERE, "results.json")))["runs"]
L = ["Milestone 7b post-hoc diagnostic (written after results.txt): g_ff = lat * tau_max_nom * kp_roll / (m_nom g), a quasi-steady",
     "runaway criterion (g_ff > 1) that these numbers refute; ki/kp (1/s, roll) is what separates the diverging designs.",
     "dead = diverged held-out episodes of 64 at lever 0 with the feed-forward on for the 6b+integ and integ retrained rows, off for 6b aware.", ""]
for g in ("above", "below"):
    for lab in ("6b aware", "6b+integ", "integ retrained"):
        rs = sorted((r for r in runs if r["geom"] == g and r["label"] == lab), key=lambda r: r["seed"])
        x = np.array([r["x"][:12] for r in rs])
        L_ = A.L_RANGE[0] + x[:, 0] * (A.L_RANGE[1] - A.L_RANGE[0]); D = A.D_RANGE[0] + x[:, 1] * (A.D_RANGE[1] - A.D_RANGE[0])
        sz = A.size(L_, D, np.deg2rad(80.0) * np.clip(x[:, 2], 0, 1), kappa_per_d=0.081, actuator="hover")
        gains = P.phys_gains(x[:, 3:12])
        lat = P.lateral_per_torque(sz["alpha"], sz["L"], 0.081 * D)
        gff = lat * sz["tau_max"] * gains[:, 0] / (sz["mass"] * A.G)
        dead = [int(round(r["dead_0_on"] * 64)) for r in rs]
        L.append(f"[{g}, {lab}] g_ff {', '.join(f'{v:.2f}' for v in gff)}; kp {', '.join(f'{v:.2f}' for v in gains[:, 0])}; "
                 f"ki/kp {', '.join(f'{v:.2f}' for v in gains[:, 2] / gains[:, 0])}; dead at lever 0 {dead}")
    L.append("")
open(os.path.join(HERE, "diag.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
