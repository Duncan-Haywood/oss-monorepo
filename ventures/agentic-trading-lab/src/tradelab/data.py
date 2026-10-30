"""Market data: download on demand, cache locally, never commit.

Sources (both free, no key):

* Kenneth R. French Data Library, Tuck School of Business, Dartmouth:
  industry portfolios and the Fama-French factors, monthly from July 1926,
  built from CRSP. https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html
  The files are theirs to distribute, so this module fetches them into
  `.cache/` (git-ignored) rather than shipping a copy.
* Coinbase Exchange public candles (daily OHLCV) for crypto pairs.
  https://docs.cdp.coinbase.com/exchange/reference/exchangerestapi_getproductcandles

A `Panel` is the one shape the rest of the library uses: aligned period
returns (decimals, not percent), the risk-free rate for the same periods, and
the period labels.
"""
from __future__ import annotations

import csv
import io
import json
import os
import time
import urllib.request
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

FRENCH_BASE = "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/"
COINBASE_CANDLES = "https://api.exchange.coinbase.com/products/{pair}/candles"
CACHE = Path(os.environ.get("TRADELAB_CACHE", Path(__file__).resolve().parents[2] / ".cache"))
USER_AGENT = "agentic-trading-lab/0.1 (+https://github.com/Duncan-Haywood/oss-monorepo)"


@dataclass
class Panel:
    """Aligned returns for a set of assets.

    returns: T x N array of simple period returns (0.01 == 1%).
    rf:      length-T risk-free return for the same periods.
    labels:  length-T period labels (YYYYMM for monthly, YYYY-MM-DD daily).
    assets:  N asset names.
    periods_per_year: 12 for monthly, 365 for crypto daily, 252 for equity daily.
    """

    returns: np.ndarray
    rf: np.ndarray
    labels: list[str]
    assets: list[str]
    periods_per_year: int
    source: str = ""
    meta: dict = field(default_factory=dict)

    def __post_init__(self):
        self.returns = np.asarray(self.returns, dtype=float)
        self.rf = np.asarray(self.rf, dtype=float)
        if self.returns.ndim != 2:
            raise ValueError("returns must be T x N")
        t, n = self.returns.shape
        if len(self.rf) != t or len(self.labels) != t or len(self.assets) != n:
            raise ValueError("returns, rf, labels and assets disagree in shape")

    def slice(self, start: str | None = None, end: str | None = None) -> "Panel":
        """Periods with start <= label <= end (string comparison on labels)."""
        keep = [i for i, lab in enumerate(self.labels)
                if (start is None or lab >= start) and (end is None or lab <= end)]
        if not keep:
            raise ValueError(f"no periods between {start} and {end}")
        lo, hi = keep[0], keep[-1] + 1
        return Panel(self.returns[lo:hi], self.rf[lo:hi], self.labels[lo:hi], list(self.assets),
                     self.periods_per_year, self.source, dict(self.meta))

    def select(self, assets: list[str]) -> "Panel":
        idx = [self.assets.index(a) for a in assets]
        return Panel(self.returns[:, idx], self.rf, list(self.labels), list(assets),
                     self.periods_per_year, self.source, dict(self.meta))


def _fetch(url: str, dest: Path, max_age_days: float) -> Path:
    if dest.exists() and (time.time() - dest.stat().st_mtime) < max_age_days * 86400:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = resp.read()
    tmp = dest.with_suffix(dest.suffix + ".part")
    tmp.write_bytes(body)
    tmp.replace(dest)
    return dest


def parse_french_csv(text: str, table: int = 0) -> tuple[list[str], list[str], np.ndarray]:
    """Parse one monthly table out of a Ken French CSV.

    The files hold several tables one after another (value-weighted monthly,
    equal-weighted monthly, annual, ...), each starting with a header row whose
    first cell is empty. Monthly rows have a six-digit YYYYMM label. Returns
    (labels, columns, values-in-percent). Missing values (-99.99, -999) become NaN.
    """
    tables: list[tuple[list[str], list[list[str]]]] = []
    cols: list[str] | None = None
    rows: list[list[str]] = []
    for raw in csv.reader(io.StringIO(text)):
        cells = [c.strip() for c in raw]
        if not cells or not any(cells):
            continue
        if cells[0] == "" and len(cells) > 1 and all(c for c in cells[1:]):
            if cols is not None and rows:
                tables.append((cols, rows))
            cols, rows = cells[1:], []
            continue
        if cols is not None and len(cells[0]) == 6 and cells[0].isdigit():
            rows.append(cells)
        elif cols is not None and rows:
            # A non-monthly row (annual block, footer) ends the monthly table.
            tables.append((cols, rows))
            cols, rows = None, []
    if cols is not None and rows:
        tables.append((cols, rows))
    if table >= len(tables):
        raise ValueError(f"table {table} not found; file has {len(tables)} monthly tables")
    cols, rows = tables[table]
    labels = [r[0] for r in rows]
    vals = np.array([[float(x) for x in r[1:len(cols) + 1]] for r in rows], dtype=float)
    vals[(vals <= -99.99) | (vals == -999)] = np.nan
    return labels, cols, vals


def french_table(name: str, table: int = 0, max_age_days: float = 7) -> tuple[list[str], list[str], np.ndarray]:
    zpath = _fetch(f"{FRENCH_BASE}{name}_CSV.zip", CACHE / f"{name}_CSV.zip", max_age_days)
    with zipfile.ZipFile(zpath) as zf:
        member = next(m for m in zf.namelist() if m.lower().endswith(".csv"))
        text = zf.read(member).decode("latin-1")
    return parse_french_csv(text, table)


def french_industries(n: int = 10, weighting: str = "value", max_age_days: float = 7) -> Panel:
    """Monthly returns of the Fama-French n-industry portfolios (n in 5,10,12,17,30,38,48,49).

    Joined with the one-month T-bill rate (RF) from the factors file. Periods
    where any industry is missing are dropped (the 49-industry file has gaps in
    the early years).
    """
    table = 0 if weighting == "value" else 1
    labels, cols, vals = french_table(f"{n}_Industry_Portfolios", table, max_age_days)
    flab, fcols, fvals = french_table("F-F_Research_Data_Factors", 0, max_age_days)
    rf_by = dict(zip(flab, fvals[:, fcols.index("RF")]))
    mkt_by = dict(zip(flab, fvals[:, fcols.index("Mkt-RF")] + fvals[:, fcols.index("RF")]))
    keep = [i for i, lab in enumerate(labels) if lab in rf_by and not np.isnan(vals[i]).any()]
    return Panel(
        returns=vals[keep] / 100.0,
        rf=np.array([rf_by[labels[i]] for i in keep]) / 100.0,
        labels=[labels[i] for i in keep],
        assets=cols,
        periods_per_year=12,
        source=f"Ken French Data Library, {n} industry portfolios ({weighting}-weighted), CRSP",
        meta={"market": np.array([mkt_by[labels[i]] for i in keep]) / 100.0},
    )


def french_market(max_age_days: float = 7) -> Panel:
    """The US market portfolio (Mkt-RF + RF) as a one-asset panel."""
    flab, fcols, fvals = french_table("F-F_Research_Data_Factors", 0, max_age_days)
    rf = fvals[:, fcols.index("RF")] / 100.0
    mkt = fvals[:, fcols.index("Mkt-RF")] / 100.0 + rf
    return Panel(mkt[:, None], rf, flab, ["MKT"], 12,
                 "Ken French Data Library, Fama-French market factor + RF, CRSP")


def coinbase_daily(pairs: list[str], start: str = "2016-01-01", end: str | None = None,
                   max_age_days: float = 1) -> Panel:
    """Daily close-to-close returns for Coinbase pairs (e.g. BTC-USD, ETH-USD).

    Only days on which every pair has a candle are kept. The risk-free rate is
    set to zero: there is no daily T-bill series here, and a cash balance at a
    retail broker often earns nothing. Say so wherever results are shown.
    """
    # Default to yesterday: today's candle is still forming.
    end = end or (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
    closes: dict[str, dict[str, float]] = {}
    for pair in pairs:
        dest = CACHE / f"coinbase_{pair}_{start}_{end}.json"
        if dest.exists() and (time.time() - dest.stat().st_mtime) < max_age_days * 86400:
            closes[pair] = json.loads(dest.read_text())
            continue
        series: dict[str, float] = {}
        t0 = datetime.fromisoformat(start).replace(tzinfo=timezone.utc)
        t_end = datetime.fromisoformat(end).replace(tzinfo=timezone.utc)
        while t0 < t_end:
            t1 = min(t0 + timedelta(days=299), t_end)
            url = (COINBASE_CANDLES.format(pair=pair) + "?granularity=86400"
                   f"&start={t0.strftime('%Y-%m-%dT%H:%M:%SZ')}&end={t1.strftime('%Y-%m-%dT%H:%M:%SZ')}")
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=60) as resp:
                candles = json.loads(resp.read())
            for ts, _low, _high, _open, close, _vol in candles:
                series[datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d")] = float(close)
            t0 = t1 + timedelta(days=1)
            time.sleep(0.35)  # stay well under the public rate limit
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(series))
        closes[pair] = series
    days = sorted(set.intersection(*(set(s) for s in closes.values())))
    px = np.array([[closes[p][d] for p in pairs] for d in days])
    rets = px[1:] / px[:-1] - 1.0
    return Panel(rets, np.zeros(len(days) - 1), days[1:], list(pairs), 365,
                 "Coinbase Exchange public daily candles (close to close, UTC days)")
