"""Asks ifcopenshell.validate (express_rules=True) the question
eval/where-rules-seeded.mjs asks of where-rules.mjs: on each seeded copy, which
WHERE rule failures are new against the original, and are they exactly the
seeded ones? Reads that script's OUTDIR/manifest.json.
    python eval/where_rules_seeded_ifcopenshell.py OUTDIR/manifest.json [--jobs N]
(pip install ifcopenshell pytest; measured with 0.9.0.post1.)
eval/where-rules-seeded-2026-11-24.md.
"""
import collections, json, logging, re, sys
from concurrent.futures import ProcessPoolExecutor


def rule_lines(path):
    import ifcopenshell, ifcopenshell.validate
    logging.disable(logging.CRITICAL)
    logger = ifcopenshell.validate.json_logger()
    ifcopenshell.validate.validate(path, logger, express_rules=True)
    out = set()
    for s in logger.statements:
        kind = s.get("type")
        if not kind or not str(kind).endswith("rule"):
            continue
        name = s.get("attribute")
        if not name:
            m = re.search(r"Rule (\w+\.\w+)", str(s.get("message")))
            name = m.group(1) if m else None
        if not name or re.search(r"\.UR\d+$", str(name)):
            continue
        inst = s.get("instance")
        try:
            iid = inst.id() if inst is not None and hasattr(inst, "id") else None
        except Exception:
            iid = None
        out.add((iid, str(name).lower()))
    return out


def main():
    man = json.load(open(sys.argv[1]))
    jobs = int(sys.argv[sys.argv.index("--jobs") + 1]) if "--jobs" in sys.argv else 4
    paths = sorted({m["original"] for m in man} | {m["seeded"] for m in man})
    with ProcessPoolExecutor(jobs) as ex:
        found = dict(zip(paths, ex.map(rule_lines, paths)))
    tally = collections.defaultdict(lambda: collections.Counter())
    for m in man:
        before, after = found[m["original"]], found[m["seeded"]]
        added, lost = after - before, before - after
        want = {(e["id"], e["rule"].lower()) for e in m["expect"]}
        ours_added = {(int(k.split(" ")[0]), k.split(" ", 1)[1].lower()) for k in m["ours"]["added"]}
        hit, extra, missed = added & want, added - want, want - after
        t = tally[m["family"]]
        t["files"] += 1; t["seeds"] += len(want); t["fired"] += len(hit); t["extra"] += len(extra); t["missed"] += len(missed); t["lost"] += len(lost)
        t["same as here"] += int(added == ours_added and not lost and not m["ours"]["lost"])
        name = m["seeded"].split("/")[-1]
        print(f"{name}: {len(want)} seeded, {len(hit)} fired"
              + (f", EXTRA {sorted(extra, key=str)[:6]}" if extra else "")
              + (f", MISSED {sorted(missed, key=str)[:6]}" if missed else "")
              + (f", LOST {sorted(lost, key=str)[:6]}" if lost else "")
              + ("" if added == ours_added else f", DIFFERS FROM where-rules.mjs: only IfcOpenShell {sorted(added - ours_added, key=str)[:4]}, only here {sorted(ours_added - added, key=str)[:4]}"), flush=True)
    print(f"\n{'family':27} {'files':>5} {'seeds':>6} {'fired':>6} {'extra':>6} {'missed':>6} {'lost':>5} {'same':>5}")
    for k, t in tally.items():
        print(f"{k:27} {t['files']:5} {t['seeds']:6} {t['fired']:6} {t['extra']:6} {t['missed']:6} {t['lost']:5} {t['same as here']:5}")


if __name__ == "__main__":
    main()
