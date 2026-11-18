"""Join eval/french-inv065.mjs's rows with SaxonC-HE running each row's official stylesheet
(DIR/map.json, from profile-whitespace-crosscheck.mjs --fr): does SaxonC stop on the file
(a dynamic error such as FORG0001), and does the product's INV-065 name the mutated element.

    node eval/french-inv065.mjs DIR > rows.jsonl
    python3 -I eval/french-inv065-saxonc.py rows.jsonl      # pip install saxonche
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

from saxonche import PySaxonProcessor

FIRED = re.compile(r'<svrl:(failed-assert|successful-report)\b([^>]*)>([\s\S]*?)</svrl:\1>')
TEXT_ID = re.compile(r'<svrl:text[^>]*>\s*\[([^\]]+)\]')


def fired_ids(svrl):
    out = set()
    for _, attrs, body in FIRED.findall(svrl):
        m = re.search(r'\bid="([^"]+)"', attrs) or TEXT_ID.search(body)
        if m:
            out.add(m.group(1))
    return out

rows = [json.loads(x) for x in Path(sys.argv[1]).read_text().splitlines() if x]
manifests = {}
for r in rows:
    d = Path(r["dir"])
    if d not in manifests:
        manifests[d] = ({json.loads(x)["file"]: json.loads(x) for x in (d / "manifest.jsonl").read_text().splitlines() if x},
                        json.loads((d / "map.json").read_text()))
tally = Counter()
quiet = Counter()
with PySaxonProcessor(license=False) as proc:
    xslt = proc.new_xslt30_processor()
    compiled = {}
    fired = {}
    for r in rows:
        d = Path(r["dir"])
        rowmeta, xmap = manifests[d]
        abort = False
        ids = set()
        for name in rowmeta[r["file"]]["sets"]:
            if name not in compiled:
                compiled[name] = xslt.compile_stylesheet(stylesheet_file=xmap[name])
            try:
                ids |= fired_ids(compiled[name].transform_to_string(source_file=str(d / r["file"])))
            except Exception:
                abort = True
        fired[(d, r["file"])] = ids
        new = ids - fired.get((d, f'{r["base"]:05d}.xml'), set()) if r["base"] is not None else set()
        key = f'{r["syntax"]} {"unmutated" if r["base"] is None else "mutant"}'
        tally[f"{key}"] += 1
        tally[f"{key}, SaxonC stops"] += abort
        named = any(p.rsplit("/", 1)[-1].startswith(f'{r["field"]}[') for p in r["inv065"]) if r["field"] else False
        if abort:
            tally[f"{key}, SaxonC stops, INV-065 names the element"] += named
            tally[f"{key}, SaxonC stops, no INV-065"] += not r["inv065"]
        else:
            tally[f"{key}, SaxonC runs, INV-065 raised"] += bool(r["inv065"])
            if r["inv065"]:
                tally[f"{key}, SaxonC runs, INV-065 raised, SaxonC raises a new rule too"] += bool(new)
                if not new:
                    quiet[(r["syntax"], r["field"])] += 1
    print(proc.version)
for k, v in sorted(tally.items()):
    print(f"{k}: {v}")
print("INV-065 where SaxonC ran and raised nothing new (format, element):", dict(quiet.most_common()))
