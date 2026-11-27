"""Red team 2026-11-27: a "latin1" TextDecoder is not a byte-exact decoder.

The WHATWG Encoding standard maps the labels latin1, iso-8859-1 and ascii to
windows-1252, so bytes 0x80-0x9F decode to U+20AC, U+2019 and so on. Code that
decodes bytes that way and then reads byte values back with charCodeAt or
codePointAt gets the wrong value for those 32 bytes. That is how
ventures/ai-bookkeeper/pdftext.mjs printed "€’y" for a bank statement's "Pay":
the 128th-159th glyphs of a subset font missed its ToUnicode map.

The shared pdf-parser.mjs avoided it on purpose (its comment says so); this
check keeps the next copy out. Offsets and lengths survive the decode, so a file
that only searches the text is fine: mark it with `byte-decoder-ok: <reason>`
if it must also call charCodeAt. Use String.fromCharCode over byte chunks for
a byte-exact string, or new TextDecoder("windows-1252") where WinAnsi is meant.
"""
import pathlib
import re
import subprocess
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
LATIN1 = re.compile(r"""new\s+TextDecoder\(\s*['"](?:latin1|latin-1|iso-8859-1|iso8859-1|iso_8859-1|l1|ascii|us-ascii)['"]""", re.I)
READS_BYTES = re.compile(r"\.(?:charCodeAt|codePointAt)\(")
SKIP = re.compile(r"(\.test\.m?js|\.min\.js)$|/node_modules/|/vendor/")


def offenders(paths):
    hits = []
    for rel in paths:
        if SKIP.search(rel):
            continue
        try:
            text = (ROOT / rel).read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        if LATIN1.search(text) and READS_BYTES.search(text) and "byte-decoder-ok:" not in text:
            hits.append(rel)
    return hits


class NoCp1252ByteReads(unittest.TestCase):
    def test_tree(self):
        files = subprocess.run(["git", "ls-files", "--", "ventures/*.mjs", "ventures/*.js", "platform/*.mjs",
                                "platform/*.js"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split()
        self.assertGreater(len(files), 100)
        self.assertEqual(offenders(files), [], __doc__.split("\n\n")[0])

    def test_rejects_the_pattern_it_exists_for(self):
        tmp = ROOT / "platform/ci/.cp1252-probe.mjs"
        try:
            tmp.write_text('const d = new TextDecoder("latin1");\nexport const c = (b) => d.decode(b).charCodeAt(0);\n')
            self.assertEqual(offenders(["platform/ci/.cp1252-probe.mjs"]), ["platform/ci/.cp1252-probe.mjs"])
            tmp.write_text('// not TextDecoder("latin1")\nexport const c = (s) => s.charCodeAt(0);\n')
            self.assertEqual(offenders(["platform/ci/.cp1252-probe.mjs"]), [])
        finally:
            tmp.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
