"""State residential prices from EIA (data/eia_prices.csv) as house_energy.Prices, per house-energy climate."""
import csv
from pathlib import Path

from house_energy import Prices

THERMS_PER_MCF = 10.37  # approximate heat content of 1 Mcf of natural gas
DATA = Path(__file__).resolve().parents[2] / "data" / "eia_prices.csv"
# house-energy climate -> state whose prices stand in for it (a judgement: one state, not a utility territory)
STATE = {"Miami (1A)": "Florida", "Houston (2A)": "Texas", "Atlanta (3A)": "Georgia", "Chicago (5A)": "Illinois",
         "Minneapolis (6A)": "Minnesota", "Duluth (7)": "Minnesota"}


def table():
    with open(DATA) as f:
        return {r["state"]: r for r in csv.DictReader(f)}


def prices_for(state):
    r = table()[state]
    return Prices(gas_per_therm=float(r["gas_usd_per_mcf_2025"]) / THERMS_PER_MCF,
                  elec_per_kwh=float(r["elec_cents_per_kwh_ytd_jan_jul_2026"]) / 100)
