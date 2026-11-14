"""Does the Factur-X repair keep a PDF/A-3 file PDF/A-3? veraPDF on real PDFs.

For every Factur-X / ZUGFeRD PDF under the given folders whose embedded CII
the repair leaves alone (folders named fail/invalid skipped), this:

1. runs veraPDF on the original (flavour from its XMP) and keeps those that pass;
2. seeds one fault in place (the document tax total, BT-110, pushed up 7.00):
   pikepdf rewrites only the attachment's stream data, keeping its filespec,
   /AF link and metadata, and saves preserving the file's object streams;
3. runs veraPDF on the seeded copy (the control: the seeding itself must not
   break PDF/A), then `node repair-cli.mjs seeded.pdf -o repaired.pdf`, then
   veraPDF on the repaired copy, and lists the rules a repaired file fails.

    python3 -m pip install pikepdf
    python3 eval/repair-verapdf-corpus.py <verapdf-command> <checkout> [<checkout> ...]

veraPDF: org.verapdf.apps:cli from Maven Central, main class
org.verapdf.apps.GreenfieldCliWrapper (software.verapdf.org is blocked from
cloud sessions; Maven Central is not).
"""
import re
import shutil
import subprocess
import sys
import tempfile
from collections import Counter
from pathlib import Path

import pikepdf

HERE = Path(__file__).resolve().parent.parent
TAX = re.compile(rb"(<(?:[\w.-]+:)?TaxTotalAmount\b[^>]*>)\s*(-?[\d.]+)\s*(</)")
SKIP = re.compile(r"(^|/)(fail|invalid|negative|error)s?(/|_)", re.I)


def verapdf(cmd, files):
    """{path: (passed, [failed rule ids])} for a batch, one JVM."""
    out = {}
    for i in range(0, len(files), 60):
        batch = [str(f) for f in files[i:i + 60]]
        run = subprocess.run([cmd, "--format", "text", "-v", *batch], capture_output=True, text=True)
        current = None
        for line in run.stdout.splitlines():
            m = re.match(r"^(PASS|FAIL) (.+?) (\S+)$", line)
            if m:
                current = m.group(2)
                out[current] = (m.group(1) == "PASS", [], m.group(3))
            elif current and line.strip().startswith("FAIL "):
                out[current][1].append(line.strip()[5:])
    return out


def cii_spec(pdf):
    for name, spec in pdf.attachments.items():
        data = spec.get_file().read_bytes()
        if b"CrossIndustryInvoice" in data[:20000]:
            return name, spec, data
    return None, None, None


def main(cmd, roots):
    work = Path(tempfile.mkdtemp())
    for sub in ("orig", "seeded", "repaired"):
        (work / sub).mkdir()
    names = {}
    for root in roots:
        for path in sorted(Path(root).rglob("*.pdf")):
            rel = str(path.relative_to(root))
            if SKIP.search(rel) or re.match(r"(invalid|not_validating)", path.name, re.I):
                continue
            try:
                with pikepdf.open(path) as pdf:
                    name, _, xml = cii_spec(pdf)
            except Exception:
                continue
            if xml is None or not TAX.search(xml):
                continue
            probe = subprocess.run(["node", str(HERE / "repair-cli.mjs"), str(path), "-o", str(work / "probe.pdf")],
                                   capture_output=True, text=True)
            if not re.search(r"(^|\n)0 fixed", probe.stdout + probe.stderr):
                continue
            n = f"{len(names):04d}.pdf"
            shutil.copy(path, work / "orig" / n)
            names[n] = f"{Path(root).name}/{rel}"
    orig = verapdf(cmd, sorted((work / "orig").iterdir()))
    passing = [n for n in names if orig.get(str(work / "orig" / n), (False,))[0]]
    flavours = Counter(orig[str(work / "orig" / n)][2] for n in passing)
    print(f"candidates (CII, repair leaves alone): {len(names)}; veraPDF passes the original: {len(passing)} {dict(flavours)}")
    seeded_ok = []
    for n in passing:
        with pikepdf.open(work / "orig" / n) as pdf:
            _, spec, xml = cii_spec(pdf)
            m = TAX.search(xml)
            seeded = xml[: m.start(2)] + f"{float(m.group(2)) + 7:.2f}".encode() + xml[m.end(2):]
            stream = spec.obj["/EF"]["/F"]
            stream.write(seeded)
            if "/Params" in stream and "/Size" in stream["/Params"]:
                stream["/Params"]["/Size"] = len(seeded)
            pdf.save(work / "seeded" / n, object_stream_mode=pikepdf.ObjectStreamMode.preserve)
        run = subprocess.run(["node", str(HERE / "repair-cli.mjs"), str(work / "seeded" / n), "-o", str(work / "repaired" / n)],
                             capture_output=True, text=True)
        if (work / "repaired" / n).exists() and re.search(r"(^|\n)1 fixed", run.stdout + run.stderr):
            seeded_ok.append(n)
    seeded_v = verapdf(cmd, [work / "seeded" / n for n in seeded_ok])
    controls = [n for n in seeded_ok if seeded_v.get(str(work / "seeded" / n), (False,))[0]]
    print(f"seeded and repaired (1 fixed): {len(seeded_ok)}; seeded copy still passes veraPDF (control): {len(controls)}")
    rep = verapdf(cmd, [work / "repaired" / n for n in controls])
    good = [n for n in controls if rep.get(str(work / "repaired" / n), (False,))[0]]
    print(f"repaired copy passes veraPDF: {len(good)} of {len(controls)}")
    rules = Counter()
    for n in controls:
        r = rep.get(str(work / "repaired" / n))
        if r and not r[0]:
            rules.update(r[1])
            print(f"  FAIL {names[n]}: {', '.join(r[1])}")
    if rules:
        print("rules failed after repair:", dict(rules))
    print(f"work dir: {work}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit("usage: python3 eval/repair-verapdf-corpus.py <verapdf-command> <checkout> [...]")
    main(sys.argv[1], sys.argv[2:])
