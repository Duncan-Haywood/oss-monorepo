#!/usr/bin/env python3
"""What does an independent accessibility engine check that ours do not?

`portfolio/pipeline/README.md` records that the two dimensions which *admit* a
candidate -- `liability_containment` and `ethical_robustness` -- have never been
measured on any candidate, and names the reason no pass attempted one:

    answering it for the accessibility candidates needs the WCAG normative
    index as a denominator -- `www.w3.org` is egress-denied and no copy is in
    this repository

That is true of `www.w3.org`. It is not true of the *denominator*. `axe-core`
is published to `registry.npmjs.org`, which this environment reaches (measured
200 twice, `portfolio/research/egress-reachability/`), and every one of its
rules carries the success criteria it tests as tags. So a criterion-level
reference for *what is automatable at all* is one `npm` fetch away, and has
been the whole time. This is the same error class
`portfolio/research/data-reachability/` was written to stop: probing a
canonical host and concluding "unreachable" without probing the channel that
actually carries the data.

`axe-core` is a reference, not ground truth. It is one vendor's automatable
subset of WCAG, it is not normative, and a criterion it has no rule for is not
thereby uncheckable. What it supports is the one-directional claim this module
makes: **a criterion `axe-core` automates, that our engines neither check nor
disclose, is a gap we cannot have known we had.**

Three comparisons, against the two engines' own machine-readable coverage
statements:

1. **Undisclosed criteria.** A criterion `axe-core` automates that an engine
   neither checks nor lists as untested. `a11y-engine-agreement/` established
   the reason this class is the dangerous one: a record carries two lists, and
   a criterion in neither is invisible to the customer -- unable to be
   distinguished from "checked and passed".
2. **Over-declined criteria.** A criterion an engine declares needs a human,
   that `axe-core` automates. Understates coverage; costs margin, not
   liability.
3. **Depth.** For criteria both check, how many distinct failure modes
   `axe-core` has rules for. Our engines disclose at *criterion* granularity
   with a three-value label, so this is the width of what one "partial" hides.

Standard library only. Reads local files, writes only its `--out` path, takes
no credentials, publishes nothing, spends nothing. The `axe-core` catalog is
committed (`axe-rules-4.13.0.json`), so the whole measurement re-derives
offline; `--refresh-catalog` regenerates it and is the only step needing a
network.

    python3 measure.py                                  # measure
    python3 measure.py --recompute-from results-2026-08-21.json
    python3 measure.py --out results.json
    python3 measure.py --refresh-catalog                # needs network + node
"""

from __future__ import annotations

import argparse
import ast
import collections
import json
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
PROBE_RULES = ROOT / "portfolio/pipeline/probes/eaa-wcag-triage/src/wcag_triage/rules.py"
AUDIT_PY = ROOT / "portfolio/research/a11y-evidence-record/audit.py"
CATALOG = HERE / "axe-rules-4.13.0.json"

# axe-core tags its rules with conformance levels, not its criteria. A rule
# carrying several success criteria cannot say which of them earned which
# level, so a criterion's level is derived only from rules that name exactly
# one criterion. Criteria reachable only through multi-criterion rules are
# reported with level None rather than guessed -- which is what keeps 2.1.3
# (AAA, reachable here only via a rule that is also tagged 2.1.1) out of the
# A/AA scope instead of silently inflating it.
LEVELS_IN_SCOPE = ("A", "AA")


# ---------------------------------------------------------------------------
# Reading the two engines' coverage statements
#
# Parsed from source with `ast` rather than imported. These are the artifacts
# whose accuracy is under test; importing them would run the engines, and the
# question here is what the *statement* says, not what the code does. (What
# the code does is checked separately -- see `test_measure.py`, which runs
# defect markup through both engines for every gap this module reports.)
# ---------------------------------------------------------------------------

def _assigned_names(node: ast.AST) -> list:
    if isinstance(node, ast.Assign):
        return [getattr(t, "id", "") for t in node.targets]
    if isinstance(node, ast.AnnAssign):
        return [getattr(node.target, "id", "")]
    return []


def _criterion_number(text: str) -> str:
    """"1.4.3 Contrast (Minimum)" -> "1.4.3"."""
    return text.split()[0]


def probe_catalog(source: str | None = None) -> dict:
    """`eaa-wcag-triage`'s COVERAGE tuple: criterion -> automated/partial/manual."""
    source = PROBE_RULES.read_text(encoding="utf-8") if source is None else source
    for node in ast.walk(ast.parse(source)):
        if "COVERAGE" not in _assigned_names(node):
            continue
        rows = {}
        for element in node.value.elts:
            args = [a.value for a in element.args if isinstance(a, ast.Constant)]
            rows[args[0]] = args[3]
        return {
            "checked": {c for c, cov in rows.items()
                        if cov in ("automated", "partial")},
            "declared_untested": {c for c, cov in rows.items()
                                  if cov in ("manual", "unimplemented")},
            "declared_unimplemented": {c for c, cov in rows.items()
                                       if cov == "unimplemented"},
        }
    raise LookupError("COVERAGE not found in %s" % PROBE_RULES)


def audit_catalog(source: str | None = None) -> dict:
    """`audit.py`'s CHECKS values and NOT_TESTED rows."""
    source = AUDIT_PY.read_text(encoding="utf-8") if source is None else source
    checked: set = set()
    declared: set = set()
    unimplemented: set = set()
    for node in ast.walk(ast.parse(source)):
        names = _assigned_names(node)
        if "CHECKS" in names:
            for value in node.value.values:
                checked.add(_criterion_number(value.elts[0].value))
        if "NOT_TESTED" in names:
            for element in node.value.elts:
                text, reason = element.elts[0].value, element.elts[1].value
                # NOT_TESTED also carries two prose rows ("Alt text quality",
                # "Assistive-technology outcome") that name no criterion.
                if not text[:1].isdigit():
                    continue
                criterion = _criterion_number(text)
                declared.add(criterion)
                # `audit.py` has one NOT_TESTED list where the probe has two
                # coverage values, so the distinction that matters here --
                # "a human has to do this" versus "nobody does this" -- lives
                # in the reason string. This marker is the one it writes.
                if "no rule here looks" in reason:
                    unimplemented.add(criterion)
    if not checked:
        raise LookupError("CHECKS not found in %s" % AUDIT_PY)
    return {"checked": checked, "declared_untested": declared,
            "declared_unimplemented": unimplemented}


# ---------------------------------------------------------------------------
# The external reference
# ---------------------------------------------------------------------------

def load_reference(path: pathlib.Path = CATALOG) -> dict:
    """axe-core's rules, keyed by success criterion, restricted to A/AA."""
    raw = json.loads(path.read_text(encoding="utf-8"))
    level_of: dict = {}
    for rule in raw["rules"]:
        if len(rule["sc"]) == 1 and len(rule["levels"]) == 1:
            level_of.setdefault(rule["sc"][0], rule["levels"][0])
    rules_for = collections.defaultdict(set)
    for rule in raw["rules"]:
        for criterion in rule["sc"]:
            if level_of.get(criterion) in LEVELS_IN_SCOPE:
                rules_for[criterion].add(rule["id"])
    return {
        "axe_core_version": raw["axe_core_version"],
        "level": {c: level_of[c] for c in rules_for},
        "rules": {c: sorted(ids) for c, ids in rules_for.items()},
    }


# ---------------------------------------------------------------------------
# The three comparisons
# ---------------------------------------------------------------------------

def compare(reference: dict, engines: dict) -> dict:
    criteria = set(reference["rules"])
    union_checked = set().union(*(e["checked"] for e in engines.values()))
    union_declared = set().union(*(e["declared_untested"] for e in engines.values()))

    undisclosed = []
    over_declined = []
    disclosed_unimplemented = []
    for criterion in sorted(criteria - union_checked):
        row = {
            "criterion": criterion,
            "level": reference["level"][criterion],
            "axe_rules": reference["rules"][criterion],
            "disclosed_by": sorted(
                name for name, e in engines.items()
                if criterion in e["declared_untested"]
            ),
            "declared_unimplemented_by": sorted(
                name for name, e in engines.items()
                if criterion in e.get("declared_unimplemented", set())
            ),
        }
        if not row["disclosed_by"]:
            undisclosed.append(row)
        elif row["declared_unimplemented_by"]:
            # Disclosed, and disclosed for the right reason: the engine says
            # it has no rule, not that a human is needed. Not a liability
            # finding -- the record is accurate about it.
            disclosed_unimplemented.append(row)
        else:
            # Disclosed as needing a human, which the reference contradicts:
            # an automated rule exists. Costs margin (work sent to the
            # contractor that a rule could do), not accuracy.
            over_declined.append(row)

    depth = [
        {
            "criterion": criterion,
            "level": reference["level"][criterion],
            "axe_rule_count": len(reference["rules"][criterion]),
            "axe_rules": reference["rules"][criterion],
            "claimed_by": sorted(
                name for name, e in engines.items() if criterion in e["checked"]
            ),
        }
        for criterion in sorted(criteria & union_checked)
    ]
    depth.sort(key=lambda r: (-r["axe_rule_count"], r["criterion"]))

    return {
        "axe_core_version": reference["axe_core_version"],
        "reference_criteria": len(criteria),
        "union_checked": sorted(union_checked),
        "union_declared_untested": sorted(union_declared),
        "undisclosed": undisclosed,
        "over_declined": over_declined,
        "disclosed_unimplemented": disclosed_unimplemented,
        "depth": depth,
        "checked_without_axe_rule": sorted(union_checked - criteria),
    }


def source_at(revision: str, path: pathlib.Path) -> str:
    """A file's contents at a git revision, without touching the worktree."""
    rel = path.relative_to(ROOT)
    return subprocess.run(
        ["git", "-C", str(ROOT), "show", "%s:%s" % (revision, rel)],
        check=True, capture_output=True, text=True).stdout


def measure(revision: str | None = None) -> dict:
    """Compare both engines' coverage statements against the reference.

    ``revision`` reads the statements at a git revision instead of from the
    worktree. That is what keeps the as-found result reproducible after the
    gaps it reports have been disclosed: this measurement changes the thing it
    measures, so a committed result set that could only be trusted rather than
    re-derived would be exactly the artifact this directory argues against.
    """
    if revision is None:
        engines = {"audit.py": audit_catalog(), "eaa-wcag-triage": probe_catalog()}
    else:
        engines = {
            "audit.py": audit_catalog(source_at(revision, AUDIT_PY)),
            "eaa-wcag-triage": probe_catalog(source_at(revision, PROBE_RULES)),
        }
    result = compare(load_reference(), engines)
    result["measured_at_revision"] = revision or "worktree"
    result["engines"] = {
        name: {k: sorted(v) for k, v in cat.items()} for name, cat in engines.items()
    }
    return result


# ---------------------------------------------------------------------------
# Refreshing the pinned catalog (the only step that needs a network)
# ---------------------------------------------------------------------------

_EXPORT_JS = """
const axe = require(process.argv[1]);
const pkg = require(process.argv[2]);
const LV = {wcag2a:'A', wcag21a:'A', wcag22a:'A',
            wcag2aa:'AA', wcag21aa:'AA', wcag22aa:'AA', wcag2aaa:'AAA'};
const rules = [];
for (const r of axe.getRules()) {
  const sc = r.tags.filter(t => /^wcag\\d{3,4}$/.test(t)).map(t => {
    const d = t.slice(4);
    return d.length === 3 ? d.split('').join('.') : d[0] + '.' + d[1] + '.' + d.slice(2);
  });
  if (!sc.length) continue;
  const levels = [...new Set(r.tags.filter(t => LV[t]).map(t => LV[t]))];
  rules.push({id: r.ruleId, sc: sc.sort(), levels: levels.sort()});
}
rules.sort((a, b) => (a.id < b.id ? -1 : 1));
process.stdout.write(JSON.stringify({axe_core_version: pkg.version, rules}, null, 1));
"""


def refresh_catalog(dest: pathlib.Path, workdir: pathlib.Path) -> pathlib.Path:
    """Re-fetch axe-core and re-export its rule catalog. Needs network + node."""
    workdir.mkdir(parents=True, exist_ok=True)
    meta = json.loads(subprocess.run(
        ["curl", "-sS", "https://registry.npmjs.org/axe-core/latest"],
        check=True, capture_output=True, text=True).stdout)
    tarball = workdir / "axe-core.tgz"
    subprocess.run(["curl", "-sS", "-o", str(tarball), meta["dist"]["tarball"]], check=True)
    subprocess.run(["tar", "xzf", str(tarball), "-C", str(workdir)], check=True)
    exported = subprocess.run(
        ["node", "-e", _EXPORT_JS,
         str(workdir / "package/axe.js"), str(workdir / "package/package.json")],
        check=True, capture_output=True, text=True).stdout
    dest.write_text(exported, encoding="utf-8")
    return dest


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

def summarise(data: dict) -> str:
    out = [
        "axe-core %s: %d A/AA success criteria carry at least one rule."
        % (data["axe_core_version"], data["reference_criteria"]),
        "This portfolio's two engines check %d of them."
        % len(set(data["union_checked"]) & {
            r["criterion"] for r in data["depth"]}),
        "",
        "1. UNDISCLOSED -- neither checked nor listed as untested by either engine",
    ]
    for row in data["undisclosed"]:
        out.append("     %-7s %-2s  %d axe rule(s): %s"
                   % (row["criterion"], row["level"], len(row["axe_rules"]),
                      ", ".join(row["axe_rules"])))
    out.append("   %d criteria, %d of them Level A."
               % (len(data["undisclosed"]),
                  sum(1 for r in data["undisclosed"] if r["level"] == "A")))
    out += ["", "2. OVER-DECLINED -- declared to need a human, but axe automates"]
    for row in data["over_declined"]:
        out.append("     %-7s %-2s  disclosed by %s"
                   % (row["criterion"], row["level"], ", ".join(row["disclosed_by"])))
    out += ["", "2b. DISCLOSED AS UNIMPLEMENTED -- no rule, and the record says so"]
    for row in data.get("disclosed_unimplemented", []):
        out.append("     %-7s %-2s  declared by %s"
                   % (row["criterion"], row["level"],
                      ", ".join(row["declared_unimplemented_by"])))
    out += ["", "3. DEPTH -- criteria we claim, and how many failure modes axe checks"]
    for row in data["depth"]:
        out.append("     %-7s %-2s  axe rules=%-3d claimed by %s"
                   % (row["criterion"], row["level"], row["axe_rule_count"],
                      ", ".join(row["claimed_by"])))
    return "\n".join(out)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", type=pathlib.Path, help="write the full result set here")
    ap.add_argument("--recompute-from", type=pathlib.Path,
                    help="re-report a committed result set, no engines read")
    ap.add_argument("--refresh-catalog", action="store_true",
                    help="re-fetch axe-core and rewrite the pinned catalog")
    ap.add_argument("--workdir", type=pathlib.Path,
                    default=pathlib.Path("/tmp/axe-core-refresh"),
                    help="scratch directory for --refresh-catalog")
    ap.add_argument("--at-revision",
                    help="read both coverage statements at this git revision "
                         "instead of from the worktree")
    args = ap.parse_args(argv)

    if args.refresh_catalog:
        dest = refresh_catalog(CATALOG, args.workdir)
        print("rewrote %s" % dest.name)
        return 0

    data = (json.loads(args.recompute_from.read_text(encoding="utf-8"))
            if args.recompute_from else measure(args.at_revision))
    print(summarise(data))
    if args.out:
        args.out.write_text(json.dumps(data, indent=1, sort_keys=True) + "\n",
                            encoding="utf-8")
        print("\nwrote %s" % args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
