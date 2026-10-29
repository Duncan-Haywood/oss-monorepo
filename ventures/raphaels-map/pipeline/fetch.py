#!/usr/bin/env python3
"""Download the official source files Raphael's Map is built from.

Run where the network reaches the publishers (a GitHub runner does; the cloud
agent containers usually do not). Every source is tried independently: a
failure is recorded in raw/manifest.json with its reason and the rest carry
on, so a blocked or moved file shows as "not fetched", never as made-up data.

    python3 pipeline/fetch.py --out raw [--only acs,gss]

Nothing here transforms numbers. pipeline/build.py reads raw/ and writes the
published aggregates in data/.
"""
from __future__ import annotations

import argparse
import datetime as dt
import gzip
import hashlib
import html
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

UA = "raphaels-map-fetch/1.0 (+https://github.com/duncan-haywood/oss-monorepo)"
MANIFEST: dict = {"started_at": None, "sources": {}}


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def get(url: str, *, tries: int = 3, timeout: int = 120) -> bytes:
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (400, 401, 403, 404, 410):
                break
        except Exception as e:  # noqa: BLE001 - recorded, then retried
            last = e
        time.sleep(2 * (i + 1))
    raise RuntimeError(f"{url}: {last}")


def links(page_url: str, pattern: str) -> list[str]:
    body = get(page_url).decode("utf-8", "replace")
    out = []
    for href in re.findall(r'href=["\']([^"\']+)["\']', body, flags=re.I):
        href = html.unescape(href)
        if re.search(pattern, href, flags=re.I):
            out.append(urllib.parse.urljoin(page_url, href))
    return sorted(set(out))


def record(source: str, **kw) -> None:
    MANIFEST["sources"].setdefault(source, {"files": [], "errors": [], "notes": []})
    entry = MANIFEST["sources"][source]
    for k, v in kw.items():
        if k in ("files", "errors", "notes"):
            entry[k].extend(v if isinstance(v, list) else [v])
        else:
            entry[k] = v


def save(out: Path, source: str, name: str, data: bytes, url: str) -> Path:
    p = out / source / name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)
    record(source, files=[{"path": str(p.relative_to(out)), "url": url, "bytes": len(data),
                           "sha256": hashlib.sha256(data).hexdigest(), "retrieved_at": now()}])
    print(f"  saved {p} ({len(data):,} bytes)")
    return p


def attempt(source: str):
    def deco(fn):
        def run(out: Path):
            print(f"== {source}")
            try:
                fn(out)
                MANIFEST["sources"].setdefault(source, {"files": [], "errors": [], "notes": []})
                MANIFEST["sources"][source]["status"] = (
                    "fetched" if MANIFEST["sources"][source]["files"] else "nothing_found")
            except Exception as e:  # noqa: BLE001 - a failed source must not stop the others
                print(f"  FAILED: {e}")
                record(source, status="failed", errors=[str(e)[:500]])
        run.source = source
        return run
    return deco


# ---------------------------------------------------------------- Census ACS

ACS_GROUPS = ["B01001", "B12002", "B01003"]
ACS_GEOS = {
    "county": "for=county:*",
    "state": "for=state:*",
    "cbsa": "for=metropolitan%20statistical%20area/micropolitan%20statistical%20area:*",
    "us": "for=us:1",
}


@attempt("acs5")
def fetch_acs(out: Path) -> None:
    key = os.environ.get("CENSUS_API_KEY", "")
    for year in (2024, 2023):
        base = f"https://api.census.gov/data/{year}/acs/acs5"
        try:
            meta = get(f"{base}/groups/B01001.json")
        except RuntimeError as e:
            record("acs5", notes=[f"{year} not available: {e}"])
            continue
        record("acs5", vintage=year, dataset_url=base)
        save(out, "acs5", f"{year}/groups_B01001.json", meta, f"{base}/groups/B01001.json")
        for g in ACS_GROUPS[1:]:
            save(out, "acs5", f"{year}/groups_{g}.json", get(f"{base}/groups/{g}.json"), f"{base}/groups/{g}.json")
        for g in ACS_GROUPS:
            for geo, clause in ACS_GEOS.items():
                url = f"{base}?get=NAME,group({g})&{clause}" + (f"&key={key}" if key else "")
                shown = url.replace(key, "KEY") if key else url
                data = get(url, timeout=300)
                save(out, "acs5", f"{year}/{g}_{geo}.json", data, shown)
        return
    raise RuntimeError("no ACS 5-year vintage in (2024, 2023) answered")


@attempt("census_geo")
def fetch_census_geo(out: Path) -> None:
    # County internal points (lat/lon) for distance; county -> CBSA delineation.
    for year in (2024, 2023):
        url = f"https://www2.census.gov/geo/docs/maps-data/data/gazetteer/{year}_Gazetteer/{year}_Gaz_counties_national.zip"
        try:
            save(out, "census_geo", f"{year}_Gaz_counties_national.zip", get(url), url)
            break
        except RuntimeError as e:
            record("census_geo", notes=[str(e)])
    for url in (
        "https://www2.census.gov/programs-surveys/metro-micro/geographies/reference-files/2023/delineation-files/list1_2023.xlsx",
        "https://www2.census.gov/programs-surveys/metro-micro/geographies/reference-files/2020/delineation-files/list1_2020.xls",
    ):
        try:
            save(out, "census_geo", url.rsplit("/", 1)[1], get(url), url)
            break
        except RuntimeError as e:
            record("census_geo", notes=[str(e)])


# ------------------------------------------------------ U.S. Religion Census

@attempt("usrc2020")
def fetch_usrc(out: Path) -> None:
    pages = [
        "https://www.usreligioncensus.org/node/1639",
        "https://www.usreligioncensus.org/index.php/node/1639",
        "https://www.usreligioncensus.org/data",
        "https://www.thearda.com/data-archive?fid=RCMSCY20",
        "https://www.thearda.com/data-archive?fid=RCMSST20",
    ]
    found: list[str] = []
    for p in pages:
        try:
            body = get(p).decode("utf-8", "replace")
            save(out, "usrc2020", "pages/" + re.sub(r"[^A-Za-z0-9]+", "_", p)[-80:] + ".html", body.encode(), p)
            for href in re.findall(r'href=["\']([^"\']+)["\']', body, flags=re.I):
                href = urllib.parse.urljoin(p, html.unescape(href))
                if re.search(r"\.(xlsx?|csv|zip|sav|dta)(\?|$)", href, flags=re.I) or "download" in href.lower():
                    found.append(href)
        except RuntimeError as e:
            record("usrc2020", notes=[str(e)])
    found = sorted(set(found))
    record("usrc2020", notes=[f"candidate links: {found[:60]}"])
    n = 0
    for href in found:
        if not re.search(r"(count|group|detail|rcms|2020|summary)", href, flags=re.I):
            continue
        try:
            data = get(href, timeout=300)
        except RuntimeError as e:
            record("usrc2020", notes=[str(e)])
            continue
        if data[:15].lower().startswith((b"<!doctype", b"<html")):
            continue
        name = urllib.parse.unquote(urllib.parse.urlparse(href).path.rsplit("/", 1)[-1]) or f"file{n}"
        save(out, "usrc2020", "files/" + name, data, href)
        n += 1
        if n >= 12:
            break


# ------------------------------------------------------- General Social Survey

GSS_COLS = [
    "year", "id", "wtssall", "wtssps", "wtssnrps", "wtsscomp", "vstrat", "vpsu", "sex", "age",
    "marital", "relig", "relig16", "reliten", "attend", "childs", "chldidel", "fefam",
    "fepresch", "fechld", "fehome", "meovrwrk", "divlaw", "polviews", "partyid", "region",
    "srcbelt", "xnorcsiz", "res16", "family16", "degree", "educ", "hunt", "hunt1", "sibs",
    "realinc", "hispanic", "race", "born", "wrkstat", "evwork", "denom", "fund", "pray",
    "postlife", "bible", "cohort", "ballot", "formwt", "oversamp", "sampcode", "sample",
]


@attempt("gss")
def fetch_gss(out: Path) -> None:
    import pandas as pd  # runner installs pandas + pyreadstat
    pages = [
        "https://gss.norc.org/us/en/gss/get-the-data/stata.html",
        "https://gss.norc.org/get-the-data/stata",
        "https://gss.norc.org/us/en/gss/get-the-data.html",
    ]
    cands: list[str] = []
    for p in pages:
        try:
            cands += links(p, r"\.zip")
        except RuntimeError as e:
            record("gss", notes=[str(e)])
    cands = sorted(set(cands))
    record("gss", notes=[f"zip links: {cands[:40]}"])
    cumul = [c for c in cands if re.search(r"cumul|7224|_stata\.zip$", c, re.I) and "stata" in c.lower()]
    tries = cumul + ["https://gss.norc.org/content/dam/gss/get-the-data/documents/stata/GSS_stata.zip"]
    for url in tries:
        try:
            blob = get(url, timeout=900)
        except RuntimeError as e:
            record("gss", notes=[str(e)])
            continue
        z = zipfile.ZipFile(io.BytesIO(blob))
        dta = [n for n in z.namelist() if n.lower().endswith(".dta")]
        record("gss", notes=[f"{url} members: {z.namelist()[:20]}"])
        if not dta:
            continue
        member = max(dta, key=lambda n: z.getinfo(n).file_size)
        tmp = out / "gss" / "_tmp.dta"
        tmp.parent.mkdir(parents=True, exist_ok=True)
        tmp.write_bytes(z.read(member))
        cols = None
        import pyreadstat
        _, meta = pyreadstat.read_dta(str(tmp), metadataonly=True)
        have = [c for c in GSS_COLS if c in meta.column_names]
        df, meta = pyreadstat.read_dta(str(tmp), usecols=have, apply_value_formats=False)
        df = df[df["year"] >= 2000]
        buf = io.StringIO()
        df.to_csv(buf, index=False)
        save(out, "gss", "gss_2000plus_selected.csv.gz", gzip.compress(buf.getvalue().encode()), url)
        labels = {c: {"label": meta.column_names_to_labels.get(c),
                      "values": {str(k): v for k, v in (meta.variable_value_labels.get(c) or {}).items()}}
                  for c in have}
        save(out, "gss", "gss_selected_labels.json", json.dumps(labels, indent=1).encode(), url)
        record("gss", notes=[f"member {member}; missing columns: {[c for c in GSS_COLS if c not in have]}"])
        tmp.unlink()
        return
    raise RuntimeError("no GSS cumulative Stata file could be read")


# --------------------------------------------- National Survey of Family Growth

@attempt("nsfg")
def fetch_nsfg(out: Path) -> None:
    base = "https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Datasets/NSFG/"
    names: list[str] = []
    for sub in ("2022-2023/", ""):
        try:
            names += [u for u in links(base + sub, r"2022.?2023|22_23|2223")]
        except RuntimeError as e:
            record("nsfg", notes=[str(e)])
    names = sorted(set(names))
    record("nsfg", notes=[f"listing matches: {names[:60]}"])
    for doc in ("https://www.cdc.gov/nchs/nsfg/nsfg-2022-2023-puf.htm",):
        try:
            body = get(doc)
            save(out, "nsfg", "nsfg-2022-2023-puf.html", body, doc)
            more = links(doc, r"(Fem|female).*\.(csv|zip|dat|sas|txt|pdf)$")
            names += more
            record("nsfg", notes=[f"doc page links: {more[:40]}"])
        except RuntimeError as e:
            record("nsfg", notes=[str(e)])
    for url in sorted(set(names)):
        if not re.search(r"fem", url, re.I):
            continue
        if not re.search(r"\.(csv|zip)$", url, re.I):
            continue
        data = get(url, timeout=900)
        name = url.rsplit("/", 1)[1]
        if len(data) > 60_000_000:
            data, name = gzip.compress(data), name + ".gz"
        save(out, "nsfg", name, data, url)


# -------------------------------------------- International: UN, World Bank, Eurostat

COUNTRIES = ["USA", "POL", "ESP", "PRT", "DEU", "HRV", "SVK", "HUN", "PHL", "MEX", "COL",
             "PER", "BRA", "ARG", "KOR", "VNM", "ITA", "CHL", "GTM", "CRI", "AUT", "IRL"]


@attempt("wpp2024")
def fetch_wpp(out: Path) -> None:
    import pandas as pd
    url = ("https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/"
           "WPP2024_Demographic_Indicators_Medium.csv.gz")
    blob = get(url, timeout=900)
    df = pd.read_csv(io.BytesIO(blob), compression="gzip", low_memory=False)
    df = df[df["ISO3_code"].isin(COUNTRIES) & (df["Time"].between(1990, 2030))]
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    save(out, "wpp2024", "demographic_indicators_selected.csv", buf.getvalue().encode(), url)


@attempt("worldbank")
def fetch_wb(out: Path) -> None:
    for ind in ("SP.DYN.TFRT.IN", "SP.POP.TOTL"):
        url = (f"https://api.worldbank.org/v2/country/{';'.join(COUNTRIES)}/indicator/{ind}"
               "?format=json&per_page=20000&date=1990:2025")
        save(out, "worldbank", f"{ind}.json", get(url), url)


@attempt("eurostat")
def fetch_eurostat(out: Path) -> None:
    for ds in ("demo_ndivind", "demo_nind"):
        url = f"https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{ds}?format=JSON&lang=EN"
        save(out, "eurostat", f"{ds}.json", get(url, timeout=300), url)


# ---------------------------------------------------- Exploratory proxies (P2)

@attempt("mit_election")
def fetch_election(out: Path) -> None:
    # MIT Election Data and Science Lab, County Presidential Election Returns 2000-2024.
    api = "https://dataverse.harvard.edu/api/datasets/:persistentId/?persistentId=doi:10.7910/DVN/VOQCHQ"
    meta = json.loads(get(api))
    save(out, "mit_election", "dataset.json", json.dumps(meta, indent=1).encode(), api)
    files = meta["data"]["latestVersion"]["files"]
    for f in files:
        df = f["dataFile"]
        if re.search(r"\.(csv|tab)$", df.get("filename", ""), re.I):
            url = f"https://dataverse.harvard.edu/api/access/datafile/{df['id']}?format=original"
            save(out, "mit_election", df["filename"], get(url, timeout=600), url)


@attempt("homeschool")
def fetch_homeschool(out: Path) -> None:
    page = "https://education.jhu.edu/edpolicy/policy-research-initiatives/homeschool-hub/"
    body = get(page)
    save(out, "homeschool", "hub.html", body, page)
    for href in links(page, r"\.(xlsx?|csv)(\?|$)")[:10]:
        save(out, "homeschool", urllib.parse.unquote(href.rsplit("/", 1)[1].split("?")[0]), get(href), href)


ALL = [fetch_acs, fetch_census_geo, fetch_usrc, fetch_gss, fetch_nsfg, fetch_wpp, fetch_wb,
       fetch_eurostat, fetch_election, fetch_homeschool]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", default="raw")
    ap.add_argument("--only", default="", help="comma list of source ids")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    mpath = out / "manifest.json"
    if mpath.exists():
        MANIFEST.update(json.loads(mpath.read_text()))
    MANIFEST["started_at"] = now()
    only = {s for s in a.only.split(",") if s}
    for fn in ALL:
        if only and fn.source not in only:
            continue
        MANIFEST["sources"].pop(fn.source, None)
        fn(out)
    MANIFEST["finished_at"] = now()
    mpath.write_text(json.dumps(MANIFEST, indent=1))
    print(json.dumps({k: v.get("status") for k, v in MANIFEST["sources"].items()}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
