#!/usr/bin/env python3
"""Build data/intl/countries.json (and pipeline/registry/intl.json) from raw files.

    python3 -I pipeline/build_intl.py --raw /tmp/rm-raw --out data

Reads, without network:

- raw/wpp2024/demographic_indicators_selected.csv  UN World Population
  Prospects 2024, medium variant (fetch.py keeps the 22 countries, 1990-2030).
- raw/worldbank/SP.DYN.TFRT.IN.json, SP.POP.TOTL.json  World Bank WDI API.
- raw/eurostat/demo_ndivind.json, demo_nind.json  Eurostat JSON-stat 2.0.
- raw/manifest.json  URLs, SHA-256 and retrieval times, carried into sources.

Rules (ARCHITECTURE.md, SPEC 3, 6.1, 10):

- Every number is read from one of those files. A cell a source does not
  have is null with a flag (`not_published`: the source has no such cell;
  `not_ingested`: the source has it but we have not fetched or imported it).
- WPP years after the last estimate year are projections, class
  `projection`, and never sit in the same field as an estimate.
- World Bank total fertility is a cross-check column only; WPP is the
  primary source. Differences of 0.05 births per woman or more are noted.
- Crude divorce rate is divorces per 1,000 residents in a year. It is never
  a probability that a marriage ends in divorce (SPEC 10.8).
- Values-survey cells (ISSP, EVS/WVS, Latinobarometro, DHS) stay null with
  `not_ingested` until the user imports a licensed file
  (docs/dataset_imports.md). No global score: countries are grouped by
  which sources cover them (SPEC 3).
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import sys
from pathlib import Path

# WPP 2024 publishes estimates for 1950-2023 and projections from 2024
# (UN DESA Population Division, "World Population Prospects 2024:
# Methodology"; the CSV itself has no estimate/projection column).
WPP_LAST_ESTIMATE_YEAR = 2023
WPP_PROJECTION_YEAR = 2030  # the last year fetch.py keeps
WB_DISCREPANCY_TFR = 0.05   # births per woman
WB_DISCREPANCY_POP = 0.01   # relative

# ISO3 -> (ISO2 used by Eurostat, or None when Eurostat does not report it).
# Order is the SPEC 3 order: initial countries, then the optional next ones.
COUNTRIES = [
    ("POL", "PL", "initial"), ("ESP", "ES", "initial"), ("PRT", "PT", "initial"),
    ("DEU", "DE", "initial"), ("HRV", "HR", "initial"), ("SVK", "SK", "initial"),
    ("HUN", "HU", "initial"), ("PHL", None, "initial"), ("MEX", None, "initial"),
    ("COL", None, "initial"), ("PER", None, "initial"), ("BRA", None, "initial"),
    ("ARG", None, "initial"), ("KOR", None, "initial"), ("VNM", None, "initial"),
    ("USA", None, "initial"), ("ITA", "IT", "optional"), ("CHL", None, "optional"),
    ("GTM", None, "optional"), ("CRI", None, "optional"), ("AUT", "AT", "optional"),
    ("IRL", "IE", "optional"),
]

# Countries SPEC 4 lists as covered by ISSP 2022 (to be confirmed on import).
ISSP2022_LISTED = {"USA", "POL", "ESP", "DEU", "HRV", "SVK", "PHL"}
LATAM = {"MEX", "COL", "PER", "BRA", "ARG", "CHL", "GTM", "CRI"}

EUROSTAT_INDICATORS = {
    # metric_id: (dataset, indic_de code, label)
    "crude_marriage_rate": ("demo_nind", "GNUPRT", "Crude marriage rate"),
    "mean_age_first_marriage_women": ("demo_nind", "FAGEMAR1", "Mean age at first marriage - females"),
    "crude_divorce_rate": ("demo_ndivind", "GDIVRT", "Crude divorce rate"),
}
EUROSTAT_SERIES_FROM = 1990

GATED = ["issp2022", "evs_wvs_2017_2022", "latinobarometro2024", "dhs"]


def obs(e=None, *, flags=None, **extra) -> dict:
    o = {"e": e, "moe": None, "flags": list(flags or [])}
    o.update({k: v for k, v in extra.items() if v is not None})
    return o


def num(s):
    if s is None:
        return None
    s = str(s).strip()
    if s == "":
        return None
    return float(s)


# ------------------------------------------------------------------ JSON-stat

def jsonstat_cells(d: dict):
    """Yield ({dim: category_code}, value, status) for every cell with a value.

    Handles JSON-stat 2.0 datasets as Eurostat serves them: `value` and
    `status` either dense lists or sparse {flat_index: x} objects, category
    `index` either a {code: position} object or a list of codes. The flat
    index is row-major over `id` with sizes `size` (last dimension fastest).
    """
    ids, sizes = d["id"], d["size"]
    if len(ids) != len(sizes):
        raise ValueError("JSON-stat: id and size differ in length")
    codes = []
    for dim, size in zip(ids, sizes):
        idx = d["dimension"][dim]["category"].get("index")
        if idx is None:  # single-category dimension may omit index
            idx = list(d["dimension"][dim]["category"]["label"].keys())
        if isinstance(idx, dict):
            by_pos = [None] * size
            for code, pos in idx.items():
                by_pos[pos] = code
        else:
            by_pos = list(idx)
        if len(by_pos) != size or any(c is None for c in by_pos):
            raise ValueError(f"JSON-stat: dimension {dim} index does not match size {size}")
        codes.append(by_pos)
    values = d.get("value", {})
    status = d.get("status", {})
    if isinstance(values, list):
        items = ((i, v) for i, v in enumerate(values) if v is not None)
    else:
        items = ((int(k), v) for k, v in values.items() if v is not None)

    def stat(i):
        if isinstance(status, dict):
            return status.get(str(i))
        if isinstance(status, list):
            return status[i] if i < len(status) else None
        return status or None  # a single string applies to all cells

    total = 1
    for s in sizes:
        total *= s
    for i, v in items:
        if i >= total:
            raise ValueError(f"JSON-stat: flat index {i} outside cube of {total}")
        rem, coord = i, {}
        for dim, size, cs in zip(reversed(ids), reversed(sizes), reversed(codes)):
            coord[dim] = cs[rem % size]
            rem //= size
        yield coord, v, stat(i)


def eurostat_table(d: dict) -> dict:
    """{(indic_de, geo, year): (value, status_code)}"""
    out = {}
    for c, v, st in jsonstat_cells(d):
        if c.get("freq", "A") != "A":
            continue
        out[(c["indic_de"], c["geo"], int(c["time"]))] = (v, st)
    return out


def eurostat_status_labels(d: dict) -> dict:
    return ((d.get("extension") or {}).get("status") or {}).get("label") or {}


# ------------------------------------------------------------------- readers

def read_wpp(path: Path) -> dict:
    """{iso3: {"name", "note_code", "years": {year: row}}}"""
    out: dict = {}
    with path.open(newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r.get("Variant") != "Medium":
                raise ValueError(f"WPP: unexpected variant {r.get('Variant')!r}")
            iso = r["ISO3_code"]
            c = out.setdefault(iso, {"name": r["Location"], "note_code": r.get("Notes") or None, "years": {}})
            y = int(float(r["Time"]))
            if y in c["years"]:
                raise ValueError(f"WPP: duplicate row {iso} {y}")
            c["years"][y] = r
    return out


def read_worldbank(path: Path) -> tuple[dict, dict]:
    """({iso3: {year: value}}, page metadata). Missing values stay absent."""
    d = json.loads(path.read_text(encoding="utf-8"))
    if not (isinstance(d, list) and len(d) == 2 and isinstance(d[1], list)):
        raise ValueError(f"World Bank: unexpected shape in {path.name}")
    meta, rows = d
    if meta.get("pages", 1) != 1:
        raise ValueError(f"World Bank: {path.name} has {meta.get('pages')} pages, fetched 1")
    out: dict = {}
    for r in rows:
        if r.get("value") is None:
            continue
        out.setdefault(r["countryiso3code"], {})[int(r["date"])] = float(r["value"])
    return out, meta


# --------------------------------------------------------------------- build

def wpp_obs(row, col, year, cls, scale=1.0, digits=None):
    v = num(row.get(col)) if row else None
    if v is None:
        return obs(None, flags=["not_published"], year=year, source_id="wpp2024", source_variable=col, **{"class": cls})
    v = v * scale
    if digits is not None:
        v = round(v, digits)
    if scale != 1.0 and float(v).is_integer():
        v = int(v)
    return obs(v, year=year, source_id="wpp2024", source_variable=col, **{"class": cls})


def build(raw: Path, generated_at: str | None = None) -> tuple[dict, dict]:
    manifest = {}
    if (raw / "manifest.json").exists():
        manifest = json.loads((raw / "manifest.json").read_text(encoding="utf-8")).get("sources", {})
    problems: list[str] = []
    ingested: set[str] = set()

    wpp_path = raw / "wpp2024" / "demographic_indicators_selected.csv"
    wpp = {}
    if wpp_path.exists():
        wpp = read_wpp(wpp_path)
        ingested.add("wpp2024")
    else:
        problems.append(f"missing {wpp_path}")

    wb_tfr, wb_pop, wb_meta = {}, {}, {}
    p = raw / "worldbank" / "SP.DYN.TFRT.IN.json"
    if p.exists():
        wb_tfr, wb_meta = read_worldbank(p)
        ingested.add("worldbank")
    else:
        problems.append(f"missing {p}")
    p = raw / "worldbank" / "SP.POP.TOTL.json"
    if p.exists():
        wb_pop, _ = read_worldbank(p)
    else:
        problems.append(f"missing {p}")

    euro: dict = {}
    euro_status: dict = {}
    euro_meta: dict = {}
    for ds in ("demo_ndivind", "demo_nind"):
        p = raw / "eurostat" / f"{ds}.json"
        if not p.exists():
            problems.append(f"missing {p}")
            continue
        d = json.loads(p.read_text(encoding="utf-8"))
        euro[ds] = eurostat_table(d)
        euro_status.update(eurostat_status_labels(d))
        euro_meta[ds] = {"updated": d.get("updated"), "label": d.get("label")}
        ingested.add("eurostat")

    countries = []
    for iso3, iso2, tier in COUNTRIES:
        w = wpp.get(iso3)
        if w is None and wpp:
            problems.append(f"WPP has no rows for {iso3}")
        name = w["name"] if w else iso3
        years = w["years"] if w else {}
        est = years.get(WPP_LAST_ESTIMATE_YEAR)
        proj = years.get(WPP_PROJECTION_YEAR)
        o: dict = {}
        y0 = WPP_LAST_ESTIMATE_YEAR
        o[f"tfr_{y0}"] = wpp_obs(est, "TFR", y0, "observed")
        o[f"tfr_{WPP_PROJECTION_YEAR}_projection"] = wpp_obs(proj, "TFR", WPP_PROJECTION_YEAR, "projection")
        o[f"mean_age_childbearing_{y0}"] = wpp_obs(est, "MAC", y0, "observed")
        o[f"population_{y0}"] = wpp_obs(est, "TPopulation1July", y0, "observed", scale=1000, digits=0)
        o[f"female_population_{y0}"] = wpp_obs(est, "TPopulationFemale1July", y0, "observed", scale=1000, digits=0)
        # WPP publishes population by single age and sex in a separate file
        # (Population by age, both sexes/female) that fetch.py does not fetch.
        o[f"women_20_29_{y0}"] = obs(None, flags=["not_ingested"], year=y0, source_id="wpp2024",
                                     note="WPP age-by-sex file not fetched; the demographic-indicators file has no age detail.")

        # Eurostat
        for mid, (ds, code, _label) in EUROSTAT_INDICATORS.items():
            if iso2 is None:
                o[mid] = obs(None, flags=["not_published"], source_id="eurostat", indicator=f"{ds}/{code}",
                             note="Eurostat does not report this country.")
                continue
            table = euro.get(ds)
            if table is None:
                o[mid] = obs(None, flags=["not_ingested"], source_id="eurostat", indicator=f"{ds}/{code}")
                continue
            cells = {y: vs for (ind, geo, y), vs in table.items() if ind == code and geo == iso2}
            if not cells:
                o[mid] = obs(None, flags=["not_published"], source_id="eurostat", indicator=f"{ds}/{code}")
                continue
            ly = max(cells)
            v, st = cells[ly]
            o[mid] = obs(v, year=ly, source_id="eurostat", indicator=f"{ds}/{code}", geo=iso2,
                         status_code=st, status_label=euro_status.get(st) if st else None)

        # Values surveys: gated, nothing imported.
        for sid in GATED:
            o[f"values_{sid}"] = obs(None, flags=["not_ingested"], source_id=sid, source_status="gated")

        # Series for the page's charts: WPP TFR with estimate/projection kept apart.
        series = {
            "tfr_wpp_estimate": [[y, num(years[y]["TFR"])] for y in sorted(years)
                                 if y <= WPP_LAST_ESTIMATE_YEAR and num(years[y]["TFR"]) is not None],
            "tfr_wpp_projection": [[y, num(years[y]["TFR"])] for y in sorted(years)
                                   if y > WPP_LAST_ESTIMATE_YEAR and num(years[y]["TFR"]) is not None],
        }
        if iso2:
            for mid in ("crude_marriage_rate", "crude_divorce_rate"):
                ds, code, _ = EUROSTAT_INDICATORS[mid]
                t = euro.get(ds) or {}
                series[mid] = [[y, v] for (ind, geo, y), (v, _s) in sorted(t.items(), key=lambda kv: kv[0][2])
                               if ind == code and geo == iso2 and y >= EUROSTAT_SERIES_FROM]

        # Cross-check: World Bank vs WPP, same year.
        cc = {}
        wb_t = wb_tfr.get(iso3, {}).get(y0)
        wpp_t = num(est["TFR"]) if est else None
        if wb_t is None:
            cc["tfr_worldbank"] = obs(None, flags=["not_published" if wb_tfr else "not_ingested"], year=y0,
                                      source_id="worldbank", indicator="SP.DYN.TFRT.IN")
        else:
            diff = round(wb_t - wpp_t, 4) if wpp_t is not None else None
            cc["tfr_worldbank"] = obs(wb_t, year=y0, source_id="worldbank", indicator="SP.DYN.TFRT.IN",
                                      wpp_e=wpp_t, diff_vs_wpp=diff,
                                      discrepancy=bool(diff is not None and abs(diff) >= WB_DISCREPANCY_TFR))
        wb_p = wb_pop.get(iso3, {}).get(y0)
        wpp_p = o[f"population_{y0}"]["e"]
        if wb_p is None:
            cc["population_worldbank"] = obs(None, flags=["not_published" if wb_pop else "not_ingested"], year=y0,
                                             source_id="worldbank", indicator="SP.POP.TOTL")
        else:
            rel = round((wb_p - wpp_p) / wpp_p, 4) if wpp_p else None
            cc["population_worldbank"] = obs(int(wb_p), year=y0, source_id="worldbank", indicator="SP.POP.TOTL",
                                             wpp_e=wpp_p, rel_diff_vs_wpp=rel,
                                             discrepancy=bool(rel is not None and abs(rel) >= WB_DISCREPANCY_POP))
        wb_latest = max(wb_tfr.get(iso3, {}) or [None]) if wb_tfr.get(iso3) else None

        have = sorted(
            ({"wpp2024"} if w else set())
            | ({"eurostat"} if iso2 and any(o[m]["e"] is not None for m in EUROSTAT_INDICATORS) else set()))
        countries.append({
            "iso3": iso3, "iso2_eurostat": iso2, "name": name, "tier": tier,
            "wpp_note_code": w["note_code"] if w else None,
            "availability": {
                "ingested_sources": have,
                "gated_sources_not_imported": GATED,
                "issp2022_listed_in_spec": iso3 in ISSP2022_LISTED,
                "latinobarometro_region": iso3 in LATAM,
                "values_evidence": None,
            },
            "observations": o,
            "cross_check": cc,
            "worldbank_latest_tfr_year": wb_latest,
            "series": series,
        })

    # Group by which sources cover each country; no global score.
    groups: dict = {}
    for c in countries:
        a = c["availability"]
        key = "+".join(a["ingested_sources"]) or "none"
        gid = {"eurostat+wpp2024": "wpp_and_eurostat", "wpp2024": "wpp_only"}.get(key, key)
        groups.setdefault(gid, {"id": gid, "sources": a["ingested_sources"], "countries": []})["countries"].append(c["iso3"])
    group_text = {
        "wpp_and_eurostat": "UN fertility and population, plus Eurostat marriage and divorce registrations (EU members). "
                            "Values surveys not imported.",
        "wpp_only": "UN fertility and population only; no harmonised marriage/divorce registration series ingested. "
                    "Values surveys not imported.",
    }
    for g in groups.values():
        g["description"] = group_text.get(g["id"], "Sources: " + ", ".join(g["sources"]))
        g["values_evidence"] = None

    discrepancies = [
        f"{c['iso3']}: World Bank TFR {c['cross_check']['tfr_worldbank']['e']} vs WPP {c['cross_check']['tfr_worldbank'].get('wpp_e')} "
        f"({WPP_LAST_ESTIMATE_YEAR}, diff {c['cross_check']['tfr_worldbank'].get('diff_vs_wpp')})"
        for c in countries if c["cross_check"]["tfr_worldbank"].get("discrepancy")
    ] + [
        f"{c['iso3']}: World Bank population {c['cross_check']['population_worldbank']['e']} vs WPP "
        f"{c['cross_check']['population_worldbank'].get('wpp_e')} (rel diff {c['cross_check']['population_worldbank'].get('rel_diff_vs_wpp')})"
        for c in countries if c["cross_check"]["population_worldbank"].get("discrepancy")
    ]

    registry = build_registry(manifest, ingested, wb_meta, euro_meta)
    out = {
        "generated_at": generated_at or dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "generated_by": "pipeline/build_intl.py",
        "source_ids": sorted(ingested) + GATED,
        "wpp_last_estimate_year": WPP_LAST_ESTIMATE_YEAR,
        "countries": countries,
        "groups": sorted(groups.values(), key=lambda g: -len(g["sources"])),
        "metrics": registry["metrics"],
        "cross_check_discrepancies": discrepancies,
        "parse_problems": problems,
        "notes": NOTES,
    }
    return out, registry


NOTES = (
    "Country level only (SPEC 3). Total fertility rate is childbearing behaviour, not desired or ideal family size. "
    f"WPP 2024 values for {WPP_LAST_ESTIMATE_YEAR} and earlier are estimates; later years are projections (medium variant) "
    "and are labelled class 'projection'. Crude divorce rate is divorces per 1,000 residents in a year: it is never the "
    "probability that a marriage ends in divorce, and a low value can reflect few marriages, law, or unregistered "
    "separation. Eurostat years differ by country (latest available is shown, with its year). World Bank figures are "
    "a cross-check only. Values-survey cells (ISSP, EVS/WVS, Latinobarometro, DHS) are null until a user imports a "
    "licensed file; countries are grouped by data availability, not ranked by a global score. A country's averages "
    "are not a claim about any individual."
)

CRUDE_DIVORCE_CAVEAT = ("Divorces in the year per 1,000 average population (all ages). Not the probability that a "
                        "marriage ends in divorce; depends on how many people are married, on law and on registration.")


def build_registry(manifest: dict, ingested: set, wb_meta: dict, euro_meta: dict) -> dict:
    def files(sid):
        return [{"url": f["url"], "sha256": f["sha256"]} for f in (manifest.get(sid) or {}).get("files", [])]

    def retrieved(sid):
        fs = (manifest.get(sid) or {}).get("files", [])
        return max((f.get("retrieved_at") for f in fs if f.get("retrieved_at")), default=None)

    def status(sid):
        return "ingested" if sid in ingested else (
            "failed" if (manifest.get(sid) or {}).get("status") == "failed" else "not_ingested")

    y0 = WPP_LAST_ESTIMATE_YEAR
    sources = [
        {"id": "wpp2024", "title": "World Population Prospects 2024, demographic indicators (medium variant)",
         "provider": "United Nations, Department of Economic and Social Affairs, Population Division",
         "landing_url": "https://population.un.org/wpp/", "dataset_version": "WPP 2024",
         "reference_period": f"1990-{WPP_PROJECTION_YEAR} (estimates to {y0}, projections after)",
         "retrieved_at": retrieved("wpp2024"), "license": "CC BY 3.0 IGO (UN WPP terms of use; verify on the landing page)",
         "access": "public download", "status": status("wpp2024"), "files": files("wpp2024"),
         "citation": "United Nations, Department of Economic and Social Affairs, Population Division (2024). "
                     "World Population Prospects 2024.",
         "notes": "Population columns are published in thousands; multiplied by 1,000 here. The file has no "
                  "age-by-sex detail. WPP note codes kept per country as wpp_note_code (ESP 25, USA 32); their "
                  "text is in the WPP notes table, not fetched."},
        {"id": "worldbank", "title": "World Development Indicators: SP.DYN.TFRT.IN, SP.POP.TOTL",
         "provider": "World Bank", "landing_url": "https://data.worldbank.org/",
         "dataset_version": f"API lastupdated {wb_meta.get('lastupdated')}" if wb_meta else None,
         "reference_period": "1990-2025", "retrieved_at": retrieved("worldbank"), "license": "CC BY 4.0",
         "access": "public API", "status": status("worldbank"), "files": files("worldbank"),
         "citation": "World Bank, World Development Indicators.",
         "notes": "Cross-check only. WDI fertility and population for many countries draw on UN WPP and national "
                  "statistics, so agreement is not independent confirmation."},
        {"id": "eurostat", "title": "Eurostat divorce indicators (demo_ndivind) and marriage indicators (demo_nind)",
         "provider": "Eurostat", "landing_url": "https://ec.europa.eu/eurostat/databrowser/view/demo_ndivind/default/table?lang=en",
         "dataset_version": "; ".join(f"{k} updated {v.get('updated')}" for k, v in sorted(euro_meta.items())) or None,
         "reference_period": "1960-2024 (varies by country)", "retrieved_at": retrieved("eurostat"),
         "license": "Eurostat reuse policy (CC BY 4.0; verify on the landing page)", "access": "public API", "status": status("eurostat"),
         "files": files("eurostat"),
         "citation": "Eurostat, demo_ndivind and demo_nind, doi:10.2908/DEMO_NDIVIND, doi:10.2908/DEMO_NIND.",
         "notes": "EU/EFTA reporting countries only. Status codes (p provisional, e estimated, b break in series, "
                  "i imputed) kept per value. " + CRUDE_DIVORCE_CAVEAT},
        {"id": "issp2022", "title": "ISSP 2022: Family and Changing Gender Roles V",
         "provider": "International Social Survey Programme / GESIS",
         "landing_url": "https://www.gesis.org/en/issp/data-and-documentation/family-and-changing-gender-roles/2022",
         "dataset_version": None, "reference_period": "fieldwork years vary by country", "retrieved_at": None,
         "license": "GESIS data use terms; registration required; respondent-level file must not be redistributed",
         "access": "registration required; user-supplied file via pipeline/import_issp.py", "status": "gated",
         "files": [], "citation": "ISSP Research Group, International Social Survey Programme: Family and Changing "
                                  "Gender Roles V - ISSP 2022 (GESIS). Cite the exact version and DOI of the file you import.",
         "notes": "SPEC 4 lists US, Poland, Spain, Germany, Croatia, Slovakia and Philippines among participants; confirm on import."},
        {"id": "issp_family_waves", "title": "ISSP Family and Changing Gender Roles, earlier waves",
         "provider": "International Social Survey Programme / GESIS",
         "landing_url": "https://www.gesis.org/en/issp/data-and-documentation/family-and-changing-gender-roles",
         "dataset_version": None, "reference_period": "1988, 1994, 2002, 2012", "retrieved_at": None,
         "license": "GESIS data use terms; registration required", "access": "registration required; no importer yet",
         "status": "gated", "files": [], "citation": "ISSP Research Group (GESIS). Cite the wave and DOI.",
         "notes": "Older data are historical, not current estimates (SPEC 4, 6.2)."},
        {"id": "evs_wvs_2017_2022", "title": "Joint EVS/WVS 2017-2022 dataset",
         "provider": "European Values Study / World Values Survey Association (GESIS)",
         "landing_url": "https://www.gesis.org/en/european-values-study/data-and-documentation/joint-evs/wvs-2017-2022-dataset",
         "dataset_version": None, "reference_period": "2017-2022", "retrieved_at": None,
         "license": "EVS/WVS terms of use; registration required; respondent-level file must not be redistributed",
         "access": "registration required (GESIS, or the WVS site https://www.worldvaluessurvey.org/WVSEVSjoint2017.jsp); "
                   "user-supplied file via pipeline/import_wvs_evs.py",
         "status": "gated", "files": [], "citation": "EVS/WVS (2022). Joint EVS/WVS 2017-2022 Dataset. Cite the exact version and DOI.",
         "notes": "Variable availability differs by country and survey."},
        {"id": "latinobarometro2024", "title": "Latinobarometro 2024", "provider": "Corporacion Latinobarometro",
         "landing_url": "https://www.latinobarometro.org/latinobarometro-2024", "dataset_version": None,
         "reference_period": "2024", "retrieved_at": None, "license": "Latinobarometro terms; registration required",
         "access": "registration required; no importer yet", "status": "gated", "files": [],
         "citation": "Corporacion Latinobarometro, Latinobarometro 2024.",
         "notes": "18 Latin American territories; check the 2024 questionnaire wording before use."},
        {"id": "dhs", "title": "Demographic and Health Surveys", "provider": "The DHS Program (ICF, USAID-funded)",
         "landing_url": "https://dhsprogram.com/data/", "dataset_version": None, "reference_period": "varies by country wave",
         "retrieved_at": None, "license": "DHS data use terms; account and project approval required",
         "access": "account and per-project permission; no importer yet", "status": "gated", "files": [],
         "citation": "The DHS Program. Cite the country survey and recode.",
         "notes": "Ideal number of children (V613) where a country wave exists; not all countries."},
    ]
    def m(metric_id, label, unit, definition, src, var, cls, universe, caveats, method, higher_is="neither", **kw):
        d = {"metric_id": metric_id, "label": label, "short": kw.pop("short", label), "universe": universe,
             "unit": unit, "definition": definition, "source_variable_ids": var, "method": method,
             "source_id": src, "class": cls, "caveats": caveats, "higher_is": higher_is, "level": "country"}
        d.update(kw)
        return d

    tfr_cav = "Childbearing behaviour in the period, not ideal or intended family size."
    metrics = [
        m(f"tfr_{y0}", f"Total fertility rate, {y0} (estimate)", "births per woman",
          "Average number of live births a woman would have over her reproductive life at the period's age-specific rates.",
          "wpp2024", ["TFR"], "observed", "Women of reproductive age, whole country", tfr_cav, "Read from WPP 2024", year=y0,
          short="TFR"),
        m(f"tfr_{WPP_PROJECTION_YEAR}_projection", f"Total fertility rate, {WPP_PROJECTION_YEAR} (UN projection)",
          "births per woman", "WPP 2024 medium-variant projection.", "wpp2024", ["TFR"], "projection",
          "Women of reproductive age, whole country", tfr_cav + " A model projection, not an observation.",
          "Read from WPP 2024 medium variant", year=WPP_PROJECTION_YEAR, short="TFR projected"),
        m(f"mean_age_childbearing_{y0}", f"Mean age at childbearing, {y0}", "years",
          "Mean age of mothers at the birth of their children (all birth orders).", "wpp2024", ["MAC"], "observed",
          "Births in the year", "All births, not first births.", "Read from WPP 2024", year=y0, short="Mean age at childbearing"),
        m(f"population_{y0}", f"Population, 1 July {y0}", "persons", "Total population at 1 July.", "wpp2024",
          ["TPopulation1July"], "observed", "All residents", "Published in thousands.", "WPP thousands x 1,000",
          higher_is="more", year=y0, short="Population"),
        m(f"female_population_{y0}", f"Female population, 1 July {y0}", "persons", "Female population, all ages.",
          "wpp2024", ["TPopulationFemale1July"], "observed", "Female residents, all ages",
          "All ages, not the 20-29 target band.", "WPP thousands x 1,000", higher_is="more", year=y0, short="Female population"),
        m(f"women_20_29_{y0}", f"Women 20-29, {y0}", "persons", "Female population aged 20-29.", "wpp2024", [],
          "observed", "Female residents 20-29", "Not ingested: needs the WPP population-by-age file.", "Not built",
          higher_is="more", year=y0, short="Women 20-29"),
        m("crude_marriage_rate", "Crude marriage rate", "marriages per 1,000 population",
          "Marriages in the year per 1,000 average population.", "eurostat", ["demo_nind/GNUPRT"], "observed",
          "All residents (all ages)", "Year differs by country; all-age denominator.", "Latest available year from Eurostat",
          short="Marriages per 1,000"),
        m("mean_age_first_marriage_women", "Mean age at first marriage, women", "years",
          "Mean age of women at first marriage in the year.", "eurostat", ["demo_nind/FAGEMAR1"], "observed",
          "Women marrying for the first time in the year", "Year differs by country.", "Latest available year from Eurostat",
          short="Women's mean age at first marriage"),
        m("crude_divorce_rate", "Crude divorce rate", "divorces per 1,000 population",
          "Divorces in the year per 1,000 average population.", "eurostat", ["demo_ndivind/GDIVRT"], "proxy",
          "All residents (all ages)", CRUDE_DIVORCE_CAVEAT, "Latest available year from Eurostat", higher_is="neither",
          short="Divorces per 1,000"),
        m("tfr_worldbank", f"Total fertility rate, World Bank, {y0} (cross-check)", "births per woman",
          "World Development Indicators SP.DYN.TFRT.IN.", "worldbank", ["SP.DYN.TFRT.IN"], "observed",
          "Whole country", "Cross-check only; often derived from WPP or national statistics.", "Compared with WPP, same year",
          year=y0, role="cross_check", short="TFR (World Bank)"),
        m("population_worldbank", f"Population, World Bank, {y0} (cross-check)", "persons",
          "World Development Indicators SP.POP.TOTL (midyear, de facto).", "worldbank", ["SP.POP.TOTL"], "observed",
          "All residents", "Cross-check only.", "Compared with WPP, same year", higher_is="more", year=y0,
          role="cross_check", short="Population (World Bank)"),
    ] + [
        m(f"values_{sid}", f"Values survey cells: {sid}", "percent", "Weighted shares from imported microdata.", sid, [],
          "survey_estimate", "Survey respondents (see crosstabs)", "Not imported: registration-gated dataset.",
          "pipeline/import_*.py on a user-supplied file", short=sid)
        for sid in GATED
    ]
    return {"sources": sources, "metrics": metrics}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--raw", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path, help="the data/ directory")
    ap.add_argument("--registry", type=Path, default=Path(__file__).resolve().parent / "registry" / "intl.json")
    a = ap.parse_args(argv)
    data, registry = build(a.raw)
    (a.out / "intl").mkdir(parents=True, exist_ok=True)
    (a.out / "intl" / "countries.json").write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    a.registry.parent.mkdir(parents=True, exist_ok=True)
    a.registry.write_text(json.dumps(registry, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {a.out / 'intl' / 'countries.json'}: {len(data['countries'])} countries; "
          f"groups {[(g['id'], len(g['countries'])) for g in data['groups']]}")
    for p in data["parse_problems"]:
        print("  problem:", p)
    for d in data["cross_check_discrepancies"]:
        print("  cross-check:", d)
    return 0


if __name__ == "__main__":
    sys.exit(main())
