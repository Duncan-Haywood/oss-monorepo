"""Builds data/inputs.csv from pvlib's bundled TMY files (NREL TMY3/TMY2, US public data) and demandlib's BDEW H0
standard load profile. Needs pvlib and demandlib; the model and tests do not.  python data/make_inputs.py"""
import os
import warnings
import numpy as np
import pvlib
from demandlib import bdew

warnings.simplefilter("ignore")
d = os.path.join(os.path.dirname(pvlib.__file__), "data")
t_gso = pvlib.iotools.read_tmy3(os.path.join(d, "723170TYA.CSV"), coerce_year=2023, map_variables=True)[0].temp_air.to_numpy()
t_sp = pvlib.iotools.read_tmy3(os.path.join(d, "703165TY.csv"), coerce_year=2023, map_variables=True)[0].temp_air.to_numpy()
t_mia = pvlib.iotools.read_tmy2(os.path.join(d, "12839.tm2"))[0].DryBulb.to_numpy() / 10.0  # TMY2 dry bulb is in tenths of C
h0 = bdew.ElecSlp(2023).get_scaled_power_profiles({"h0": 10800.0})["h0"].to_numpy()[: 8760 * 4].reshape(8760, 4).mean(axis=1)
assert len(t_gso) == len(t_sp) == len(t_mia) == 8760
out = np.column_stack([np.arange(8760), h0, t_gso, t_sp, t_mia])
here = os.path.dirname(os.path.abspath(__file__))
np.savetxt(os.path.join(here, "inputs.csv"), out, delimiter=",", header="hour,h0_kw,greensboro,sandpoint,miami", comments="", fmt=["%d", "%.4f", "%.1f", "%.1f", "%.1f"])
print("wrote", out.shape, "H0 kWh/yr", h0.sum().round(0), "Tmin/mean/max", [(t.min(), round(t.mean(), 1), t.max()) for t in (t_gso, t_sp, t_mia)])
