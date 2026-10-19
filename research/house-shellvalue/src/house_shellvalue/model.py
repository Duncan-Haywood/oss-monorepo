"""Join two sibling models: what a factory shell costs (house-offsite) and what the
days it saves are worth in interest (house-schedule).

house-schedule reports interest as a percent of the sale price, so the saving in
dollars needs a house price, which this project takes as a parameter. It is not
sourced. The offsite premium is house-offsite's panelised-minus-site shell cost
in dollars, from rates that house-offsite says are assumptions.

Mismatch to keep in view: house-schedule's shell replaces framing AND roof
(20 working days of site work), while house-offsite prices only the wall panels.
So the interest side is generous to the factory and the cost side is narrow.
"""
import statistics as st
from dataclasses import replace

from house_offsite import Process, compare
from house_schedule import Params, run_many


def premium_dollars(process=None, **kw):
    """Panelised shell cost minus site-built shell cost, dollars (house-offsite)."""
    r = compare(process or Process(), **kw)
    return r["off_cost"] - r["site_cost"]


def shell_value(params=None, n=2000, order_early=False, prefab_lead=25.0, price=450_000.0):
    """Mean working days and mean interest dollars saved by a factory shell, against
    the same site-built house on the same random numbers."""
    base = params or Params()
    site = replace(base, prefab_shell=False, order_early=order_early)
    fac = replace(base, prefab_shell=True, order_early=order_early, prefab_lead=prefab_lead)
    ts, is_ = run_many(site, n)
    tf, if_ = run_many(fac, n)
    days = st.mean(ts) - st.mean(tf)
    pct = st.mean(is_) - st.mean(if_)
    return {"days_saved": days, "interest_pct_saved": pct, "interest_saved": pct / 100 * price}


def breakeven_price(interest_pct_saved, premium):
    """House price at which the interest saved equals the premium. None if no saving."""
    if interest_pct_saved <= 0:
        return None
    return premium / (interest_pct_saved / 100)
