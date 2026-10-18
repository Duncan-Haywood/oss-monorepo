"""Run the audit over research/ and write results.txt and results.json."""
import json, sys
from pathlib import Path
H = Path(__file__).resolve().parent
sys.path.insert(0, str(H.parent))
from audit import audit

n, flags, works = audit(H.parents[1])
ranked = sorted(works.items(), key=lambda kv: (-len(kv[1]), kv[0]))
out = ["projects with a README: %d" % n,
       "projects whose README flags an unverified citation or figure: %d (%.1f%%)" % (len(flags), 100 * len(flags) / n),
       "flagged lines: %d" % sum(len(v) for v in flags.values()),
       "distinct author-year works named on flagged lines: %d" % len(works),
       "", "most-repeated flagged works (projects that flag it):"]
out += ["  %2d  %s (%s)" % (len(ps), a, y) for (a, y), ps in ranked[:15]]
(H / "results.txt").write_text("\n".join(out) + "\n")
(H / "results.json").write_text(json.dumps(
    {"projects": n, "flagging": sorted(flags), "works": {"%s (%s)" % k: sorted(v) for k, v in ranked}}, indent=1) + "\n")
print("\n".join(out))
