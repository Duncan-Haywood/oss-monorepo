"""SIMPLER (Li et al. 2024, arXiv:2405.05941) paired real / SAPIEN Visual Matching success rates.
Transcribed from Table IV (Google Robot) and Table V (WidowX + Bridge, 'Success' columns); trial counts from Appendix B.
Eggplant n_real = 30, not the 24 in Appendix B: real rates .233 = 7/30, .433 = 13/30 (and grasp .033 = 1/30) are not multiples of 1/24.
Rows: (robot, task, policy, n_real, real, sim)."""
GOOGLE_POLICIES = ["RT-1 (Converged)", "RT-1 (15%)", "RT-1-X", "RT-2-X", "Octo-Base", "RT-1 (Begin)"]
# task: (n_real, real rates, sim rates) in GOOGLE_POLICIES order
GOOGLE = {
    "pick_coke_can": (75, [.853, .920, .760, .907, .293, .133], [.857, .710, .567, .787, .170, .027]),
    "move_near":     (60, [.633, .583, .450, .733, .350, .017], [.442, .354, .317, .779, .042, .050]),
    "open_drawer":   (27, [.815, .704, .519, .333, .148, .000], [.601, .463, .296, .157, .009, .000]),
    "close_drawer":  (27, [.926, .889, .741, .630, .519, .000], [.861, .667, .891, .343, .444, .278]),
}
WIDOWX_POLICIES = ["RT-1-X", "Octo-Base", "Octo-Small"]
WIDOWX = {
    "spoon_on_towel":  (24, [.000, .333, .417], [.000, .125, .472]),
    "carrot_on_plate": (24, [.000, .250, .083], [.042, .083, .097]),
    "stack_blocks":    (24, [.000, .000, .125], [.000, .000, .042]),
    "eggplant_basket": (30, [.000, .233, .433], [.000, .431, .569]),
}

def rows():
    out = []
    for robot, pols, tasks in (("google", GOOGLE_POLICIES, GOOGLE), ("widowx", WIDOWX_POLICIES, WIDOWX)):
        for task, (n, real, sim) in tasks.items():
            for p, r, s in zip(pols, real, sim):
                out.append((robot, task, p, n, r, s))
    return out

def check():
    """Real rates must be k/n for integer k (to the 3-decimal rounding, or the 'average over orientations' for coke can)."""
    bad = []
    for robot, task, p, n, r, s in rows():
        k = r * n
        tol = 0.0006 * n + 0.01
        if abs(k - round(k)) > tol and task != "pick_coke_can":
            bad.append((task, p, r, n, k))
    return bad
