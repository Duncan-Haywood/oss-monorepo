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

Weighted statistics come from pipeline/survey_stats.py (`estimate_table`:
Kish n_eff, weighted shares, logit intervals, design-based Taylor SEs when the
mapping names strata and PSU variables, the n_eff guardrails). If that module
cannot be imported, a small local fallback below computes the same n_eff and
guardrails with Kish-adjusted Wald intervals, and the output says which ran.
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
Z95 = 1.96  # 95% interval for survey shares


class MappingError(Exception):
    """The mapping is unconfirmed or does not match the file. Message is user-facing."""


# ------------------------------------------------------------ weighted stats

try:  # the shared helper (pipeline/survey_stats.py)
    import survey_stats as _ss  # type: ignore
    _ss.estimate_table  # noqa: B018 - fail over to the fallback if the API differs
    STATS_HELPER = "survey_stats.estimate_table"
except Exception:  # noqa: BLE001 - absent or broken: use the local fallback
    _ss = None
    STATS_HELPER = "gated_import local fallback (Kish n_eff, Wald interval)"


def n_eff(w) -> float:
    if _ss is not None:
        return _ss.kish_n_eff(w)
    s = float(sum(w))
    s2 = float(sum(x * x for x in w))
    return (s * s) / s2 if s2 > 0 else 0.0


def reliability_flags(neff: float) -> list[str]:
    if neff < SUPPRESS_BELOW:
        return ["suppressed_small_sample"]
    if neff < EXPLORATORY_BELOW:
        return ["exploratory_sample"]
    return []


def _fallback_table(codes, w, categories, domain, missing_kind):
    import numpy as np
    inscope = domain & np.isfinite(w) & (w > 0)
    valid = np.zeros(len(codes), bool)
    for cs in categories.values():
        valid |= np.isin(codes, list(cs))
    d = inscope & valid
    wd = w[d]
    base = float(wd.sum())
    ne = n_eff(wd) if len(wd) else 0.0
    miss = inscope & ~valid
    excl = {k: int(np.sum(miss & (missing_kind == k))) for k in ("dk", "refused", "iap")}
    excl["missing_unsplit"] = int(miss.sum()) - sum(excl.values())
    flags = reliability_flags(ne) if len(wd) else ["suppressed_small_sample"]
    out = {"rows": None, "n": int(d.sum()), "n_eff": round(ne, 1), "weighted_base": round(base, 3),
           "excluded": excl, "flags": flags}
    if "suppressed_small_sample" in flags:
        return out
    flags.append("approx_ci")
    rows = []
    for name, cs in categories.items():
        p = float(wd[np.isin(codes[d], list(cs))].sum()) / base
        half = Z95 * math.sqrt(p * (1 - p) / ne)
        rows.append({"category": name, "pct": round(100 * p, 1), "ci_low": round(max(0.0, 100 * (p - half)), 1),
                     "ci_high": round(min(100.0, 100 * (p + half)), 1)})
    out["rows"] = rows
    return out


def estimate(codes, w, categories, domain, missing_kind, design=None):
    if _ss is not None:
        from collections import OrderedDict
        return _ss.estimate_table(codes, w, OrderedDict(categories), domain=domain, design=design,
                                  missing_kind=missing_kind, suppress_below=SUPPRESS_BELOW,
                                  exploratory_below=EXPLORATORY_BELOW)
    return _fallback_table(codes, w, categories, domain, missing_kind)


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
    dv = mapping.get("design_variables") or {}
    if dv.get("strata") or dv.get("psu"):
        if not (dv.get("strata") and dv.get("psu")):
            problems.append("design_variables: give both strata and psu, or neither")
        elif need(dv["strata"], "design_variables.strata") and need(dv["psu"], "design_variables.psu"):
            plan["strata"], plan["psu"] = dv["strata"], dv["psu"]

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

FILTER_DIMS = ["sex", "age_band", "relig", "attend", "marital"]
DIM_SOURCE = {"sex": "sex", "age_band": "age", "relig": "relig", "attend": "attend", "marital": "marital"}


def _codes_array(series):
    """Numeric column -> float array (NaN for missing); string column -> object array."""
    import numpy as np
    import pandas as pd
    num = pd.to_numeric(series, errors="coerce")
    if num.notna().sum() == series.notna().sum():
        return num.to_numpy(dtype=float)
    return series.astype(object).where(series.notna(), None).to_numpy()


def _in(arr, codes):
    import numpy as np
    if arr.dtype == object:
        return np.array([_norm_code(v) in codes if v is not None else False for v in arr], dtype=bool)
    nums = [c for c in codes if isinstance(c, (int, float))]
    return np.isin(arr, nums) if nums else np.zeros(len(arr), dtype=bool)


def _level_mask(arr, spec, level):
    import numpy as np
    if level == "any":
        return None
    if spec["kind"] == "numeric":
        lo, hi = spec["bands"][level]
        with np.errstate(invalid="ignore"):
            return (arr >= lo) & (arr <= hi)
    return _in(arr, spec["levels"][level])


def crosstabs(df, plan: dict, mapping: dict, dataset_id: str) -> tuple[list, dict]:
    """Tables for every country x filter combination x question.

    Each country is estimated on its own rows (one national survey each; never
    pooled). Strata/PSU, when the mapping names them, give design-based SEs.
    """
    import numpy as np
    w_all = np.asarray(_codes_array(df[plan["weight"]]), dtype=float)
    good_w = np.isfinite(w_all) & (w_all > 0)
    report = {"rows_in_file": int(len(df)), "rows_bad_weight": int((~good_w).sum())}
    country = _codes_array(df[plan["country"]["variable"]])
    country_labels = plan.get("country_labels") or {}
    years = _codes_array(df[plan["year"]]) if plan.get("year") else None
    strata = df[plan["strata"]].to_numpy() if plan.get("strata") else None
    psu = df[plan["psu"]].to_numpy() if plan.get("psu") else None

    levels_for, masks_all = {}, {}
    for dim in FILTER_DIMS:
        spec = plan["filters"].get(DIM_SOURCE[dim])
        if spec is None:
            levels_for[dim] = ["any"]
            continue
        arr = _codes_array(df[spec["variable"]])
        lv = list(spec["bands"]) if spec["kind"] == "numeric" else list(spec["levels"])
        levels_for[dim] = lv + ["any"]
        for level in lv:
            masks_all[(dim, level)] = _level_mask(arr, spec, level)

    q_all = {}
    for q in plan["questions"]:
        arr = np.asarray(pd_numeric(df[q["variable"]]), dtype=float)
        kind = np.full(len(arr), "", dtype=object)
        for cls, cs in q["resolved_missing"].items():
            kind[_in(arr, cs)] = cls
        cats = {name: sorted(c for c in cs if isinstance(c, (int, float))) for name, cs in q["resolved_categories"].items()}
        q_all[q["variable"]] = (arr, kind, cats)

    cvals = sorted({_norm_code(v) for v in country if v is not None and v == v}, key=str)
    tables = []
    for cval in cvals:
        idx = np.flatnonzero(_in(country, {cval}))
        w = w_all[idx]
        cname = country_labels.get(cval, str(cval))
        if years is not None:
            cyears = sorted({int(y) for y in years[idx][good_w[idx]] if y == y})
        else:
            cyears = plan.get("years")
        design = None
        if _ss is not None and strata is not None and psu is not None:
            design = _ss.Design(strata[idx], psu[idx])
        masks = {k: m[idx] for k, m in masks_all.items()}
        for combo in itertools.product(*[levels_for[d] for d in FILTER_DIMS]):
            dom = np.ones(len(idx), dtype=bool)
            for dim, level in zip(FILTER_DIMS, combo):
                if level != "any":
                    dom &= masks[(dim, level)]
            for q in plan["questions"]:
                arr, kind, cats = q_all[q["variable"]]
                body = estimate(arr[idx], w, cats, dom, kind[idx], design)
                tables.append({
                    "id": ":".join([dataset_id, str(cval), q["variable"]] + list(combo)),
                    "dataset_id": dataset_id, "variable": q["variable"], "years": cyears,
                    "filters": {"country": cname, "sex": combo[0], "age_band": combo[1], "relig": combo[2],
                                "attend": combo[3], "marital": combo[4]},
                    **body,
                })
    return tables, report


def pd_numeric(series):
    import pandas as pd
    return pd.to_numeric(series, errors="coerce").to_numpy(dtype=float)


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
    wanted += [v for v in (mapping.get("design_variables") or {}).values() if isinstance(v, str) and v]
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
