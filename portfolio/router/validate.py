#!/usr/bin/env python3
"""Validate every ventures/*/VENTURE.yaml against the schema the router relies on.

Exits non-zero with a per-file report on the first invalid portfolio.
Usage: python3 portfolio/router/validate.py
"""
import sys
from datetime import date
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit("PyYAML is required: pip install -r portfolio/router/requirements.txt")

REPO_ROOT = Path(__file__).resolve().parents[2]
VENTURES_DIR = REPO_ROOT / "ventures"

VALID_STAGES = {"idea", "prototype", "launched", "revenue", "scaling", "winding-down"}
LEAN_STAGES = {"idea", "prototype"}
VALID_HYPOTHESIS_STATUS = {"untested", "supported", "refuted"}
VALID_HYPOTHESIS_EVIDENCE = {"customer-contact", "in-repo"}


def check(venture_dir, data, errors):
    where = venture_dir.name

    def err(msg):
        errors.append(f"{where}/VENTURE.yaml: {msg}")

    if not isinstance(data, dict):
        err("top level must be a mapping")
        return

    name = data.get("name")
    if not name:
        err("missing `name`")
    elif name != where:
        err(f"`name` is '{name}' but the directory is '{where}' — they must match")

    if not data.get("description"):
        err("missing `description`")
    if not data.get("owner"):
        err("missing `owner`")

    stage = data.get("stage")
    if stage not in VALID_STAGES:
        err(f"`stage` is '{stage}', must be one of {sorted(VALID_STAGES)}")

    # Bookkeeping blocks are required once a venture is launched. A prototype may
    # omit them (the router defaults each to empty); if present they must be valid.
    lean = stage in LEAN_STAGES

    def absent_ok(key):
        return lean and data.get(key) is None

    hypotheses = data.get("hypotheses")
    if absent_ok("hypotheses"):
        hypotheses = None
    elif not isinstance(hypotheses, list) or not hypotheses:
        err("`hypotheses` must be a non-empty list")
    else:
        for i, h in enumerate(hypotheses or []):
            if not isinstance(h, dict):
                err(f"hypotheses[{i}] must be a mapping")
                continue
            if not h.get("claim"):
                err(f"hypotheses[{i}] missing `claim`")
            status = h.get("status")
            if status not in VALID_HYPOTHESIS_STATUS:
                err(f"hypotheses[{i}].status is '{status}', must be one of {sorted(VALID_HYPOTHESIS_STATUS)}")
            evidence = h.get("evidence")
            if evidence not in VALID_HYPOTHESIS_EVIDENCE:
                err(
                    f"hypotheses[{i}].evidence is {evidence!r}, must be one of "
                    f"{sorted(VALID_HYPOTHESIS_EVIDENCE)} — the router needs this to "
                    f"tell work it can dispatch from work no session can start"
                )
            checked = h.get("checked")
            if status in {"supported", "refuted"} and checked is None:
                err(f"hypotheses[{i}] is '{status}' but `checked` is null — a tested claim needs a date")
            if checked is not None and not isinstance(checked, date):
                err(f"hypotheses[{i}].checked must be a YYYY-MM-DD date, got {checked!r}")

    econ = data.get("economics")
    if absent_ok("economics"):
        pass
    elif not isinstance(econ, dict):
        err("missing `economics` mapping")
    else:
        if not econ.get("currency"):
            err("`economics.currency` is required")
        for field in ("mrr", "monthly_cost", "customers"):
            if field not in econ:
                err(f"`economics.{field}` must be present (use null if unmeasured)")
            elif econ[field] is not None and not isinstance(econ[field], (int, float)):
                err(f"`economics.{field}` must be a number or null, got {econ[field]!r}")

    budget = data.get("budget")
    if absent_ok("budget"):
        pass
    elif not isinstance(budget, dict):
        err("missing `budget` mapping")
    else:
        cap = budget.get("monthly_cap")
        if not isinstance(cap, (int, float)) or cap <= 0:
            err(f"`budget.monthly_cap` must be a positive number, got {cap!r}")
        if not isinstance(budget.get("protected"), bool):
            err("`budget.protected` must be true or false")

    kill = data.get("kill_criteria")
    if absent_ok("kill_criteria"):
        pass
    elif not isinstance(kill, list) or not kill:
        err("`kill_criteria` must be a non-empty list — a venture with no stop condition never gets stopped")

    links = data.get("links")
    if absent_ok("links"):
        pass
    elif not isinstance(links, dict):
        err("missing `links` mapping (values may be null)")


def main():
    errors = []
    venture_dirs = sorted(d for d in VENTURES_DIR.iterdir() if d.is_dir())
    checked_count = 0

    for venture_dir in venture_dirs:
        if (venture_dir / "NOT-A-VENTURE").is_file():
            continue
        yaml_path = venture_dir / "VENTURE.yaml"
        if not yaml_path.is_file():
            errors.append(
                f"{venture_dir.name}: no VENTURE.yaml — the router cannot see this venture. "
                f"Copy platform/VENTURE.template.yaml and fill it in, or add a "
                f"NOT-A-VENTURE file explaining why this directory is not a business."
            )
            continue
        try:
            with open(yaml_path) as f:
                data = yaml.safe_load(f)
        except yaml.YAMLError as e:
            errors.append(f"{venture_dir.name}/VENTURE.yaml: not valid YAML: {e}")
            continue
        check(venture_dir, data, errors)
        checked_count += 1

    if errors:
        print(f"{len(errors)} problem(s) across {len(venture_dirs)} venture(s):\n")
        for e in errors:
            print(f"  - {e}")
        return 1

    print(f"All {checked_count} VENTURE.yaml files are valid.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
