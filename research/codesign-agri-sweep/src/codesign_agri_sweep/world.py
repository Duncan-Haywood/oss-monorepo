"""The `codesign-agri` soft-fruit gripper model with its ASSUMED constants exposed as a parameter dict, so a
world can be drawn by perturbing them. With `NOMINAL` it reproduces `codesign_agri.agri.evaluate` exactly (a test
checks this). Design x = [w mm, l mm, E MPa, Fg N, n]; objective J = mean fruit value - cost_weight * cost."""
import numpy as np

LB = [4.0, 10.0, 0.1, 0.5, 2.0]
UB = [25.0, 40.0, 10.0, 8.0, 4.0]
N_FRUIT = 600
COST_CAP = 60.0

# name: (nominal, low, high, kind). 'mult' ranges scale the nominal; 'abs' ranges are absolute. Ranges are the
# sweep's plausible spread around a round number that the original project chose without a source.
PARAMS = {
    "bruise_scale": (1.0, 0.5, 2.0, "log"),     # multiplies the 40..110 kPa bruise-pressure band
    "diam_mean": (28.0, 22.0, 34.0, "abs"),     # mm
    "diam_sd": (5.0, 3.0, 7.0, "abs"),          # mm
    "stem_median": (3.5, 1.75, 7.0, "log"),     # N, stem pull-off force
    "place_sd": (4.0, 2.0, 8.0, "log"),         # mm, placement error
    "wet_share": (0.3, 0.1, 0.5, "abs"),
    "mu_scale": (1.0, 0.7, 1.4, "log"),         # multiplies dry/wet friction
    "clutter_len": (400.0, 200.0, 800.0, "log"),  # mm; collision prob = 1 - exp(-n l / clutter_len)
    "value_bruised": (0.2, 0.0, 0.5, "abs"),
    "cost_weight": (0.002, 0.001, 0.004, "log"),  # J per USD
    "servo_price": (4.0, 2.0, 8.0, "log"),      # USD per N of grip force, and the 4 USD base (scaled together)
    "plastic_price": (0.004, 0.002, 0.008, "log"),  # USD per mm^2 of pad
}
NOMINAL = {k: v[0] for k, v in PARAMS.items()}


def population(p, seed=12345, n=N_FRUIT):
    r = np.random.default_rng(seed)
    d = np.clip(r.normal(p["diam_mean"], p["diam_sd"], n), 15.0, 45.0)
    ripe = r.random(n)
    pb = p["bruise_scale"] * (110e3 - 70e3 * ripe)
    fd = np.clip(r.lognormal(np.log(p["stem_median"]), 0.3, n) * (1.2 - 0.5 * ripe), 0.5, None)
    e = np.abs(r.normal(0.0, p["place_sd"], n))
    wet = r.random(n) < p["wet_share"]
    mu0 = np.where(wet, 0.35, 0.8) * r.uniform(0.85, 1.15, n) * p["mu_scale"]
    clutter = r.random(n)
    return dict(d=d, ripe=ripe, pb=pb, fd=fd, e=e, mu0=mu0, clutter=clutter)


def cost_usd(x, p=NOMINAL):
    w, l, E, Fg, n = x
    n = int(round(n))
    k = p["servo_price"] / 4.0
    servo = k * (4.0 + 4.0 * Fg)
    plastic = n * w * l * p["plastic_price"] * (1.0 + 0.3 * np.log10(E / 0.1))
    return float(servo + plastic + 8.0)


def make_evaluator(p):
    """Return evaluate(x) -> dict (same keys as codesign_agri.agri.evaluate) for the world `p`."""
    pop = population(p)

    def evaluate(x):
        x = np.asarray(x, dtype=float)
        w, l, E, Fg, nf = x
        n = int(round(nf))
        cost = cost_usd(x, p)
        R = pop["d"] / 2e3
        Ff = Fg / n
        Es = E * 1e6 / 0.75
        wm, lm = w / 1e3, l / 1e3
        opening = 15.0 + 1.4 * l
        captured = (pop["d"] + 2 * pop["e"]) <= opening
        collide = pop["clutter"] < 1.0 - np.exp(-n * l / p["clutter_len"])
        a = np.sqrt(4 * Ff * R / (np.pi * Es * wm))
        bottom = a >= lm / 2
        a = np.minimum(a, lm / 2)
        deflect = a ** 2 / R * 1e3
        kload = 1.0 + np.maximum(0.0, pop["e"] - deflect) / (pop["d"] / 2.0)
        pressure = kload * Ff / (2 * a * wm) * np.where(bottom, 1.5, 1.0)
        bruised = pressure > pop["pb"]
        mu = pop["mu0"] * (1.0 + 0.5 * (1.0 - E / (E + 1.0)))
        cage = 1.0 + 0.6 * np.minimum(1.0, l / pop["d"]) * (n - 2) / 2.0
        gamma = pop["fd"] / ((E * 1e6 / 3.0) * wm * lm)
        hold = mu * Fg * cage / (1.0 + (gamma / 0.6) ** 2)
        slipped = hold < 1.1 * pop["fd"]
        missed = (~captured) | collide
        held = (~missed) & (~slipped)
        good = held & (~bruised)
        soft = held & bruised
        value = np.where(good, 1.0, np.where(soft, p["value_bruised"], 0.0))
        J = float(value.mean() - p["cost_weight"] * cost)
        feasible = cost <= COST_CAP
        return dict(x=[float(v) for v in x[:4]] + [n], J=J if feasible else -1.0, cost=cost, feasible=bool(feasible),
                    good=float(good.mean()), bruised=float(soft.mean()), slipped=float((~missed & slipped).mean()),
                    missed=float(missed.mean()), collided=float(collide.mean()))
    return evaluate


def draw_worlds(n, seed=0):
    """Latin-hypercube sample of n worlds over PARAMS (log-uniform for 'log', uniform for 'abs')."""
    from scipy.stats import qmc
    names = list(PARAMS)
    u = qmc.LatinHypercube(d=len(names), seed=seed).random(n)
    worlds = []
    for row in u:
        w = {}
        for v, k in zip(row, names):
            _, lo, hi, kind = PARAMS[k]
            w[k] = float(lo * (hi / lo) ** v) if kind == "log" else float(lo + v * (hi - lo))
        worlds.append(w)
    return worlds
