"""P6 resource notes through Project XML and back, read by MPXJ
(github.com/joniles/mpxj, an independent open-source reader of both formats).

  pip install mpxj jpype1   (needs a Java runtime)
  node eval/resource-notes-check.mjs --xer <dir> --plant 100 --mspdi <mpxj>/junit/data --write <out>
  python eval/resource-notes-mpxj.py <out> [--mspdi <mpxj>/junit/data] [--json out.json]

For every <stem>.xer in <out> with <stem>.xml and <stem>-back.xer beside it,
MPXJ reads all three; for each resource with notes in the original XER (by
name), its notes in the Project XML and in the XER written back must read the
same words and lines as in the original. For every mspdi-<name>-<n>.xer (a
Project file of MPXJ's corpus written to XER), MPXJ reads the source .xml and
the XER: each non-cost resource's notes must read the same.

Lines are compared with blank lines and spaces at line ends dropped and list
bullets ("*" in MPXJ's reading of <LI>, "-" in ours) read alike.
"""
import json, os, re, sys
import jpype, mpxj  # noqa: F401
jpype.startJVM()
from org.mpxj.reader import UniversalProjectReader  # noqa: E402


def norm(s):
    lines = [re.sub(r"[ \t ]+", " ", l).strip() for l in str(s).replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    return "\n".join(re.sub(r"^[*•] ", "- ", l) for l in lines if l)


def words(s):
    return " ".join(norm(s).replace("\n", " ").replace("- ", " ").split())


def rnotes(path):
    p = UniversalProjectReader().read(path)
    out = {}
    for r in p.getResources():
        name, n = r.getName(), r.getNotes()
        if name is None or n is None or not str(n).strip():
            continue
        if r.getType() is not None and str(r.getType()) == "COST":
            continue
        out[str(name)] = str(n)
    return out


args = sys.argv[1:]
d = args[0]
mspdi = args[args.index("--mspdi") + 1] if "--mspdi" in args else None
res = {"planted": [], "mspdi": []}
for f in sorted(os.listdir(d)):
    if f.startswith("mspdi-") or not f.endswith(".xer") or f.endswith("-back.xer"):
        continue
    stem = f[:-4]
    a, x, b = rnotes(os.path.join(d, f)), rnotes(os.path.join(d, stem + ".xml")), rnotes(os.path.join(d, stem + "-back.xer"))
    row = {"file": f, "resources": len(a),
           "xmlSameWords": sum(1 for k in a if words(x.get(k, "")) == words(a[k])),
           "xmlSameLines": sum(1 for k in a if norm(x.get(k, "")) == norm(a[k])),
           "backSameWords": sum(1 for k in a if words(b.get(k, "")) == words(a[k])),
           "backSameLines": sum(1 for k in a if norm(b.get(k, "")) == norm(a[k])),
           "extraInBack": len(set(b) - set(a))}
    row["miss"] = [{"name": k, "orig": a[k][:200], "back": b.get(k, "")[:200]} for k in a if norm(b.get(k, "")) != norm(a[k])][:3]
    res["planted"].append(row)
if mspdi:
    for f in sorted(os.listdir(d)):
        if not f.startswith("mspdi-"):
            continue
        base = re.sub(r"-\d+\.xer$", "", f[len("mspdi-"):]) + ".xml"
        src = [os.path.join(r, base) for r, _, fs in os.walk(mspdi) if base in fs]
        if not src:
            continue
        a, b = rnotes(src[0]), rnotes(os.path.join(d, f))
        if not a:
            continue
        res["mspdi"].append({"file": f, "notes": len(a),
                             "sameWords": sum(1 for k in a if words(b.get(k, "")) == words(a[k])),
                             "sameLines": sum(1 for k in a if norm(b.get(k, "")) == norm(a[k])),
                             "miss": [{"name": k, "orig": a[k][:200], "xer": b.get(k, "")[:200]} for k in a if norm(b.get(k, "")) != norm(a[k])][:3]})
tot = lambda k, key: sum(r[key] for r in res[k])
res["totals"] = {"planted": tot("planted", "resources"), "xmlSameWords": tot("planted", "xmlSameWords"), "xmlSameLines": tot("planted", "xmlSameLines"),
                 "backSameWords": tot("planted", "backSameWords"), "backSameLines": tot("planted", "backSameLines"), "extraInBack": tot("planted", "extraInBack"),
                 "mspdiNotes": tot("mspdi", "notes"), "mspdiSameWords": tot("mspdi", "sameWords"), "mspdiSameLines": tot("mspdi", "sameLines")}
print(json.dumps(res["totals"], indent=1))
if "--json" in args:
    with open(args[args.index("--json") + 1], "w") as fh:
        json.dump(res, fh, indent=1)
        fh.write("\n")
