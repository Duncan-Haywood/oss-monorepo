"""P6 notebooks through Project XML and back, read by MPXJ
(github.com/joniles/mpxj, an independent open-source reader of both formats).

  pip install mpxj jpype1   (needs a Java runtime)
  node eval/notebooks-check.mjs --xer <dir> --plant 200 --write <out>
  python eval/notebooks-mpxj.py <out> [--json out.json]

For every <stem>.xer in <out> with a <stem>.xml and <stem>-back.xer beside it
(as notebooks-check.mjs --write leaves them): MPXJ reads all three, and for
each activity (by activity ID; WBS nodes by name) with notes in the original
XER compares:

- the XER written back against the original, topic by topic. MPXJ gives a P6
  activity's notes as "Topic\\ntext" blocks in the file's row order and turns
  each <P> into a paragraph with a blank line after it, while P6 desktop's
  DHTML puts its 0x7F line breaks between them; so the comparison is per
  topic, with blank lines and the spaces at line ends dropped, list bullets
  ("*" in MPXJ's reading of <LI>, "-" in ours) read alike.
- the Project XML: MPXJ's notes for the same task equal the notes text
  msproject.mjs wrote ("[Topic]" headings and all), i.e. a Project-side
  reader sees the notes, not an empty field.
"""
import json, os, re, sys
import jpype, mpxj  # noqa: F401
jpype.startJVM()
from org.mpxj.reader import UniversalProjectReader  # noqa: E402


def norm(s):
    lines = [re.sub(r"[ \t ]+", " ", l).strip() for l in str(s).replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    lines = [re.sub(r"^\* ", "- ", l) for l in lines if l]
    return "\n".join(lines)


def notes(path, xer):
    p = UniversalProjectReader().read(path)
    out = {}
    for t in p.getTasks():
        n = t.getNotes()
        if n is None or not str(n).strip():
            continue
        if xer:
            k = str(t.getActivityID()) if t.getActivityID() is not None else None
            if t.getSummary():
                k = "WBS|" + str(t.getName())
        else:
            # msproject.mjs keeps the activity ID in Text1
            a = t.getText(1)
            k = str(a) if a is not None and not t.getSummary() else "WBS|" + str(t.getName())
            if t.getUniqueID() is not None and int(str(t.getUniqueID())) == 0:
                continue
        if k:
            out[k] = str(n)
    return out


def topics(text, names):
    """MPXJ's "Topic\\ntext\\n\\nTopic2\\n..." -> {topic: normalised text}"""
    out, cur = {}, None
    for line in str(text).replace("\r\n", "\n").split("\n"):
        if line.strip() in names and (cur is None or True):
            cur = line.strip()
            out.setdefault(cur, [])
            continue
        if cur is not None:
            out[cur].append(line)
    return {k: norm("\n".join(v)) for k, v in out.items()}


def main():
    d = sys.argv[1]
    names = {"Description", "Delays", "Anticipated Problems", "Notes to Owner", "Risk"}
    rows = []
    for f in sorted(os.listdir(d)):
        if not f.endswith(".xer") or f.endswith("-back.xer"):
            continue
        stem = f[:-4]
        xml, back = os.path.join(d, stem + ".xml"), os.path.join(d, stem + "-back.xer")
        if not (os.path.exists(xml) and os.path.exists(back)):
            continue
        a, b, x = notes(os.path.join(d, f), True), notes(back, True), notes(xml, False)
        if not a:
            continue
        entries = same = words = owners = in_xml = 0
        miss = []
        for k, v in a.items():
            owners += 1
            ta, tb = topics(v, names), topics(b.get(k, ""), names)
            for t, txt in ta.items():
                entries += 1
                if tb.get(t) == txt:
                    same += 1
                # MPXJ reads a notebook entry with no markup as HTML, so its
                # 0x7F line breaks become spaces; ours keeps them as lines
                if tb.get(t) is not None and " ".join(tb[t].split()) == " ".join(txt.split()):
                    words += 1
                elif len(miss) < 20:
                    miss.append({"owner": k, "topic": t, "original": txt, "back": tb.get(t)})
            xv = x.get(k)
            if xv is not None and all(("[%s]" % t) in xv for t in ta):
                in_xml += 1
        rows.append({"file": stem, "owners": owners, "entries": entries, "sameBack": same, "sameWordsBack": words, "ownersWithNotesInProjectXml": in_xml, "miss": miss})
        print("%s: %d owners, %d topic entries; back in XER, same lines by MPXJ %d, same words %d; owners whose Project XML notes MPXJ reads with every topic %d" % (stem, owners, entries, same, words, in_xml))
    tot = lambda k: sum(r[k] for r in rows)
    print("total: %d owners, %d entries, same lines back %d, same words back %d, Project XML %d" % (tot("owners"), tot("entries"), tot("sameBack"), tot("sameWordsBack"), tot("ownersWithNotesInProjectXml")))
    if "--json" in sys.argv:
        json.dump(rows, open(sys.argv[sys.argv.index("--json") + 1], "w"), indent=1)


main()
