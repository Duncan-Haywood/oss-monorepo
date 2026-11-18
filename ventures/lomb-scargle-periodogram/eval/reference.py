"""Reference values from astropy's LombScargle (BSD-3-Clause), used only as an
independent check of engine.mjs; no astropy code is ported.

    python3 eval/reference.py > eval/reference.json   (astropy 6.1.4, numpy 2.1.3, scipy 1.14.1)
"""
import json
import numpy as np
import astropy
from astropy.timeseries import LombScargle

here = __file__.rsplit("/", 2)[0]
rows = [l.split(",") for l in open(f"{here}/data/hd164922-rv.csv").read().strip().split("\n")[1:]]
t = np.array([float(r[0]) for r in rows])
y = np.array([float(r[1]) for r in rows])
dy = np.array([float(r[2]) for r in rows])
sel = np.array([r[3] == "j" for r in rows])  # one instrument: astropy has one floating mean

freqs = np.array([1 / 1195.0, 1 / 75.74, 1 / 41.75, 1 / 12.47, 0.0123, 0.1, 0.25, 0.4])
cases = {}
for name, w in (("weighted", True), ("unweighted", False)):
    ls = LombScargle(t[sel], y[sel], dy[sel] if w else None, fit_mean=True, center_data=True, normalization="standard")
    cases[name] = {"freqs": freqs.tolist(), "power": ls.power(freqs).tolist()}
    zs = [0.05, 0.08, 0.1, 0.15, 0.3]
    cases[name]["fap_z"] = zs
    # astropy snaps maximum_frequency onto its own grid before the bound
    cases[name]["fap_fmax"] = float(ls.autofrequency(maximum_frequency=0.5, return_freq_limits=True)[1])
    cases[name]["fap_baluev"] = [float(v) for v in ls.false_alarm_probability(np.array(zs), method="baluev", maximum_frequency=0.5)]
    # one autopower grid, its best peak
    f, p = ls.autopower(minimum_frequency=1 / 7000, maximum_frequency=0.5, samples_per_peak=5)
    cases[name]["best_period"] = float(1 / f[np.argmax(p)])
    cases[name]["best_power"] = float(p.max())

rng = np.random.default_rng(7)
ts = np.sort(rng.uniform(0, 100, 60))
ys = 3 * np.sin(2 * np.pi * ts / 7.3 + 0.4) + rng.normal(0, 1, 60)
ls = LombScargle(ts, ys, fit_mean=True, center_data=True)
sf = np.linspace(0.01, 1.0, 25)
cases["synthetic"] = {"t": ts.tolist(), "y": ys.tolist(), "freqs": sf.tolist(), "power": ls.power(sf).tolist()}
print(json.dumps({"versions": {"astropy": astropy.__version__, "numpy": np.__version__}, "instrument": "j", "cases": cases}, indent=1))
