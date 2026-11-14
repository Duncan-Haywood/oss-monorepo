"""Seeded-fault check of the Factur-X PDF repair on real PDFs, read by qpdf.

For every Factur-X / ZUGFeRD PDF under the given folders (public test suites,
read from a checkout, never copied here) whose embedded CII the repair leaves
alone, this:

1. plants one fault in the embedded XML: the document tax total (BT-110,
   TaxTotalAmount) pushed up by 7.00, the error a hand edit or a broken export
   makes;
2. writes the seeded PDF with qpdf (through pikepdf), twice: once with object
   streams and a cross-reference stream, once with a classic xref table, so the
   repair's incremental update is tried on both layouts written by a reader
   that is not ours;
3. runs `node repair-cli.mjs seeded.pdf -o repaired.pdf`;
4. opens the repaired PDF with qpdf (pikepdf), runs its structural check, reads
   the attachment back through qpdf's own name-tree walk and compares it with
   the original XML (after formatting the one restored field to two decimals,
   the repair's own format), and checks the page count did not change.

    python3 -m pip install pikepdf    # qpdf bindings
    python3 eval/repair-seeded-facturx.py <checkout> [<checkout> ...]

Folders named fail/invalid are skipped: their XML is wrong on purpose.
"""
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import pikepdf

HERE = Path(__file__).resolve().parent.parent
TAX = re.compile(rb"(<(?:[\w.-]+:)?TaxTotalAmount\b[^>]*>)\s*(-?[\d.]+)\s*(</)")
SKIP = re.compile(r"(^|/)(fail|invalid|negative|error)s?(/|_)", re.I)


def cii_attachment(pdf):
    for name, spec in pdf.attachments.items():
        data = spec.get_file().read_bytes()
        if b"CrossIndustryInvoice" in data[:20000]:
            return name, data
    return None, None


def main(roots):
    tally = dict(pdfs=0, cii=0, seeded=0, untouched_before=0, runs=0, repaired=0,
                 qpdf_ok=0, xml_restored=0, declined=0, declined_why={}, pages_kept=0, problems=[])
    work = Path(tempfile.mkdtemp())
    for root in roots:
        for path in sorted(Path(root).rglob("*.pdf")):
            rel = str(path.relative_to(root))
            if SKIP.search(rel) or re.match(r"(invalid|not_validating)", path.name, re.I):
                continue
            tally["pdfs"] += 1
            try:
                src = pikepdf.open(path)
            except Exception:
                continue
            name, xml = cii_attachment(src)
            if xml is None:
                continue
            tally["cii"] += 1
            # Only PDFs the repair leaves alone: then the restored file must equal the original.
            probe = subprocess.run(["node", str(HERE / "repair-cli.mjs"), str(path), "-o", str(work / "probe.pdf")],
                                   capture_output=True, text=True)
            if not re.search(r"(^|\n)0 fixed", probe.stdout + probe.stderr):
                continue
            m = TAX.search(xml)
            if not m:
                continue
            tally["untouched_before"] += 1
            original = m.group(2).decode()
            seeded_value = f"{float(original) + 7:.2f}".encode()
            seeded_xml = xml[: m.start(2)] + seeded_value + xml[m.end(2):]
            expected = xml[: m.start(2)] + f"{float(original):.2f}".encode() + xml[m.end(2):]
            pages = len(src.pages)
            spec = src.attachments[name]
            for layout in ("objstreams", "table"):
                seeded = pikepdf.open(path)
                f = seeded.attachments[name]
                new = pikepdf.AttachedFileSpec(seeded, seeded_xml, filename=f.filename,
                                               mime_type=f.get_file().mime_type or "text/xml")
                seeded.attachments[name] = new
                out = work / f"seeded-{layout}.pdf"
                seeded.save(out, object_stream_mode=(pikepdf.ObjectStreamMode.generate if layout == "objstreams"
                                                     else pikepdf.ObjectStreamMode.disable))
                tally["seeded"] += 1
                fixed = work / f"fixed-{layout}.pdf"
                if fixed.exists():
                    fixed.unlink()
                run = subprocess.run(["node", str(HERE / "repair-cli.mjs"), str(out), "-o", str(fixed)],
                                     capture_output=True, text=True)
                tally["runs"] += 1
                if not fixed.exists():
                    tally["problems"].append(f"{rel} [{layout}]: no repaired PDF: {(run.stdout + run.stderr)[:160]}")
                    continue
                tally["repaired"] += 1
                try:
                    back = pikepdf.open(fixed)
                    issues = back.check_pdf_syntax() if hasattr(back, "check_pdf_syntax") else back.check()
                    if issues:
                        tally["problems"].append(f"{rel} [{layout}]: qpdf check: {issues[:2]}")
                    else:
                        tally["qpdf_ok"] += 1
                    _, got = cii_attachment(back)
                    if got == expected:
                        tally["xml_restored"] += 1
                    elif got == seeded_xml:
                        # The repair declined (sub-invoice lines, header allowances, ...) and said why.
                        why = re.findall(r"skipped\s+(.*)", run.stdout + run.stderr)
                        tally["declined"] += 1
                        tally["declined_why"][why[-1][:90] if why else "?"] = tally["declined_why"].get(why[-1][:90] if why else "?", 0) + 1
                    else:
                        tally["problems"].append(f"{rel} [{layout}]: attachment read by qpdf is neither the original nor the seeded file")
                    if len(back.pages) == pages:
                        tally["pages_kept"] += 1
                except Exception as e:  # a PDF qpdf cannot open
                    tally["problems"].append(f"{rel} [{layout}]: qpdf cannot open: {str(e)[:120]}")
    for p in tally.pop("problems"):
        print(p)
    print(tally)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: python3 eval/repair-seeded-facturx.py <checkout> [...]")
    main(sys.argv[1:])
