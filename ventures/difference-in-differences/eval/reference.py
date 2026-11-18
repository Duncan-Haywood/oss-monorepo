"""Reference numbers for the tests, from two independent implementations.

csdid 0.4.5 (MIT, https://github.com/d2cml-ai/csdid), a Python port of the R
`did` package by Callaway and Sant'Anna, for ATT(g,t), their analytical
standard errors, the aggregations and the Wald pre-test (bstrap=False).
pyfixest 0.70.0 (MIT) for the two-way fixed effects coefficient and its
unit-clustered standard error.

Run from this directory:
    python eval/reference.py      (writes eval/reference.json)
Needs pandas, numpy, csdid==0.4.5 and pyfixest==0.70.0. Not run by CI; the
JSON it writes is checked in and read by reference.test.mjs.
"""
import contextlib
import io
import json
import warnings

import numpy as np
import pandas as pd
import pyfixest as pf
from csdid.att_gt import ATTgt

warnings.filterwarnings("ignore")


def simulated():
    # A balanced panel with three cohorts, never-treated units and effects
    # that grow with time since treatment. Written to eval/simulated.csv so
    # the JavaScript tests read exactly these numbers.
    rng = np.random.default_rng(7)
    rows = []
    cohorts = [2004] * 12 + [2006] * 10 + [2008] * 8 + [0] * 20
    for i, g in enumerate(cohorts):
        a = rng.normal(0, 1)
        for t in range(2000, 2011):
            eff = 0.0 if g == 0 or t < g else 0.5 + 0.25 * (t - g)
            y = a + 0.1 * (t - 2000) + eff + rng.normal(0, 0.5)
            rows.append({"unit": f"u{i:02d}", "period": t, "y": round(y, 6), "first_treated": g})
    df = pd.DataFrame(rows)
    df.to_csv("eval/simulated.csv", index=False)
    return df


def fnum(x):
    x = float(x)
    return x if np.isfinite(x) else None  # strict JSON: NaN becomes null


def cs(df, y, idcol, control, base):
    with contextlib.redirect_stdout(io.StringIO()):  # csdid prints its tables
        return _cs(df, y, idcol, control, base)


def _cs(df, y, idcol, control, base):
    m = ATTgt(yname=y, tname="period" if "period" in df else "year", idname=idcol, gname="first_treated",
              data=df, control_group=control).fit(est_method="dr", base_period=base, bstrap=False)
    r = m.results
    out = {
        "attgt": [{"g": int(g), "t": int(t), "att": fnum(a), "se": fnum(s)}
                  for g, t, a, s in zip(r["group"], r["year"], r["att"], r["se"])],
        "W": None if m.MP.get("W") is None else float(m.MP["W"]),
        "Wpval": None if m.MP.get("Wpval") is None else float(m.MP["Wpval"]),
    }
    for typ in ["simple", "dynamic", "group"]:
        m.aggte(typec=typ, bstrap=False)
        a = m.atte
        out[typ] = {"att": float(a["overall_att"]), "se": float(a["overall_se"])}
        if a.get("egt") is not None:
            out[typ]["rows"] = [{"k": int(k), "att": fnum(v), "se": fnum(s)}
                                for k, v, s in zip(a["egt"], a["att_egt"], a["se_egt"])]
    return out


def twfe(df, y, unit, time, d):
    f = pf.feols(f"{y} ~ {d} | {unit} + {time}", data=df, vcov={"CRV1": unit})
    return {"beta": float(f.coef()[d]), "se": float(f.se()[d])}


def main():
    castle = pd.read_csv("data/castle.csv")
    castle["id"] = castle["state"].str[6:].astype(int)
    sim = simulated()
    sim["id"] = sim["unit"].str[1:].astype(int)
    sim["post"] = ((sim["first_treated"] > 0) & (sim["period"] >= sim["first_treated"])).astype(int)
    ref = {
        "software": {"csdid": "0.4.5", "pyfixest": pf.__version__, "pandas": pd.__version__, "numpy": np.__version__},
        "castle": {
            "never_varying": cs(castle, "l_homicide", "id", "nevertreated", "varying"),
            "notyet_varying": cs(castle, "l_homicide", "id", "notyettreated", "varying"),
            "never_universal": cs(castle, "l_homicide", "id", "nevertreated", "universal"),
            # the one-state cohorts (2006, 2010) dropped, as minCohort: 2 does
            "never_varying_min2": cs(castle[~castle["first_treated"].isin([2006, 2010])], "l_homicide", "id", "nevertreated", "varying"),
            "twfe": twfe(castle, "l_homicide", "state", "year", "post"),
        },
        "simulated": {
            "never_varying": cs(sim, "y", "id", "nevertreated", "varying"),
            "notyet_varying": cs(sim, "y", "id", "notyettreated", "varying"),
            "twfe": twfe(sim, "y", "unit", "period", "post"),
        },
    }
    with open("eval/reference.json", "w") as f:
        json.dump(ref, f, indent=1, allow_nan=False)
        f.write("\n")


if __name__ == "__main__":
    main()
