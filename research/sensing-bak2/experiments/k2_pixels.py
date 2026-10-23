"""How many pixels do k1 and k2 move the visible points of the rig? Prints the radius and the shifts.

    PYTHONPATH=src python experiments/k2_pixels.py
"""
import numpy as np
from sensing_bak2 import project_k2
from sensing_recon import make_object, orbit_cameras, visible
from sensing_recon.recon import F_PX


def main(n_feat=300, seeds=6):
    r, d1, d2 = [], [], []
    cams = orbit_cameras(12, 360.0)
    for s in range(seeds):
        pts, nrm = make_object(n_feat, seed=s)
        for c in cams:
            v = visible(c, pts, nrm)
            p = pts[v]
            pc = p @ c.R.T + c.t
            r.append(np.hypot(pc[:, 0], pc[:, 1]) / pc[:, 2])
            base = project_k2(c, p, F_PX)
            d1.append(np.linalg.norm(project_k2(c, p, F_PX, 0.2, 0.0) - base, axis=1))
            d2.append(np.linalg.norm(project_k2(c, p, F_PX, 0.0, 0.2) - base, axis=1))
    r, d1, d2 = map(np.concatenate, (r, d1, d2))
    print(f"normalised radius: max {r.max():.3f}, 95th percentile {np.percentile(r, 95):.3f}")
    print(f"shift of a visible point for k1 = 0.2: max {d1.max():.2f} px, 95th pct {np.percentile(d1, 95):.2f} px")
    print(f"shift of a visible point for k2 = 0.2: max {d2.max():.2f} px, 95th pct {np.percentile(d2, 95):.2f} px")


if __name__ == "__main__":
    main()
