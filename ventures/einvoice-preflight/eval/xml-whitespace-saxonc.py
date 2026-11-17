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
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

from saxonche import PySaxonProcessor

xsl_dir, out_dirs = Path(sys.argv[1]), [Path(d) for d in sys.argv[2:]]
rows = []
for d in out_dirs:
    for line in (d / "manifest.jsonl").read_text().splitlines():
        if line:
            rows.append({**json.loads(line), "dir": d})
FIRED = re.compile(r'<svrl:(?:failed-assert|successful-report)\b[^>]*?\bid="([^"]+)"')

with PySaxonProcessor(license=False) as proc:
    xslt = proc.new_xslt30_processor()
    compiled = {}

    def saxon_ids(row):
        ids = set()
        for name in row["sets"]:
            if name not in compiled:
                compiled[name] = xslt.compile_stylesheet(stylesheet_file=str(xsl_dir / f"{name}.xsl"))
            try:
                svrl = compiled[name].transform_to_string(source_file=str(row["dir"] / row["file"]))
            except Exception as e:  # a dynamic error is its own outcome, not a pass
                ids.add("#ERROR " + (re.findall(r"\b[A-Z]{4}\d{4}\b", str(e)) or ["?"])[0])
                continue
            ids.update(FIRED.findall(svrl))
        return ids

    for row in rows:
        row["saxonc"] = sorted(saxon_ids(row))
    print(proc.version)

by_index = {(r["dir"], int(r["file"][:5])): r for r in rows}


def delta(row, key):
    base = by_index[(row["dir"], row["base"])]
    now, was = set(row[key]), set(base[key])
    return frozenset(now - was), frozenset(was - now)


tally = Counter()
missed_before, missed_after, extra_after, sjs_off, aborts_silent = Counter(), Counter(), Counter(), Counter(), Counter()
examples = []
for row in rows:
    if row["base"] is None:
        tally["files"] += 1
        continue
    tally["mutants"] += 1
    truth = delta(row, "saxonc")
    if truth != (frozenset(), frozenset()):
        tally["saxonc changed"] += 1
    aborts = any(x.startswith("#ERROR") for x in truth[0])
    plain_cast = "#ERROR cast" in delta(row, "plainFixed")[0]
    if aborts or plain_cast:
        # Saxon stops on the whole file (a value a rule cannot cast). Before 2026-11-17 the
        # plain route only listed those rules as skipped; now run() adds XML-VALUE-01 at the
        # fields unreadableValues() names (castFields). Counted apart from rule ids.
        tally["saxonc aborts"] += aborts
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
print("raised by SaxonC, missed by the plain route before:", dict(missed_before.most_common()))
print("raised by SaxonC, missed after:", dict(missed_after.most_common()))
print("raised after, not by SaxonC:", dict(extra_after.most_common()))
print("Saxon-JS vs SaxonC, rule ids that differ:", dict(sjs_off.most_common()))
print("aborts the plain route does not see (field, variant):", dict(aborts_silent.most_common(12)))
for e in examples:
    print("\t".join(map(str, e)))
