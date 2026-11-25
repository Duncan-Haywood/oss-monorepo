"""Independent reference values from pvlib-python for the engine's tests.

Writes check/pvlib_reference.json; reference.test.mjs compares the engine
with it, so the tests run without Python. Regenerate with

    python3 -m pip install pvlib==0.16.1
    python3 ventures/pv-row-spacing-optimizer/check/pvlib_reference.py

Sections:
  sun:       pvlib SPA apparent zenith and azimuth at 300 seeded instants and
             places (the engine uses NOAA's shorter series).
  clearsky:  pvlib's Ineichen-Perez at pvlib's own apparent zenith, typed
             Linke turbidity and altitude.
  shade:     pvlib.shading.shaded_fraction1d for fixed rows at seeded
             geometry (sun, tilt, GCR, azimuth).
  tracker:   pvlib.tracking.singleaxis rotation, with and without
             backtracking.
  annual:    a whole clear-sky year through pvlib.bifacial.infinite_sheds
             (front side): annual direct and sky-diffuse irradiation on rows,
             for fixed tilt and backtracking trackers at several GCRs. The
             engine recomputes these from its own sun, clear sky and geometry.
"""
import json
import pathlib

import numpy as np
import pandas as pd
import pvlib
from pvlib import bifacial, location, shading, tracking, irradiance

rng = np.random.default_rng(20261124)
out = {"pvlib": pvlib.__version__}

# --- sun position -------------------------------------------------------
n = 300
ms = rng.integers(pd.Timestamp("2000-01-01", tz="UTC").value // 10**6,
                  pd.Timestamp("2040-01-01", tz="UTC").value // 10**6, n)
lat = rng.uniform(-60, 60, n)
lon = rng.uniform(-180, 180, n)
sun = []
for t, la, lo in zip(ms, lat, lon):
    idx = pd.DatetimeIndex([pd.Timestamp(int(t), unit="ms", tz="UTC")])
    sp = pvlib.solarposition.spa_python(idx, la, lo)
    sun.append({"ms": int(t), "lat": float(la), "lon": float(lo),
                "apparentZenith": float(sp["apparent_zenith"].iloc[0]),
                "zenith": float(sp["zenith"].iloc[0]),
                "azimuth": float(sp["azimuth"].iloc[0])})
out["sun"] = sun

# --- clear sky ----------------------------------------------------------
cs = []
for k in range(200):
    z = float(rng.uniform(0, 89.5))
    doy = int(rng.integers(1, 366))
    tl = float(rng.uniform(1.5, 6))
    alt = float(rng.uniform(0, 3000))
    am = pvlib.atmosphere.get_relative_airmass(z, "kastenyoung1989")
    amabs = pvlib.atmosphere.get_absolute_airmass(am, pvlib.atmosphere.alt2pres(alt))
    ext = irradiance.get_extra_radiation(doy, method="spencer")
    r = pvlib.clearsky.ineichen(z, amabs, tl, altitude=alt, dni_extra=ext)
    cs.append({"apparentZenith": z, "doy": doy, "tl": tl, "altitude": alt,
               "ghi": float(r["ghi"]), "dni": float(r["dni"]), "dhi": float(r["dhi"])})
out["clearsky"] = cs

# --- fixed-row shaded fraction ------------------------------------------
sh = []
for k in range(300):
    zen = float(rng.uniform(0, 88))
    az = float(rng.uniform(0, 360))
    tilt = float(rng.uniform(0, 60))
    gcr = float(rng.uniform(0.15, 0.9))
    facing = float(rng.choice([180.0, 160.0, 200.0, 0.0]))
    # pvlib: axis_azimuth is along the row, rotation is right-handed about
    # it; a row facing `facing` has axis azimuth facing - 90 and rotation +tilt.
    axis = (facing - 90) % 360
    fs = shading.shaded_fraction1d(zen, az, axis, tilt, collector_width=1.0,
                                   pitch=1.0 / gcr)
    sh.append({"zenith": zen, "azimuth": az, "tilt": tilt, "gcr": gcr,
               "facing": facing, "fs": float(fs)})
out["shade"] = sh

# --- tracker rotation ---------------------------------------------------
tr = []
for k in range(300):
    zen = float(rng.uniform(0, 89))
    az = float(rng.uniform(0, 360))
    gcr = float(rng.uniform(0.2, 0.7))
    axis = float(rng.choice([180.0, 170.0, 0.0]))
    mx = float(rng.choice([45.0, 55.0, 60.0]))
    row = {"zenith": zen, "azimuth": az, "gcr": gcr, "axisAzimuth": axis, "maxAngle": mx}
    for bt in (True, False):
        r = tracking.singleaxis(zen, az, axis_tilt=0, axis_azimuth=axis,
                                max_angle=mx, backtrack=bt, gcr=gcr)
        v = np.ravel(np.asarray(r["tracker_theta"], dtype=float))[0]
        row["bt" if bt else "true"] = None if np.isnan(v) else float(v)
    tr.append(row)
out["tracker"] = tr

# --- a clear-sky year through infinite_sheds ----------------------------
site = {"lat": 35.0, "lon": -106.6, "altitude": 1500, "tl": 3.0}
times = pd.date_range("2025-01-01 00:30", "2025-12-31 23:30", freq="1h", tz="UTC")
loc = location.Location(site["lat"], site["lon"], altitude=site["altitude"])
sp = loc.get_solarposition(times)
csy = loc.get_clearsky(times, model="ineichen", linke_turbidity=site["tl"])
day = sp["apparent_zenith"] < 90
annual = []
for case in [
    {"kind": "fixed", "tilt": 25, "gcr": 0.4},
    {"kind": "fixed", "tilt": 30, "gcr": 0.6},
    {"kind": "fixed", "tilt": 15, "gcr": 0.7},
    {"kind": "tracker", "gcr": 0.35},
    {"kind": "tracker", "gcr": 0.5},
]:
    if case["kind"] == "fixed":
        tilt = pd.Series(float(case["tilt"]), index=times)
        azi = pd.Series(180.0, index=times)
    else:
        t = tracking.singleaxis(sp["apparent_zenith"], sp["azimuth"], axis_tilt=0,
                                axis_azimuth=180, max_angle=60, backtrack=True,
                                gcr=case["gcr"])
        tilt = t["surface_tilt"].fillna(0)
        azi = t["surface_azimuth"].fillna(180)
    r = bifacial.infinite_sheds.get_irradiance_poa(
        surface_tilt=tilt, surface_azimuth=azi,
        solar_zenith=sp["apparent_zenith"], solar_azimuth=sp["azimuth"],
        gcr=case["gcr"], height=1.5, pitch=2.0 / case["gcr"],
        ghi=csy["ghi"], dhi=csy["dhi"], dni=csy["dni"], albedo=0.2,
        model="isotropic")
    case["direct"] = float(r["poa_direct"][day].sum() / 1000)
    case["sky"] = float(r["poa_sky_diffuse"][day].sum() / 1000)
    annual.append(case)
out["annual"] = {"site": site, "cases": annual,
                 "ghi": float(csy["ghi"].sum() / 1000), "dni": float(csy["dni"].sum() / 1000)}

path = pathlib.Path(__file__).with_name("pvlib_reference.json")
path.write_text(json.dumps(out, indent=0, sort_keys=True) + "\n")
print("wrote", path, {k: len(v) if isinstance(v, list) else "" for k, v in out.items()})
for c in annual:
    print(c)
