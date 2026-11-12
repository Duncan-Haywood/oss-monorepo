"""Reference outputs for the synthetic-control engine, from pysyncon (MIT).

Run:  python3 eval/reference.py > eval/reference.json
Needs: pandas, scipy, pysyncon 1.7.0 (pip install pysyncon==1.7.0).

pysyncon is an independent Python implementation of Abadie & Gardeazabal
(2003) / Abadie, Diamond & Hainmueller (2010, 2015) whose own parity tests pin
it to R's Synth package. Nothing from it is ported into engine.mjs; this
script only records what it computes on the same data so the JavaScript tests
can compare.

Three cases on data/germany.csv (Abadie, Diamond & Hainmueller 2015):
  1. "adh2015": the paper's cross-validated V (train predictors 1971-80,
     fit V on GDP 1981-90; then predictors 1981-90 with that V).
  2. "nested": V chosen by Nelder-Mead from equal weights on the 1981-90
     predictors, minimising GDP MSPE 1960-89 (Synth's default nesting).
  3. "outcome_only": the pre-period GDP path itself as the predictors,
     equal V, which reduces to fitting the pre-period trajectory.
"""
import json
import sys

import numpy as np
import pandas as pd
import pysyncon
from pysyncon import Dataprep, Synth

DONORS = ["USA", "UK", "Austria", "Belgium", "Denmark", "France", "Italy",
          "Netherlands", "Norway", "Switzerland", "Japan", "Greece",
          "Portugal", "Spain", "Australia", "New Zealand"]

df = pd.read_csv(sys.argv[1] if len(sys.argv) > 1 else "data/germany.csv")


def prep(pred_years, school_years, invest, ssr, treated="West Germany", donors=DONORS):
    return Dataprep(
        foo=df, predictors=["gdp", "trade", "infrate"], predictors_op="mean",
        time_predictors_prior=pred_years,
        special_predictors=[("industry", pred_years, "mean"),
                            ("schooling", school_years, "mean"),
                            (invest, [1980], "mean")],
        dependent="gdp", unit_variable="country", time_variable="year",
        treatment_identifier=treated, controls_identifier=donors,
        time_optimize_ssr=ssr)


def result(s, dp, label):
    Z0, Z1 = dp.make_outcome_mats(time_period=range(1960, 2004))
    synth = (Z0 @ s.W)
    years = list(range(1960, 2004))
    return {
        "case": label,
        "weights": {k: float(v) for k, v in zip(dp.controls_identifier, s.W)},
        "V": [float(v) for v in np.asarray(s.V)],
        "loss_V": float(s.loss_V),
        "loss_W": float(s.loss_W),
        "years": years,
        "synthetic": [float(x) for x in synth],
        "treated": [float(x) for x in Z1],
    }


out = {"pysyncon": pysyncon.__version__ if hasattr(pysyncon, "__version__") else "1.7.0",
       "numpy": np.__version__, "pandas": pd.__version__}
import scipy
out["scipy"] = scipy.__version__

train = prep(range(1971, 1981), [1970, 1975], "invest70", range(1981, 1991))
st = Synth(); st.fit(dataprep=train, optim_method="Nelder-Mead", optim_initial="equal")
main = prep(range(1981, 1991), [1980, 1985], "invest80", range(1960, 1990))
sm = Synth(); sm.fit(dataprep=main, optim_method="Nelder-Mead", optim_initial="equal", custom_V=st.V)
r = result(sm, main, "adh2015")
r["train_V"] = [float(v) for v in np.asarray(st.V)]
r["train_loss_V"] = float(st.loss_V)
out["adh2015"] = r

sn = Synth(); sn.fit(dataprep=main, optim_method="Nelder-Mead", optim_initial="equal")
out["nested"] = result(sn, main, "nested")

# Outcome-only: every pre-period year's GDP as its own predictor, equal V.
pre = list(range(1960, 1990))
dpo = Dataprep(foo=df, predictors=[], predictors_op="mean", time_predictors_prior=pre,
               special_predictors=[("gdp", [y], "mean") for y in pre],
               dependent="gdp", unit_variable="country", time_variable="year",
               treatment_identifier="West Germany", controls_identifier=DONORS,
               time_optimize_ssr=pre)
so = Synth(); so.fit(dataprep=dpo, custom_V=np.full(len(pre), 1 / len(pre)))
out["outcome_only"] = result(so, dpo, "outcome_only")

json.dump(out, sys.stdout, indent=1)
print()
