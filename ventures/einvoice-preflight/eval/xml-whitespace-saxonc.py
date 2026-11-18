"""Re-run eval/xml-whitespace-crosscheck.mjs's mutants on SaxonC-HE (Saxonica's Saxon,
the engine Java validators such as Peppol's and KoSIT's run) and compare with the plain
route before and after the 2026-11-17 whitespace rewrite.

    python3 -I eval/xml-whitespace-saxonc.py XSL_DIR DIR [DIR ...]

Each DIR is a crosscheck --out folder (several when the run was split). XSL_DIR holds the official XSLT under the SEF names:
ubl.xsl and cii.xsl (eInvoicing-EN16931 ubl/xslt and cii/xslt), peppol-ubl.xsl,
peppol-cii.xsl, xrechnung-ubl.xsl, xrechnung-cii.xsl (the SchXslt output
build-schematron.mjs leaves in its work folder). Needs `pip install saxonche`.
Each mutant is compared on the change from its unmutated copy, so rule-set version
differences between the engines cancel out.

A DIR written by eval/profile-whitespace-crosscheck.mjs (PINT, ZATCA) carries a map.json
from set name to stylesheet path; when one is there it is used and XSL_DIR may be any
folder (pass the DIR itself). Its rows also name their profile, tallied apart.
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

from saxonche import PySaxonProcessor

argv = sys.argv[1:]
# --plain-scope: compare only rule ids the row's plain sets (../plain/<set>.json) carry;
# engine aborts are always kept. For a stylesheet that bundles rules its plain set leaves
# to another route: NLCIUS's si-ubl-2.0.3.13.xslt carries the whole EU base around
# BR-NL/SI-UBL (build-nl-rules.mjs keeps those), CIUS-PT's repeats BR-29 and others
# (build-pt-rules.mjs drops what the EN 16931 set checks).
plain_scope = "--plain-scope" in argv
if plain_scope:
    argv.remove("--plain-scope")
PLAIN = Path(__file__).resolve().parent.parent / "plain"
scope_ids = {}


def in_scope(sets):
    ids = set()
    for name in sets:
        if name not in scope_ids:
            d = json.loads((PLAIN / f"{name}.json").read_text())
            checks = [c for p in d["patterns"] for r in p["rules"] for c in r["checks"]]
            scope_ids[name] = {c.get("id") for c in checks} | {m for c in checks for m in re.findall(r"^\[([^\]]+)\]", c.get("text", ""))}
        ids |= scope_ids[name]
    return ids


xsl_dir, out_dirs = Path(argv[0]), [Path(d) for d in argv[1:]]
rows = []
xsl_map = {}
for d in out_dirs:
    if (d / "map.json").exists():
        xsl_map.update(json.loads((d / "map.json").read_text()))
for d in out_dirs:
    for line in (d / "manifest.jsonl").read_text().splitlines():
        if line:
            rows.append({**json.loads(line), "dir": d})
FIRED = re.compile(r'<svrl:(failed-assert|successful-report)\b([^>]*)>([\s\S]*?)</svrl:\1>')
TEXT_ID = re.compile(r'<svrl:text[^>]*>\s*\[([^\]]+)\]')


def fired_ids(svrl):
    # The assert's id attribute, else the [ID] that opens its message: what parseSvrl in
    # schematron-core.mjs reports. Until 2026-11-17 only the attribute was read, so FNFE's
    # CDAR and Flux 10 stylesheets, whose asserts carry no id, showed no rule at all.
    out = set()
    for _, attrs, body in FIRED.findall(svrl):
        m = re.search(r'\bid="([^"]+)"', attrs) or TEXT_ID.search(body)
        if m:
            out.add(m.group(1))
    return out

with PySaxonProcessor(license=False) as proc:
    xslt = proc.new_xslt30_processor()
    compiled = {}

    def saxon_ids(row):
        ids = set()
        for name in row["sets"]:
            if name not in compiled:
                compiled[name] = xslt.compile_stylesheet(stylesheet_file=str(xsl_map.get(name) or xsl_dir / f"{name}.xsl"))
            try:
                svrl = compiled[name].transform_to_string(source_file=str(row["dir"] / row["file"]))
            except Exception as e:  # a dynamic error is its own outcome, not a pass
                ids.add("#ERROR " + (re.findall(r"\b[A-Z]{4}\d{4}\b", str(e)) or ["?"])[0])
                continue
            ids.update(fired_ids(svrl))
        return ids

    for row in rows:
        row["saxonc"] = sorted(saxon_ids(row))
        if plain_scope:
            keep = in_scope(row["sets"])
            for key in ("saxonc", "plainFixed", "plainBefore"):
                row[key] = [x for x in row[key] if x.startswith("#ERROR") or x in keep]
    print(proc.version)

by_index = {(r["dir"], int(r["file"][:5])): r for r in rows}


def delta(row, key):
    base = by_index[(row["dir"], row["base"])]
    now, was = set(row[key]), set(base[key])
    return frozenset(now - was), frozenset(was - now)


tally = Counter()
per_profile = {}
for row in rows:
    if "profile" in row:
        per_profile.setdefault(row["profile"], Counter())
missed_before, missed_after, extra_after, sjs_off, aborts_silent = Counter(), Counter(), Counter(), Counter(), Counter()
examples = []
unmutated_off = []
for row in rows:
    if row["base"] is None:
        tally["files"] += 1
        same = set(row["saxonc"]) == set(row["plainFixed"])
        tally["unmutated, same rule ids"] += same
        if not same and len(unmutated_off) < 10:
            unmutated_off.append((row["source"], sorted(set(row["saxonc"]) - set(row["plainFixed"])), sorted(set(row["plainFixed"]) - set(row["saxonc"]))))
        continue
    tally["mutants"] += 1
    truth = delta(row, "saxonc")
    if "profile" in row:
        per_profile[row["profile"]]["mutants"] += 1
    if truth != (frozenset(), frozenset()):
        tally["saxonc changed"] += 1
    aborts = any(x.startswith("#ERROR") for x in truth[0])
    plain_cast = "#ERROR cast" in delta(row, "plainFixed")[0]
    if aborts or plain_cast:
        # Saxon stops on the whole file (a value a rule cannot cast). Before 2026-11-17 the
        # plain route only listed those rules as skipped; now run() adds XML-VALUE-01 at the
        # fields unreadableValues() names (castFields). Counted apart from rule ids.
        tally["saxonc aborts"] += aborts
        if "profile" in row:
            per_profile[row["profile"]]["saxonc aborts"] += aborts
            per_profile[row["profile"]]["aborts, XML-VALUE-01 names the field"] += bool(aborts and plain_cast and row.get("castFields", 0) > 0)
        if aborts and not delta(row, "plainBefore")[0] - {"#ERROR cast"}:
            tally["aborts, plain route raised no rule before"] += 1
        if aborts and plain_cast and row.get("castFields", 0) > 0:
            tally["aborts, XML-VALUE-01 names the field"] += 1
        elif aborts and plain_cast:
            tally["aborts, XML-VALUE-01 with no field"] += 1
        elif aborts:
            tally["aborts the plain route does not see"] += 1
            aborts_silent[(row["field"], row["variant"])] += 1
        else:
            tally["plain cast failure, Saxon ran"] += 1
        continue
    keys = (("plainBefore", "before"), ("plainFixed", "after")) + ((("saxonjs", "saxon-js"),) if "saxonjs" in row else ())
    for key, label in keys:
        got = delta(row, key)
        if got != truth:
            tally[f"{label} differs"] += 1
            if "profile" in row:
                per_profile[row["profile"]][f"{label} differs"] += 1
            if label == "before":
                missed_before.update(truth[0] - got[0])
            if label == "after":
                missed_after.update(truth[0] - got[0])
                extra_after.update(got[0] - truth[0])
                if len(examples) < 20:
                    examples.append((row["source"], row["field"], row["variant"], sorted(truth[0]), sorted(got[0])))
            if label == "saxon-js":
                sjs_off.update((truth[0] ^ got[0]))

print(json.dumps(tally))
for name, c in sorted(per_profile.items()):
    print(f"  {name}: {json.dumps(c)}")
print("raised by SaxonC, missed by the plain route before:", dict(missed_before.most_common()))
print("raised by SaxonC, missed after:", dict(missed_after.most_common()))
print("raised after, not by SaxonC:", dict(extra_after.most_common()))
print("Saxon-JS vs SaxonC, rule ids that differ:", dict(sjs_off.most_common()))
print("aborts the plain route does not see (field, variant):", dict(aborts_silent.most_common(12)))
for u in unmutated_off:
    print("unmutated, ids differ (Saxon only, plain only):", *u)
for e in examples:
    print("\t".join(map(str, e)))
