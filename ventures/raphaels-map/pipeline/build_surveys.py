#!/usr/bin/env python3
"""Build data/surveys/{questions,crosstabs}.json from the raw GSS and NSFG files.

    python3 -I pipeline/build_surveys.py --raw RAW_DIR --out ventures/raphaels-map/data

Reads (from the raphaels-map-raw branch, see ARCHITECTURE.md):
  RAW/gss/gss_2000plus_selected.csv.gz   GSS yearly Stata files 2000-2024, selected columns
  RAW/gss/gss_selected_labels.json       variable labels + Stata value labels
  RAW/nsfg/NSFG-2022-2023-FemRespPUFData.zip (or an extracted CSV under RAW/nsfg/)

Method and every caveat: docs/survey-methods.md. Statistics: survey_stats.py.
Nothing here invents a coding: GSS codes come from the Stata value labels
in the raw file; NSFG codes (the CSV carries none) are published only when
pipeline/registry/nsfg_codings.json records where they were confirmed.
"""
from __future__ import annotations

import argparse
import io
import json
import sys
import zipfile
from collections import OrderedDict
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from survey_stats import Design, estimate_table, kish_n_eff  # noqa: E402

GSS_WEIGHT = "wtssps"

# Periods are never pooled across the 2020-2021 design/mode break.
GSS_PERIODS = OrderedDict([
    ("2010-2018", {"years": [2010, 2012, 2014, 2016, 2018], "mode": "in-person (face-to-face) interviews",
                   "flags": []}),
    ("2021-2024", {"years": [2021, 2022, 2024], "mode": "2021 address-based push-to-web (web, some phone); "
                   "2022 and 2024 multimode (in-person and web)", "flags": ["mode_mixed"]}),
])

AGE_BANDS = OrderedDict([("18-29", (18, 29)), ("20-29", (20, 29)), ("30-44", (30, 44)), ("18+", (18, 200))])
SEXES = OrderedDict([("female", 2), ("male", 1)])
RELIGS = OrderedDict([("catholic", {2}), ("any", None)])
ATTENDS = OrderedDict([("weekly", {7, 8}), ("less", {0, 1, 2, 3, 4, 5, 6}), ("any", None)])
MARITALS = OrderedDict([("never_married", {5}), ("any", None)])

FILTER_DEFS = {
    "sex": "GSS SEX: 1 male, 2 female",
    "age_band": "GSS AGE at interview (89 = 89 or older); '18+' = all adult respondents incl. age not recorded",
    "relig": "GSS RELIG = 2 'catholic' (current religious preference, i.e. affiliation, not practice)",
    "attend": "GSS ATTEND: weekly = 7 'every week' or 8 'several times a week'; less = 0-6; DK/NA excluded from both",
    "marital": "GSS MARITAL = 5 'never married' (cohabiting is not separately identified)",
}

# Item definitions: category label -> codes. Labels quote the Stata value labels.
GSS_ITEMS = OrderedDict([
    ("chldidel", {
        "concept": "ideal_family_size", "alignment": "direct",
        "categories": OrderedDict([("None (0)", {0}), ("One", {1}), ("Two", {2}), ("Three", {3}),
                                   ("Four or more", {4, 5, 6, 7}), ("As many as you want", {8})]),
        "note": "General ideal for 'a family', not the respondent's own intention or expected births. "
                "Code 7 is '7 or more'. 'As many as you want' is a valid answer kept in the denominator; "
                "its share rises from about 7-12% of adults (2000-2018) to 24-31% (2021-2024) with the mode change, so 2010-2018 and 2021-2024 are not comparable.",
    }),
    ("fefam", {
        "concept": "role_norm_male_earner_female_homemaker", "alignment": "related",
        "categories": OrderedDict([("Strongly agree", {1}), ("Agree", {2}), ("Disagree", {3}), ("Strongly disagree", {4})]),
        "note": "A general role norm about families, not the respondent's own preference for her own life.",
    }),
    ("fepresch", {
        "concept": "role_norm_maternal_employment_preschool", "alignment": "related",
        "categories": OrderedDict([("Strongly agree", {1}), ("Agree", {2}), ("Disagree", {3}), ("Strongly disagree", {4})]),
        "note": "A general belief about mothers' employment, not a personal plan.",
    }),
    ("fechld", {
        "concept": "role_norm_maternal_employment_children", "alignment": "related",
        "categories": OrderedDict([("Strongly agree", {1}), ("Agree", {2}), ("Disagree", {3}), ("Strongly disagree", {4})]),
        "note": "Agreement means the respondent thinks a working mother can relate as well to children; "
                "a general belief, not a personal plan.",
    }),
    ("meovrwrk", {
        "concept": "role_norm_fathers_work_focus", "alignment": "related",
        "categories": OrderedDict([("Strongly agree", {1}), ("Agree", {2}), ("Neither agree nor disagree", {3}),
                                   ("Disagree", {4}), ("Strongly disagree", {5})]),
        "note": "General belief about fathers; code d is 'can't choose' and is excluded.",
    }),
    ("divlaw", {
        "concept": "divorce_law_attitude", "alignment": "related",
        "categories": OrderedDict([("Easier", {1}), ("More difficult", {2}), ("Stay as is", {3})]),
        "note": "An opinion on whether divorce in this country should be easier or more difficult to obtain "
                "by law. It is not the respondent's view of her own marriage and not a probability that a "
                "marriage lasts. Not asked in 2021.",
    }),
    ("attend", {
        "concept": "religious_service_attendance", "alignment": "direct",
        "categories": OrderedDict([("Several times a week", {8}), ("Every week", {7}), ("Nearly every week", {6}),
                                   ("2-3 times a month", {5}), ("About once a month", {4}),
                                   ("Several times a year", {3}), ("About once or twice a year", {2}),
                                   ("Less than once a year", {1}), ("Never", {0})]),
        "note": "Self-reported attendance at religious services (any religion's services). Tabulated by "
                "affiliation so 'Catholic' (affiliation) and 'attends weekly' (practice) are separate numbers.",
    }),
])

# Tables by region: only these subgroups (the target and its two parents).
REGION_SUBGROUPS = [
    {"sex": "female", "age_band": "18-29", "relig": "any", "attend": "any", "marital": "any"},
    {"sex": "female", "age_band": "18-29", "relig": "catholic", "attend": "any", "marital": "any"},
    {"sex": "female", "age_band": "18-29", "relig": "catholic", "attend": "weekly", "marital": "never_married"},
    {"sex": "female", "age_band": "18-44", "relig": "catholic", "attend": "weekly", "marital": "any"},
]
AGE_BANDS_EXTRA = {"18-44": (18, 44)}


# ------------------------------------------------------------------ loading

def load_gss(raw: Path):
    df = pd.read_csv(raw / "gss" / "gss_2000plus_selected.csv.gz", low_memory=False)
    labels = json.loads((raw / "gss" / "gss_selected_labels.json").read_text())
    return df, labels


def gss_analysis_frame(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Cases with a positive analysis weight; design keys; a dropped-case log."""
    log = {}
    no_w = df[GSS_WEIGHT].isna() | (df[GSS_WEIGHT] <= 0)
    log["dropped_no_weight"] = {str(k): int(v) for k, v in
                                df[no_w].groupby(["year", "sample"]).size().items()}
    d = df[~no_w].copy()
    d["_stratum"] = d["year"].astype(int).astype(str) + "_" + d["vstrat"].astype("Int64").astype(str)
    d["_psu"] = d["vpsu"].astype("Int64").astype(str)
    return d.reset_index(drop=True), log


def gss_missing_kind(d: pd.DataFrame, var: str, valid_codes: set) -> np.ndarray:
    """'iap' where the (year, ballot) cell has no valid answer to ``var`` (the
    item was not on that ballot that year); 'missing_unsplit' otherwise. The
    raw CSV carries Stata extended missing values (.d don't know, .n no
    answer, .r refused, .s skipped on web, .i iap) as blanks, so within an
    asked cell DK, no answer, refusal, web skip and split-form IAP cannot be
    told apart."""
    valid = d[var].isin(list(valid_codes))
    asked = valid.groupby([d["year"], d["ballot"]]).transform("sum") > 0
    return np.where(asked, "missing_unsplit", "iap").astype(object)


def domain_mask(d: pd.DataFrame, f: dict) -> np.ndarray:
    m = np.ones(len(d), bool)
    m &= (d["sex"] == SEXES[f["sex"]]).to_numpy()
    lo, hi = {**AGE_BANDS, **AGE_BANDS_EXTRA}[f["age_band"]]
    if f["age_band"] != "18+":
        m &= d["age"].between(lo, hi).to_numpy()
    if RELIGS[f["relig"]] is not None:
        m &= d["relig"].isin(RELIGS[f["relig"]]).to_numpy()
    if ATTENDS[f["attend"]] is not None:
        m &= d["attend"].isin(ATTENDS[f["attend"]]).to_numpy()
    if MARITALS[f["marital"]] is not None:
        m &= d["marital"].isin(MARITALS[f["marital"]]).to_numpy()
    if "region" in f:
        m &= (d["region"] == int(f["region"])).to_numpy()
    return m


def filter_grid():
    for sex in SEXES:
        for age in AGE_BANDS:
            for rel in RELIGS:
                for att in ATTENDS:
                    for mar in MARITALS:
                        yield {"sex": sex, "age_band": age, "relig": rel, "attend": att, "marital": mar}


def _tid(*parts) -> str:
    return "_".join(str(p).replace("-", "").replace("+", "plus") for p in parts)


def build_gss_tables(d: pd.DataFrame, labels: dict) -> tuple[list, dict]:
    tables = []
    item_years = {}
    for var, item in GSS_ITEMS.items():
        valid_codes = set().union(*item["categories"].values())
        has = d[d[var].isin(list(valid_codes))].groupby("year").size()
        item_years[var] = [int(y) for y in has.index if has[y] > 0]
        mk_all = gss_missing_kind(d, var, valid_codes)
        for pid, per in GSS_PERIODS.items():
            yrs = [y for y in per["years"] if y in item_years[var]]
            if not yrs:
                continue
            sel = d["year"].isin(yrs).to_numpy()
            dp = d[sel].reset_index(drop=True)
            mk = mk_all[sel]
            design = Design(dp["_stratum"].to_numpy(), dp["_psu"].to_numpy())
            codes = dp[var].to_numpy(float)
            w = dp[GSS_WEIGHT].to_numpy(float)
            grid = list(filter_grid())
            if var == "attend":  # attendance is the outcome: no attendance filter
                grid = [f for f in grid if f["attend"] == "any"]
            extra = []
            if var == "chldidel":
                for f in REGION_SUBGROUPS:
                    for code, name in labels["region"]["values"].items():
                        if code.isdigit():
                            extra.append({**f, "region": code, "_region_name": name})
            for f in grid + extra:
                f = dict(f)
                rname = f.pop("_region_name", None)
                body = estimate_table(codes, w, item["categories"], domain=domain_mask(dp, f),
                                      design=design, missing_kind=mk)
                body["flags"] += per["flags"] + ["missing_codes_collapsed"]
                if len(yrs) < len(per["years"]):
                    body["flags"].append("years_missing_in_period")
                t = {"id": _tid("gss", var, pid, *f.values()), "dataset_id": "gss", "variable": var,
                     "years": yrs, "period": pid, "mode": per["mode"], "filters": f, **body}
                if rname:
                    t["region_name"] = rname.title()
                tables.append(t)
    return tables, item_years


def gss_questions(labels: dict, item_years: dict) -> list:
    qs = []
    for var, item in GSS_ITEMS.items():
        lab = labels[var]
        rmap = {k: v for k, v in lab["values"].items() if k.isdigit()}
        unlabelled = sorted(c for codes in item["categories"].values() for c in codes if str(c) not in rmap)
        for c in unlabelled:  # e.g. chldidel 0-6: the Stata file labels only 7 and 8; the value is the count
            rmap[str(c)] = str(c)
        qs.append({
            "dataset_id": "gss", "variable": var,
            "original_text": f"GSS variable label (short label, not the full question wording): \"{lab['label']}\"",
            "text_kind": "variable_label",
            "response_map": dict(sorted(rmap.items(), key=lambda kv: int(kv[0]))),
            "missing_codes": {k: v for k, v in lab["values"].items() if not k.isdigit()},
            "tabulated_categories": {cat: sorted(int(c) for c in codes) for cat, codes in item["categories"].items()},
            "harmonized_concept": item["concept"], "alignment": item["alignment"],
            "years": item_years.get(var, []),
            "coding_source": "Stata value labels in the GSS yearly files (raw/gss/gss_selected_labels.json)",
            "coding_unconfirmed": False,
            "response_map_note": (f"codes {unlabelled} carry no Stata value label; the numeric value is the answer"
                                  if unlabelled else None),
            "note": item["note"],
        })
    return qs


# --------------------------------------------------------------------- NSFG

NSFG_WEIGHT, NSFG_STRATUM, NSFG_PSU = "WGT2022_2023", "VEST", "VECL"
NSFG_AGE_BANDS = OrderedDict([("18-29", (18, 29)), ("20-29", (20, 29)), ("30-44", (30, 44)), ("18-49", (18, 50))])


def load_nsfg(raw: Path) -> pd.DataFrame:
    nd = raw / "nsfg"
    csvs = sorted(nd.rglob("*FemResp*.csv"))
    if csvs:
        return pd.read_csv(csvs[0], low_memory=False)
    z = zipfile.ZipFile(nd / "NSFG-2022-2023-FemRespPUFData.zip")
    member = next(n for n in z.namelist() if n.lower().endswith(".csv"))
    return pd.read_csv(io.BytesIO(z.read(member)), low_memory=False)


def nsfg_structural_checks(df: pd.DataFrame) -> dict:
    """Consistency checks between raw codes. Evidence for a candidate coding, not a confirmation."""
    out = {}
    if {"FMARITAL", "EVRMARRY"} <= set(df.columns):
        out["FMARITAL_5_equals_EVRMARRY_0"] = {
            "FMARITAL==5": int((df.FMARITAL == 5).sum()), "EVRMARRY==0": int((df.EVRMARRY == 0).sum()),
            "both": int(((df.FMARITAL == 5) & (df.EVRMARRY == 0)).sum())}
    if {"ADDEXP", "INTENT"} <= set(df.columns):
        out["ADDEXP_by_INTENT"] = {str(k): {str(a): int(b) for a, b in v.items()}
                                   for k, v in pd.crosstab(df.INTENT, df.ADDEXP).iterrows()}
    if "ADDEXP" in df:
        out["ADDEXP_raw_values"] = sorted(int(x) for x in df.ADDEXP.dropna().unique())
    if "AGE_R" in df:
        out["AGE_R_range"] = [int(df.AGE_R.min()), int(df.AGE_R.max())]
    return out


def build_nsfg(df: pd.DataFrame, codings: dict) -> tuple[list, list, dict]:
    """NSFG tables. A variable's rows are published only if its coding is
    confirmed (codings[var]['confirmed_from'] set); otherwise the table keeps
    n and n_eff for the age-band universe and rows are null, flagged
    ``coding_unconfirmed``. Religion/attendance/marital filters are used only
    when their own codings are confirmed."""
    design = Design(df[NSFG_STRATUM].to_numpy(), df[NSFG_PSU].to_numpy())
    w = df[NSFG_WEIGHT].to_numpy(float)
    tables, questions = [], []
    conf = {v: bool(c.get("confirmed_from")) for v, c in codings["variables"].items()}
    for var, c in codings["variables"].items():
        if c.get("role") != "outcome" or var not in df:
            continue
        codes = df[var].to_numpy(float)
        if c.get("scale_divisor"):
            codes = codes / c["scale_divisor"]
        cats = OrderedDict((lab, set(v)) for lab, v in c["candidate_categories"].items())
        relig_opts = OrderedDict([("any", None)])
        if conf.get("RELIGION"):
            relig_opts["catholic"] = set(codings["variables"]["RELIGION"]["candidate_categories"]["Catholic"])
        mar_opts = OrderedDict([("any", None)])
        if conf.get("FMARITAL"):
            mar_opts["never_married"] = set(codings["variables"]["FMARITAL"]["candidate_categories"]["Never married"])
        for age, (lo, hi) in NSFG_AGE_BANDS.items():
            for rel, rset in relig_opts.items():
                for mar, mset in mar_opts.items():
                    dom = df.AGE_R.between(lo, hi).to_numpy()
                    if rset:
                        dom &= df.RELIGION.isin(rset).to_numpy()
                    if mset:
                        dom &= df.FMARITAL.isin(mset).to_numpy()
                    filt = {"sex": "female", "age_band": age, "relig": rel, "attend": "any", "marital": mar}
                    tid = _tid("nsfg", var.lower(), "2022-2023", *filt.values())
                    if conf[var]:
                        body = estimate_table(codes, w, cats, domain=dom, design=design)
                    else:
                        inu = dom & ~np.isnan(codes)
                        body = {"rows": None, "n": int(inu.sum()), "n_eff": round(kish_n_eff(w[inu]), 1),
                                "weighted_base": round(float(w[inu].sum()), 3),
                                "excluded": {"dk": None, "refused": None, "iap": None,
                                             "missing_unsplit": int((dom & np.isnan(codes)).sum())},
                                "flags": ["coding_unconfirmed"]}
                    body["flags"].append(c.get("measure_flag", "expected_not_ideal"))
                    tables.append({"id": tid, "dataset_id": "nsfg", "variable": var.lower(), "years": [2022, 2023],
                                   "period": "2022-2023", "mode": "in-person (CAPI) or self-administered web (FTFMODE)",
                                   "filters": filt, **body})
    for var, c in codings["variables"].items():
        questions.append({
            "dataset_id": "nsfg", "variable": var.lower(),
            "original_text": c["label_text"], "text_kind": c["text_kind"],
            "response_map": c.get("candidate_response_map", {}),
            "harmonized_concept": c["concept"], "alignment": c["alignment"], "years": [2022, 2023],
            "coding_source": c["coding_source"], "coding_unconfirmed": not conf[var],
            "confirmed_from": c.get("confirmed_from"), "note": c.get("note", ""),
        })
    return tables, questions, nsfg_structural_checks(df)


# --------------------------------------------------------------------- main

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--raw", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    a = ap.parse_args(argv)
    manifest = json.loads((a.raw / "manifest.json").read_text())
    outdir = a.out / "surveys"
    outdir.mkdir(parents=True, exist_ok=True)
    datasets, questions, tables, diagnostics = [], [], [], {}

    gss_ok = (a.raw / "gss" / "gss_2000plus_selected.csv.gz").exists()
    if gss_ok:
        raw_df, labels = load_gss(a.raw)
        d, droplog = gss_analysis_frame(raw_df)
        t, item_years = build_gss_tables(d, labels)
        tables += t
        questions += gss_questions(labels, item_years)
        yrs = sorted(int(y) for y in d.year.unique())
        diagnostics["gss"] = {"dropped": droplog, "n_analysis": int(len(d)),
                              "columns_absent_every_year": [c for c in ("fehome",) if c not in raw_df.columns]}
        datasets.append({
            "id": "gss", "title": "General Social Survey (NORC at the University of Chicago), yearly files",
            "source_id": "gss", "years": yrs, "weight_variable": GSS_WEIGHT,
            "design": ("Stratified multistage area probability sample (2000-2018, 2022, 2024 in-person "
                       "component); 2021 address-based push-to-web. Variance: Taylor linearisation, "
                       "strata = year x VSTRAT, PSU = VPSU, with-replacement first-stage approximation. "
                       "Cases without WTSSPS (2022 and 2024 AmeriSpeak oversample frames) excluded. "
                       "Years pooled within period with their own weights (each year counts in "
                       "proportion to its sample size)."),
            "periods": {k: {"years": v["years"], "mode": v["mode"]} for k, v in GSS_PERIODS.items()},
            "filter_definitions": FILTER_DEFS,
            "files": manifest["sources"].get("gss", {}).get("files", []),
        })
    nsfg_codings = json.loads((HERE / "registry" / "nsfg_codings.json").read_text())
    try:
        ndf = load_nsfg(a.raw)
    except (FileNotFoundError, StopIteration):
        ndf = None
    if ndf is not None:
        t, q, checks = build_nsfg(ndf, nsfg_codings)
        tables += t
        questions += q
        diagnostics["nsfg"] = {"structural_checks": checks, "n_file": int(len(ndf))}
        datasets.append({
            "id": "nsfg", "title": "National Survey of Family Growth 2022-2023, Female Respondent public-use file "
                                   "(NCHS, CDC)",
            "source_id": "nsfg", "years": [2022, 2023], "weight_variable": NSFG_WEIGHT,
            "design": (f"Stratified clustered probability sample; variance strata {NSFG_STRATUM} "
                       f"({ndf[NSFG_STRATUM].nunique()} strata) and clusters {NSFG_PSU} "
                       f"({ndf.groupby(NSFG_STRATUM)[NSFG_PSU].nunique().iloc[0]} per stratum), Taylor "
                       "linearisation with-replacement approximation; domain estimation over the whole "
                       "15-49 file. Women only (the male file is not ingested)."),
            "files": manifest["sources"].get("nsfg", {}).get("files", []),
        })

    (outdir / "questions.json").write_text(json.dumps(
        {"generated_by": "pipeline/build_surveys.py", "datasets": datasets, "questions": questions,
         "diagnostics": diagnostics}, indent=1))
    (outdir / "crosstabs.json").write_text(json.dumps(
        {"generated_by": "pipeline/build_surveys.py",
         "suppression": {"suppress_below_n_eff": 30, "exploratory_below_n_eff": 100},
         "tables": tables}, separators=(",", ":")))
    n_pub = sum(1 for t in tables if t["rows"] is not None)
    print(f"tables: {len(tables)} ({n_pub} with rows, {len(tables) - n_pub} suppressed or unconfirmed)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
