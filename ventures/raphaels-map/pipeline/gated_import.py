"""Shared machinery for importing registration-gated survey microdata.

Used by pipeline/import_issp.py and pipeline/import_wvs_evs.py. We cannot
fetch or commit these files (the publishers require registration and forbid
redistributing respondent-level data), and we have not seen them, so:

1. The variable mapping lives in an editable YAML file
   (pipeline/importers/<dataset>.yaml). Every entry we wrote from memory of
   the codebook carries `confirm_against_codebook: true`. The importer
   refuses to run while any entry still says true, unless the user passes
   `--i-checked-the-codebook`.
2. At runtime every mapped variable must exist in the file, and every
   category, filter level and missing-value class that the mapping defines by
   a label pattern must match at least one value label in the file. Codes
   listed under `expect_labels` must carry a label matching the given
   pattern. Anything else stops the import with a message naming the
   variable and the labels the file actually has.
3. Output is aggregates only, in the data/surveys/crosstabs.json and
   questions.json shapes (ARCHITECTURE.md), written under --out. Weighted
   with the dataset's documented weight; n, n_eff = (sum w)^2 / sum w^2,
   suppression at n_eff < 30, `exploratory_sample` at 30 <= n_eff < 100.

Weighted-statistics helpers: pipeline/survey_stats.py did not exist when
this was written, so `n_eff` and the weighted shares are computed by the
small local helpers below. If survey_stats.py appears and exposes `n_eff`,
that one is used instead (same formula).
"""
from __future__ import annotations

import datetime as dt
import itertools
import json
import math
import re
import subprocess
from pathlib import Path

SUPPRESS_BELOW = 30
EXPLORATORY_BELOW = 100
Z90 = 1.6449  # ARCHITECTURE: the page uses 90% intervals for ACS MOEs; we use 95% for survey CIs below
Z95 = 1.96


class MappingError(Exception):
    """The mapping is unconfirmed or does not match the file. Message is user-facing."""


# ------------------------------------------------------------ weighted stats

def _local_n_eff(w) -> float:
    s = float(sum(w))
    s2 = float(sum(x * x for x in w))
    return (s * s) / s2 if s2 > 0 else 0.0


try:  # coordinate with the shared helper if another agent has landed it
    import survey_stats as _ss  # type: ignore
    n_eff = getattr(_ss, "n_eff", _local_n_eff)
    if not callable(n_eff):
        n_eff = _local_n_eff
    STATS_HELPER = "survey_stats.n_eff" if n_eff is not _local_n_eff else "gated_import local helper"
except Exception:  # noqa: BLE001 - absent or broken: use the local helper
    n_eff = _local_n_eff
    STATS_HELPER = "gated_import local helper"


def reliability_flags(neff: float) -> list[str]:
    if neff < SUPPRESS_BELOW:
        return ["suppressed_small_sample"]
    if neff < EXPLORATORY_BELOW:
        return ["exploratory_sample"]
    return []


def weighted_rows(codes, weights, categories: dict, neff: float) -> list[dict]:
    """categories: {label: set(codes)}. Wald interval on n_eff (approximate)."""
    total = sum(weights)
    rows = []
    for label, cs in categories.items():
        wsum = sum(w for c, w in zip(codes, weights) if c in cs)
        p = wsum / total if total > 0 else float("nan")
        half = Z95 * math.sqrt(p * (1 - p) / neff) if neff > 0 else float("nan")
        rows.append({"category": label, "pct": round(100 * p, 1),
                     "ci_low": round(max(0.0, 100 * (p - half)), 1),
                     "ci_high": round(min(100.0, 100 * (p + half)), 1)})
    return rows


# ------------------------------------------------------------- mapping file

def load_mapping(path: Path) -> dict:
    text = Path(path).read_text(encoding="utf-8")
    try:
        import yaml  # PyYAML
        return yaml.safe_load(text)
    except ImportError:
        try:
            return json.loads(text)  # JSON is valid YAML; lets the importer run without PyYAML
        except json.JSONDecodeError as e:
            raise MappingError(f"{path}: PyYAML is not installed and the file is not JSON ({e}). "
                               "Install PyYAML (pip install pyyaml).") from e


def unconfirmed_entries(mapping: dict) -> list[str]:
    """Paths of every node that still says confirm_against_codebook: true."""
    out = []

    def walk(node, path):
        if isinstance(node, dict):
            if node.get("confirm_against_codebook") is True:
                out.append(path or "(top level)")
            for k, v in node.items():
                walk(v, f"{path}.{k}" if path else str(k))
        elif isinstance(node, list):
            for i, v in enumerate(node):
                name = v.get("variable", i) if isinstance(v, dict) else i
                walk(v, f"{path}[{name}]")
    walk(mapping, "")
    return out


def require_confirmed(mapping: dict, mapping_path: Path, checked_flag: bool) -> None:
    pending = unconfirmed_entries(mapping)
    if pending and not checked_flag:
        lines = "\n  ".join(pending[:40]) + ("\n  ..." if len(pending) > 40 else "")
        raise MappingError(
            f"Refusing to run: {len(pending)} mapping entries in {mapping_path} are not confirmed against the "
            f"codebook:\n  {lines}\n\nThese variable names and codes were written without seeing the file. Open "
            "the dataset's official codebook, check each variable name, value code and label, edit the YAML, "
            "and set confirm_against_codebook: false on each entry you checked. Or, once you have checked "
            "them all, pass --i-checked-the-codebook.")


# --------------------------------------------------------------- data files

def read_labelled(path: Path, wanted: list[str]):
    """Read the columns named in `wanted` (case-insensitive).

    Returns (frame of raw codes, {wanted_name: actual_name}, {actual_name: {code: label}}, missing_names).
    """
    import pandas as pd
    path = Path(path)
    suf = path.suffix.lower()
    if suf == ".dta":
        with pd.io.stata.StataReader(str(path)) as r:
            vl = r.value_labels()
            names = list(r._varlist)       # noqa: SLF001 - pandas has no public var->label-set map
            lbl = list(r._lbllist)         # noqa: SLF001
        resolve = {n.lower(): n for n in names}
        actual = {w: resolve[w.lower()] for w in wanted if w.lower() in resolve}
        missing = [w for w in wanted if w.lower() not in resolve]
        labels = {}
        for n, ln in zip(names, lbl):
            if n in actual.values() and ln and ln in vl:
                labels[n] = {_norm_code(k): str(v) for k, v in vl[ln].items()}
        cols = sorted(set(actual.values()))
        df = pd.read_stata(str(path), columns=cols, convert_categoricals=False, convert_missing=False) if cols else None
        return df, actual, labels, missing
    if suf in (".sav", ".zsav", ".por"):
        try:
            import pyreadstat
        except ImportError as e:
            raise MappingError("Reading SPSS files needs pyreadstat (pip install pyreadstat), or download the "
                               "Stata (.dta) version of the dataset instead.") from e
        _, meta = pyreadstat.read_sav(str(path), metadataonly=True) if suf != ".por" else pyreadstat.read_por(str(path), metadataonly=True)
        resolve = {n.lower(): n for n in meta.column_names}
        actual = {w: resolve[w.lower()] for w in wanted if w.lower() in resolve}
        missing = [w for w in wanted if w.lower() not in resolve]
        cols = sorted(set(actual.values()))
        reader = pyreadstat.read_sav if suf != ".por" else pyreadstat.read_por
        df, meta = reader(str(path), usecols=cols, apply_value_formats=False, user_missing=True) if cols else (None, meta)
        labels = {n: {_norm_code(k): str(v) for k, v in (meta.variable_value_labels.get(n) or {}).items()} for n in cols}
        return df, actual, labels, missing
    raise MappingError(f"{path}: unsupported file type {suf!r}. Use the Stata (.dta) or SPSS (.sav) file; unzip it first.")


def _norm_code(k):
    try:
        f = float(k)
        return int(f) if f.is_integer() else f
    except (TypeError, ValueError):
        return str(k)


# ------------------------------------------------------------- resolution

def _codes_for(spec: dict, labels: dict, where: str) -> set:
    """A level/category spec: {codes: [...]} and/or {labels: regex}."""
    out = set(_norm_code(c) for c in spec.get("codes", []) or [])
    pat = spec.get("labels")
    if pat:
        rx = re.compile(pat, re.I)
        hit = {c for c, lab in labels.items() if rx.search(lab)}
        if not hit:
            raise MappingError(f"{where}: no value label matches /{pat}/. Labels in the file: {_show(labels)}")
        out |= hit
    if not out:
        raise MappingError(f"{where}: defines neither codes nor a labels pattern")
    return out


def _show(labels: dict) -> str:
    if not labels:
        return "(none: the variable has no value labels)"
    items = sorted(labels.items(), key=lambda kv: (str(type(kv[0])), kv[0]))
    s = "; ".join(f"{k}={v}" for k, v in items[:30])
    return s + (" ..." if len(items) > 30 else "")


def _check_expect(var: str, spec: dict, labels: dict) -> None:
    for code, pat in (spec.get("expect_labels") or {}).items():
        lab = labels.get(_norm_code(code))
        if lab is None or not re.search(pat, lab, re.I):
            raise MappingError(f"variable {var}: expected code {code} to be labelled like /{pat}/, the file has "
                               f"{lab!r}. Labels in the file: {_show(labels)}")


DEFAULT_MISSING = {
    "dk": r"don.?t know|can.?t choose|\bDK\b",
    "refused": r"refused|no answer|\bNA\b",
    "iap": r"not applicable|\bNAP\b|not asked|inapplicable|missing|item not included",
}


def resolve(mapping: dict, labels_of, columns_present: set) -> dict:
    """Turn the YAML into concrete code sets, checking each against the file.

    labels_of(var) -> {code: label} for the actual variable.
    Returns a plan {weight, country, year, filters: {dim: {...}}, questions: [...]}.
    """
    problems = []
    plan = {"filters": {}, "questions": []}

    def need(var, where):
        if var not in columns_present:
            problems.append(f"{where}: variable {var!r} is not in the file")
            return False
        return True

    w = mapping["weight"]
    if need(w["variable"], "weight"):
        plan["weight"] = w["variable"]
    c = mapping["country"]
    if need(c["variable"], "country"):
        plan["country"] = dict(c)
        if c.get("kind") == "labelled" and not labels_of(c["variable"]):
            problems.append(f"country: {c['variable']} has no value labels; set kind: code")
    y = mapping.get("year") or {}
    if y.get("variable") and need(y["variable"], "year"):
        plan["year"] = y["variable"]
    plan["years"] = mapping.get("years")

    for dim, spec in (mapping.get("filters") or {}).items():
        if not spec or not spec.get("variable"):
            continue
        var = spec["variable"]
        if not need(var, f"filters.{dim}"):
            continue
        labs = labels_of(var)
        try:
            _check_expect(var, spec, labs)
            if spec.get("kind") == "numeric":
                plan["filters"][dim] = {"variable": var, "kind": "numeric", "bands": spec["bands"],
                                        "valid_range": spec.get("valid_range")}
            else:
                levels = {lv: _codes_for(ls, labs, f"filters.{dim}.levels.{lv} ({var})")
                          for lv, ls in spec["levels"].items()}
                plan["filters"][dim] = {"variable": var, "kind": "labelled", "levels": levels}
        except MappingError as e:
            problems.append(str(e))

    miss_default = mapping.get("missing") or DEFAULT_MISSING
    for q in mapping["questions"]:
        var = q["variable"]
        if not need(var, f"questions[{var}]"):
            continue
        labs = labels_of(var)
        if not labs:
            problems.append(f"questions[{var}]: the variable has no value labels in the file, so its categories "
                            "cannot be checked. Is this the right variable?")
            continue
        try:
            _check_expect(var, q, labs)
            cats = {name: _codes_for(cs, labs, f"questions[{var}].categories.{name}")
                    for name, cs in q["categories"].items()}
            seen = set()
            for name, cs in cats.items():
                if cs & seen:
                    raise MappingError(f"questions[{var}]: category {name!r} overlaps another category")
                seen |= cs
            miss = {}
            for cls, pat in (q.get("missing") or miss_default).items():
                rx = re.compile(pat, re.I)
                miss[cls] = {k for k, lab in labs.items() if rx.search(lab)} - seen
            plan["questions"].append({**q, "resolved_categories": cats, "resolved_missing": miss,
                                      "file_labels": labs})
        except MappingError as e:
            problems.append(str(e))
    if problems:
        raise MappingError("The mapping does not match this file:\n  - " + "\n  - ".join(problems) +
                           "\n\nFix pipeline/importers/*.yaml against the codebook and try again. No output was written.")
    return plan


# --------------------------------------------------------------- crosstabs

def _level_mask(values, spec, level):
    if level == "any":
        return [True] * len(values)
    if spec["kind"] == "numeric":
        lo, hi = spec["bands"][level]
        return [v is not None and not (isinstance(v, float) and math.isnan(v)) and lo <= v <= hi for v in values]
    cs = spec["levels"][level]
    return [_norm_code(v) in cs if v is not None and not (isinstance(v, float) and math.isnan(v)) else False
            for v in values]


FILTER_DIMS = ["sex", "age_band", "relig", "attend", "marital"]
DIM_SOURCE = {"sex": "sex", "age_band": "age", "relig": "relig", "attend": "attend", "marital": "marital"}


def crosstabs(df, plan: dict, mapping: dict, dataset_id: str) -> tuple[list, dict]:
    """Tables for every country x filter combination x question."""
    wcol = plan["weight"]
    ccol = plan["country"]["variable"]
    country_labels = plan.get("country_labels") or {}
    weights_all = [float(x) if x is not None else float("nan") for x in df[wcol].tolist()]
    report = {"rows_in_file": len(df), "rows_bad_weight": sum(1 for x in weights_all if not (x > 0))}

    levels_for = {}
    for dim in FILTER_DIMS:
        spec = plan["filters"].get(DIM_SOURCE[dim])
        if spec is None:
            levels_for[dim] = ["any"]
        else:
            lv = list(spec["bands"]) if spec["kind"] == "numeric" else list(spec["levels"])
            levels_for[dim] = lv + ["any"]
    col_values = {dim: df[plan["filters"][DIM_SOURCE[dim]]["variable"]].tolist()
                  for dim in FILTER_DIMS if DIM_SOURCE[dim] in plan["filters"]}
    masks = {}
    for dim in FILTER_DIMS:
        for lv in levels_for[dim]:
            if lv == "any":
                masks[(dim, lv)] = None
            else:
                masks[(dim, lv)] = _level_mask(col_values[dim], plan["filters"][DIM_SOURCE[dim]], lv)

    countries = df[ccol].tolist()
    years = df[plan["year"]].tolist() if plan.get("year") else None
    tables = []
    for cval in sorted({_norm_code(x) for x in countries if x is not None and x == x}, key=str):
        cmask = [_norm_code(x) == cval for x in countries]
        cname = country_labels.get(cval, str(cval))
        cyears = sorted({int(years[i]) for i, m in enumerate(cmask) if m and years[i] == years[i]}) if years else plan.get("years")
        for combo in itertools.product(*[levels_for[d] for d in FILTER_DIMS]):
            base = list(cmask)
            for dim, lv in zip(FILTER_DIMS, combo):
                mk = masks[(dim, lv)]
                if mk is not None:
                    base = [a and b for a, b in zip(base, mk)]
            for q in plan["questions"]:
                var = q["variable"]
                vals = df[var].tolist()
                cats = q["resolved_categories"]
                valid = set().union(*cats.values())
                codes, ws = [], []
                excl = {"dk": 0, "refused": 0, "iap": 0, "other": 0}
                for i, m in enumerate(base):
                    if not m or not (weights_all[i] > 0):
                        continue
                    v = vals[i]
                    code = None if v is None or (isinstance(v, float) and math.isnan(v)) else _norm_code(v)
                    if code in valid:
                        codes.append(code)
                        ws.append(weights_all[i])
                        continue
                    for cls in ("dk", "refused", "iap"):
                        if code in q["resolved_missing"].get(cls, set()):
                            excl[cls] += 1
                            break
                    else:
                        excl["iap" if code is None else "other"] += 1
                ne = n_eff(ws) if ws else 0.0
                flags = reliability_flags(ne)
                filt = {"country": cname, "sex": combo[0], "age_band": combo[1], "relig": combo[2],
                        "attend": combo[3], "marital": combo[4]}
                tables.append({
                    "id": ":".join([dataset_id, str(cval), var] + list(combo)),
                    "dataset_id": dataset_id, "variable": var, "years": cyears, "filters": filt,
                    "rows": None if "suppressed_small_sample" in flags else weighted_rows(codes, ws, cats, ne),
                    "n": len(codes), "n_eff": round(ne, 1), "weighted_base": round(sum(ws), 2),
                    "excluded": excl, "flags": flags, "ci_method": "approximate: Wald on n_eff, not design-based",
                })
    return tables, report


def questions_doc(mapping: dict, plan: dict, dataset_id: str) -> dict:
    return {
        "datasets": [{"id": dataset_id, "title": mapping.get("title"), "source_id": mapping.get("source_id", dataset_id),
                      "years": mapping.get("years"), "weight_variable": plan["weight"],
                      "design": mapping.get("design", "")}],
        "questions": [{"dataset_id": dataset_id, "variable": q["variable"],
                       "original_text": q.get("original_text"),
                       "response_map": {str(k): v for k, v in q["file_labels"].items()},
                       "categories": {n: sorted(cs, key=str) for n, cs in q["resolved_categories"].items()},
                       "harmonized_concept": q.get("harmonized_concept"), "alignment": q.get("alignment"),
                       "years": mapping.get("years")} for q in plan["questions"]],
    }


def warn_if_in_repo(path: Path) -> str | None:
    """Return a warning when the microdata file sits in a git work tree and is not ignored."""
    p = Path(path).resolve()
    try:
        top = subprocess.run(["git", "-C", str(p.parent), "rev-parse", "--show-toplevel"],
                             capture_output=True, text=True, timeout=10)
        if top.returncode != 0:
            return None
        ign = subprocess.run(["git", "-C", str(p.parent), "check-ignore", "-q", str(p)], timeout=10)
        if ign.returncode != 0:
            return (f"WARNING: {p} is inside the git work tree {top.stdout.strip()} and is not git-ignored. "
                    "Licensed microdata must never be committed; move it outside the repository.")
    except Exception:  # noqa: BLE001 - git missing is fine
        return None
    return None


def run_import(*, dataset_id: str, file: Path, out: Path, mapping_path: Path, checked: bool, log=print) -> dict:
    mapping = load_mapping(mapping_path)
    require_confirmed(mapping, mapping_path, checked)
    file = Path(file)
    if not file.exists():
        raise MappingError(f"{file}: no such file")
    w = warn_if_in_repo(file)
    if w:
        log(w)
    wanted = [mapping["weight"]["variable"], mapping["country"]["variable"]]
    if (mapping.get("year") or {}).get("variable"):
        wanted.append(mapping["year"]["variable"])
    wanted += [s["variable"] for s in (mapping.get("filters") or {}).values() if s and s.get("variable")]
    wanted += [q["variable"] for q in mapping["questions"]]
    df, actual, labels, missing = read_labelled(file, wanted)
    # Rewrite the mapping to the file's actual spelling (case) of each name.
    present = set(actual)

    def labels_of(var):
        return labels.get(actual.get(var, var), {})

    plan = resolve(mapping, labels_of, present)
    if missing:  # resolve() already raised for missing mapped variables; this is a guard
        raise MappingError(f"variables not in file: {missing}")
    df = df.rename(columns={v: k for k, v in actual.items()})
    if plan["country"].get("kind") == "labelled":
        plan["country_labels"] = labels_of(plan["country"]["variable"])
    tables, report = crosstabs(df, plan, mapping, dataset_id)
    out = Path(out) / dataset_id
    out.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    meta = {"imported_locally": True, "imported_at": stamp, "input_file": file.name,
            "mapping_file": str(mapping_path), "codebook_checked_flag": checked,
            "stats_helper": STATS_HELPER, "suppress_below_n_eff": SUPPRESS_BELOW,
            "exploratory_below_n_eff": EXPLORATORY_BELOW,
            "licence_note": "Aggregates from a licensed file. Check the publisher's terms before sharing; "
                            "never commit the microdata."}
    (out / "crosstabs.json").write_text(json.dumps({**meta, "tables": tables}, indent=1, ensure_ascii=False) + "\n",
                                        encoding="utf-8")
    (out / "questions.json").write_text(json.dumps({**meta, **questions_doc(mapping, plan, dataset_id)}, indent=1,
                                                   ensure_ascii=False) + "\n", encoding="utf-8")
    shown = sum(1 for t in tables if t["rows"] is not None)
    log(f"wrote {out}/crosstabs.json: {len(tables)} tables ({shown} with rows, {len(tables) - shown} suppressed); "
        f"rows in file {report['rows_in_file']}, rows with missing/non-positive weight {report['rows_bad_weight']}")
    return {"tables": len(tables), "shown": shown, "out": str(out), **report}


def cli(dataset_id: str, default_mapping: Path, doc: str, argv=None) -> int:
    import argparse
    import sys
    ap = argparse.ArgumentParser(description=doc.splitlines()[0])
    ap.add_argument("--file", required=True, type=Path, help="the .dta or .sav file you downloaded")
    ap.add_argument("--out", required=True, type=Path, help="output directory (a <dataset>/ folder is made inside)")
    ap.add_argument("--mapping", type=Path, default=default_mapping)
    ap.add_argument("--i-checked-the-codebook", dest="checked", action="store_true",
                    help="run although mapping entries still say confirm_against_codebook: true")
    a = ap.parse_args(argv)
    try:
        run_import(dataset_id=dataset_id, file=a.file, out=a.out, mapping_path=a.mapping, checked=a.checked)
    except MappingError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    return 0
