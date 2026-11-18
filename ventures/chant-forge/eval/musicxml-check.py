"""python eval/musicxml-check.py OUT_DIR XSD_DIR [--report FILE]

Second half of eval/musicxml-check.mjs. For every score it wrote:

1. validate against the MusicXML 4.0 XSD (w3c/musicxml, tag v4.0: musicxml.xsd, xml.xsd,
   xlink.xsd in XSD_DIR; the two imports are pointed at the local copies);
2. read it with music21 (an independent parser), strip the ties, and compare every part's
   notes with the expected list: onset and length in quarters, MIDI number, syllable;
3. check every measure of every part sums to one 4/4 bar, and every part to the piece's length;
4. compare the accidentals the score shows with the ones music21's own makeAccidentals would
   show (its default rule, courtesy accidentals included). A difference is listed, not failed:
   accidental display has more than one accepted style.

Needs lxml and music21 (pip install lxml music21). Writes a Markdown report.
"""
import copy
import json
import os
import sys
from collections import Counter

from lxml import etree
import music21

out, xsd_dir = sys.argv[1], os.path.abspath(sys.argv[2])
report = sys.argv[sys.argv.index("--report") + 1] if "--report" in sys.argv else None

src = open(os.path.join(xsd_dir, "musicxml.xsd"), encoding="utf-8").read()
for name in ("xml.xsd", "xlink.xsd"):
    src = src.replace(f"http://www.musicxml.org/xsd/{name}", os.path.join(xsd_dir, name))
schema = etree.XMLSchema(etree.fromstring(src.encode("utf-8"), base_url=xsd_dir + "/"))

meta = json.load(open(os.path.join(out, "sets.json")))
rows = Counter()
fails = []
spelled = Counter()
acc_agree, acc_diff = 0, []
for name in sorted(os.listdir(out)):
    if not name.endswith(".musicxml"):
        continue
    stem = name[: -len(".musicxml")]
    exp = json.load(open(os.path.join(out, stem + ".json")))
    s = exp["set"]
    rows[(s, "scores")] += 1
    path = os.path.join(out, name)
    doc = etree.parse(path)
    if not schema.validate(doc):
        fails.append(f"{stem}: XSD: {schema.error_log.last_error}")
        rows[(s, "xsd_fail")] += 1
        continue
    score = music21.converter.parse(path)
    parts = list(score.parts)
    if len(parts) != len(exp["parts"]):
        fails.append(f"{stem}: {len(parts)} parts, expected {len(exp['parts'])}")
        rows[(s, "fail")] += 1
        continue
    ok = True
    for part, want in zip(parts, exp["parts"]):
        rows[(s, "parts")] += 1
        if part.partName != want["name"]:
            fails.append(f"{stem}: part {part.partName!r}, expected {want['name']!r}")
            ok = False
        for m in part.getElementsByClass("Measure"):
            if abs(float(m.duration.quarterLength) - 4.0) > 1e-9:
                fails.append(f"{stem}: {part.partName} measure {m.number} lasts {m.duration.quarterLength}")
                ok = False
        if abs(float(part.duration.quarterLength) - max(4.0, -(-exp["total"] // 4) * 4)) > 1e-9:
            fails.append(f"{stem}: {part.partName} lasts {part.duration.quarterLength}, piece {exp['total']}")
            ok = False
        got = []
        for n in part.stripTies().flatten().notes:
            lyr = n.lyrics[0].text if n.lyrics else None
            got.append({"onset": float(n.offset), "dur": float(n.quarterLength), "midi": n.pitch.midi, "syllable": lyr})
            spelled[n.pitch.accidental.name if n.pitch.accidental else "natural"] += 1
        rows[(s, "notes")] += len(want["notes"])
        if len(got) != len(want["notes"]):
            fails.append(f"{stem}: {part.partName} {len(got)} notes, expected {len(want['notes'])}")
            ok = False
            continue
        for k, (g, w) in enumerate(zip(got, want["notes"])):
            if abs(g["onset"] - w["onset"]) > 1e-9 or abs(g["dur"] - w["dur"]) > 1e-9 or g["midi"] != w["midi"] or g["syllable"] != w["syllable"]:
                fails.append(f"{stem}: {part.partName} note {k + 1}: got {g}, expected {w}")
                ok = False
                break
            rows[(s, "agree")] += 1
    rows[(s, "pass" if ok else "fail")] += 1
    # 4. accidental display, against music21's rule
    shown_here = [[n.find("accidental") is not None for n in p.iter("note") if n.find("pitch") is not None] for p in doc.getroot().iter("part")]
    for part, mine in zip(parts, shown_here):
        c = copy.deepcopy(part)
        for n in c.recurse().notes:
            if n.pitch.accidental is not None:
                n.pitch.accidental.displayStatus = None
        c.makeAccidentals(inPlace=True, cautionaryNotImmediateRepeat=False, overrideStatus=True)
        for n, m in zip(c.recurse().notes, mine):
            theirs = bool(n.pitch.accidental is not None and n.pitch.accidental.displayStatus)
            if theirs == m:
                acc_agree += 1
            else:
                acc_diff.append(f"{stem}: {part.partName} bar {n.measureNumber} {n.nameWithOctave}: music21 {'shows' if theirs else 'omits'} it, the score {'shows' if m else 'omits'} it")

sets = list(meta["sets"])
lines = [
    "| option set | flags | scores written | refused by the CLI | XSD valid | read back exactly | parts | notes compared | notes agreeing |",
    "|---|---|---|---|---|---|---|---|---|",
]
for s in sets:
    t = meta["tally"][s]
    lines.append(
        f"| {s} | `{' '.join(meta['sets'][s])}` | {t['written']} | {t['refused']} | {rows[(s, 'scores')] - rows[(s, 'xsd_fail')]} | {rows[(s, 'pass')]} | {rows[(s, 'parts')]} | {rows[(s, 'notes')]} | {rows[(s, 'agree')]} |"
    )
text = "\n".join(lines)
text += f"\n\nmusic21 {music21.__version__}, lxml {etree.__version__}; {meta['files']} GABC files. Accidentals music21 reads on the notes: " + ", ".join(f"{k} {v}" for k, v in spelled.most_common()) + "."
text += f"\n\nAccidentals shown: {acc_agree} of {acc_agree + len(acc_diff)} notes as music21's makeAccidentals would show them; differences:\n" + "\n".join(f"- {d}" for d in acc_diff[:20])
text += f"\n\nFailures: {len(fails)}\n" + "\n".join(f"- {f}" for f in fails[:40])
print(text)
if report:
    open(report, "w").write(text + "\n")
sys.exit(1 if fails else 0)
