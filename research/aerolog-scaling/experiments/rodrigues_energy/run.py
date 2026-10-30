"""H2/H4 anchor: does measured electrical power scale as mass^1.5 (the exponent behind Froude power n^3.5)?

Data: Rodrigues et al., "Data collected with package delivery quadcopter drone", Figshare
doi:10.1184/R1/12683453 (CC BY 4.0): 209 flights of a DJI Matrice 100, 5 Hz battery voltage and current,
ground velocity, wind. Takeoff mass 3.68 kg + payload (Rodrigues et al., Sci. Data 8, 2021; Patterns 3, 2022).

Usage: python3 run.py [dir holding parameters.csv and flights.csv]   (downloads ~107 MB if absent)
"""
import math
import os
import sys
import urllib.request

import numpy as np
import pandas as pd

BASE_MASS = 3.680           # kg, no payload (Rodrigues et al. 2021/2022)
G = 9.80665
RHO = 1.20                  # kg/m3: ISA at ~300 m, 15 C is 1.19; Pittsburgh summer 20 C is 1.18
DISC_A = 4 * math.pi * (13 * 0.0254 / 2) ** 2   # four 13 in (DJI 1345) propellers
URLS = {"parameters.csv": "https://ndownloader.figshare.com/files/26385034",
        "flights.csv": "https://ndownloader.figshare.com/files/26385151"}
SEED, NBOOT = 0, 10000


def fetch(root):
    os.makedirs(root, exist_ok=True)
    for name, url in URLS.items():
        p = os.path.join(root, name)
        if not os.path.exists(p):
            urllib.request.urlretrieve(url, p)
    return root


def per_flight(root):
    par = pd.read_csv(os.path.join(root, "parameters.csv"))
    cols = ["flight", "time", "wind_speed", "battery_voltage", "battery_current",
            "velocity_x", "velocity_y", "velocity_z"]
    fl = pd.read_csv(os.path.join(root, "flights.csv"), usecols=cols)
    fl["p"] = fl.battery_voltage * fl.battery_current.abs()
    fl["vh"] = np.hypot(fl.velocity_x, fl.velocity_y)
    out = []
    for f, g in fl.groupby("flight"):
        row = par[par.flight == f].iloc[0]
        if not str(row.route).startswith("R"):
            continue
        v = float(row.speed)
        c = g[(g.vh > 0.8 * v) & (g.vh < 1.2 * v) & (g.velocity_z.abs() < 0.5)]
        if len(c) < 25:  # under 5 s of cruise
            continue
        out.append(dict(flight=f, speed=v, payload=float(row.payload), alt=str(row.altitude),
                        route=row.route, n=len(c), p=c.p.mean(), wind=c.wind_speed.mean(),
                        date=row.date))
    return pd.DataFrame(out)


def design(d):
    m = BASE_MASS + d.payload.values / 1000.0
    x = np.column_stack([np.ones(len(d)), np.log(m), d.speed.values, d.speed.values ** 2, d.wind.values])
    return x, np.log(d.p.values), m


def fit(d, cols=None):
    x, y, _ = design(d)
    if cols is not None:
        x = x[:, cols]
    b, *_ = np.linalg.lstsq(x, y, rcond=None)
    return b


def boot(d, cols, k=1):
    rng = np.random.default_rng(SEED)
    idx = np.arange(len(d))
    return np.array([fit(d.iloc[rng.choice(idx, len(d))], cols)[k] for _ in range(NBOOT)])


def main(root):
    root = fetch(root)
    d = per_flight(root)
    print(f"flights used: {len(d)} (cruise samples {d.n.min()} to {d.n.max()}); payload counts "
          f"{d.payload.value_counts().sort_index().to_dict()}; speeds {sorted(d.speed.unique())}")
    print(f"mean cruise power by payload (W): {d.groupby('payload').p.mean().round(1).to_dict()}")
    print(f"mean cruise power by speed (W):   {d.groupby('speed').p.mean().round(1).to_dict()}")
    res = {}
    for name, cols in [("ln m + speed + speed^2 + wind", None), ("ln m only", [0, 1]),
                       ("ln m + speed + speed^2", [0, 1, 2, 3])]:
        b = fit(d, cols)
        bs = boot(d, cols)
        lo, hi = np.percentile(bs, [2.5, 97.5])
        res[name] = (b[1], lo, hi)
        print(f"mass exponent [{name}]: {b[1]:.3f}  95% CI [{lo:.3f}, {hi:.3f}] (width {hi - lo:.3f})")
    # sub-samples: only R1, only speed 4..8 (comparable wind/regime)
    for name, sub in [("R1 only", d[d.route == "R1"]), ("alt 25 only", d[d.alt == "25"])]:
        b = fit(sub)
        bs = boot(sub, None)
        lo, hi = np.percentile(bs, [2.5, 97.5])
        print(f"mass exponent [{name}, n={len(sub)}]: {b[1]:.3f}  95% CI [{lo:.3f}, {hi:.3f}]")
    # day-level confound: payload mix by date
    mix = d.groupby("date").payload.agg(["count", "nunique"])
    print(f"dates: {len(mix)}; dates with a single payload: {(mix['nunique'] == 1).sum()}")
    b = fit(d)
    dd = d.copy()
    x, y, m = design(dd)
    # speed effect at mean wind and 1 payload mix: model-predicted rise 4 -> 12 m/s
    f = lambda s: b[2] * s + b[3] * s * s
    rise = math.exp(f(12) - f(4)) - 1
    print(f"fitted speed effect 4 -> 12 m/s: {100 * rise:+.1f}% ; 4 -> 8: {100 * (math.exp(f(8) - f(4)) - 1):+.1f}%")
    # ratio of electrical to ideal induced power
    for pay in (0, 250, 500):
        mm = BASE_MASS + pay / 1000
        pi = (mm * G) ** 1.5 / math.sqrt(2 * RHO * DISC_A)
        sub = d[d.payload == pay]
        if len(sub):
            print(f"payload {pay} g: P_i = {pi:.0f} W, mean cruise P = {sub.p.mean():.0f} W, ratio {sub.p.mean() / pi:.2f}")
    # hover-on-ground tests are not flights; report H route for the absolute level
    par = pd.read_csv(os.path.join(root, "parameters.csv"))
    fl = pd.read_csv(os.path.join(root, "flights.csv"), usecols=["flight", "battery_voltage", "battery_current", "velocity_z"])
    h = fl[fl.flight.isin(par[par.route == "H"].flight)]
    h = h.assign(p=h.battery_voltage * h.battery_current.abs())
    print(f"route H (hover, 0 g): n flights {h.flight.nunique()}, mean P {h.p.mean():.0f} W")
    return res


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "data")
