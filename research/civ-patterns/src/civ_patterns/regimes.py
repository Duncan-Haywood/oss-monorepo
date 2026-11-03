"""Regime spells from Polity5 (Marshall and Gurr 2020, p5v2018d.xls, Center for Systemic Peace).

Polity5's terms forbid redistributing the data, so it is not in this repository: `fetch()`
downloads it to a local cache. Only derived figures (fits, rates, forecasts) are committed.

A Polity "regime spell" (polity period) ends with a change of 3 or more points in the POLITY
score within three years, a transition period (-88), an interregnum or collapse (-77), or a
foreign interruption (-66); Gates et al. (2006) use the same notion of "polity duration".
Spells coded -66/-77/-88 are gaps between regimes, not regimes, and are not units here.
"""
import os
import urllib.request
from pathlib import Path

import numpy as np

URL = "https://www.systemicpeace.org/inscr/p5v2018d.xls"
CACHE = Path(os.environ.get("CIV_PATTERNS_CACHE", Path.home() / ".cache" / "civ-patterns"))
DATA_END = 2018.999  # Polity5 observation ends 31 Dec 2018; spells coded 9999 are censored there
DATA_START = 1800.0


def fetch():
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / "p5v2018d.xls"
    if not f.exists():
        urllib.request.urlretrieve(URL, f)
    return f


def _date(y, m, d):
    m = 6 if m in (None, 99) or m != m else m
    d = 15 if d in (None, 99) or d != d else d
    return y + (m - 1) / 12 + (d - 1) / 365


def regime_type(polity):
    """Polity's three-way convention: democracy >= 6, autocracy <= -6, anocracy -5..5."""
    if polity >= 6:
        return "democracy"
    if polity <= -6:
        return "autocracy"
    return "anocracy"


def load(path=None):
    """List of dict spells: country, scode, polity, type, start, end (decimal years), event, and
    left_truncated (spell already running when the data begin in 1800)."""
    import pandas as pd
    d = pd.read_excel(path or fetch())
    out = []
    for r in d.itertuples(index=False):
        if r.polity in (-66, -77, -88):
            continue
        start = _date(r.byear, r.bmonth, r.bday)
        ongoing = r.eyear == 9999
        end = DATA_END if ongoing else _date(r.eyear, r.emonth, r.eday)
        if start >= DATA_END:
            continue  # a few countries carry spells coded into 2019-2020; cover all equally to 2018
        if end > DATA_END:
            end, ongoing = DATA_END, True
        if end <= start:
            end = start + 1 / 365
        out.append({"country": r.country.strip(), "scode": r.scode, "polity": int(r.polity),
                    "type": regime_type(r.polity), "start": start, "end": end,
                    "event": 0 if ongoing else 1, "left_truncated": r.byear <= DATA_START})
    return out


TYPES = ("democracy", "anocracy", "autocracy")


def covariates(spells):
    """Indicator columns (anocracy, autocracy); democracy is the baseline."""
    return np.array([[s["type"] == "anocracy", s["type"] == "autocracy"] for s in spells], float)


def window(spells, cutoff):
    """The data as they looked at `cutoff`: spells begun before it, censored at it.
    Left-truncated spells (already running in 1800) are dropped: their age is unknown."""
    out = []
    for s in spells:
        if s["left_truncated"] or s["start"] >= cutoff:
            continue
        ended = s["event"] == 1 and s["end"] <= cutoff
        out.append(dict(s, end=min(s["end"], cutoff), event=1 if ended else 0))
    return out


def alive_at(spells, cutoff):
    """Regimes in place at `cutoff`, with their age then and whether and when they later ended."""
    out = []
    for s in spells:
        if s["left_truncated"] or s["start"] >= cutoff or s["end"] <= cutoff:
            continue
        if s["event"] == 0 and s["end"] < cutoff:
            continue
        out.append(dict(s, age=cutoff - s["start"]))
    return out
