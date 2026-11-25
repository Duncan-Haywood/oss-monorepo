"""Tests for check_third_party.py: python3 -m unittest test_check_third_party (from platform/ci)."""
import json
import os
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check_third_party as ctp  # noqa: E402

OWNERS = ["Duncan Haywood", "Maris Stella Labs"]
MIT = "MIT License\n\nCopyright (c) {year} {holder}\n\nPermission is hereby granted, free of charge, to any person\n"


def kinds(rel, text):
    return [(s.kind, s.detail) for s in ctp.scan_file(rel, text, OWNERS)]


class ScanFile(unittest.TestCase):
    def test_owner_mit_licence_is_quiet(self):
        self.assertEqual(kinds("ventures/x/LICENSE", MIT.format(year=2026, holder="Duncan Haywood")), [])

    def test_owner_fsl_licence_is_quiet(self):
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "portfolio", "monetization"))
        from relicense_fsl import FSL_TEXT
        self.assertEqual(kinds("ventures/x/LICENSE", FSL_TEXT.format(year=2026, holder="Duncan Haywood")), [])
        got = kinds("vendor/LICENSE", FSL_TEXT.format(year=2024, holder="Functional Software, Inc."))
        self.assertEqual(got, [("licence file", "FSL-1.1-MIT; Functional Software, Inc")])

    def test_owner_fsl_spdx_is_quiet(self):
        self.assertEqual(kinds("a/b.rs", "// SPDX-License-Identifier: FSL-1.1-MIT\n"), [])

    def test_foreign_mit_licence_is_a_signal(self):
        got = kinds("vendor/LICENSE", MIT.format(year=2019, holder="Stef Busking"))
        self.assertEqual(got, [("licence file", "MIT; Stef Busking")])

    def test_apache_licence_without_copyright_is_a_signal(self):
        got = kinds("x/LICENSE-talon", "Apache License\nVersion 2.0, January 2004\n")
        self.assertEqual(got[0][0], "licence file")
        self.assertIn("not MIT", got[0][1])

    def test_licence_file_name_forms(self):
        for name in ("LICENSE", "license.txt", "LICENCE-NAV.md", "COPYING", "NOTICE",
                     "BLAKEJS-LICENSE", "fontoxpath.LICENSE.txt", "BSI-LICENSE.md"):
            self.assertTrue(ctp.LICENSE_NAME.match(name), name)
        for name in ("2026-11-17-against-the-irs-notice.md", "notice.mjs", "licence.mjs", "my-license-page.md"):
            ext = os.path.splitext(name)[1]
            self.assertFalse(ctp.LICENSE_NAME.match(name) and ext in ctp.LICENSE_EXT, name)

    def test_foreign_copyright_in_code(self):
        got = kinds("a/b.py", "# Copyright (c) 2024 Intelligent Robot Motion Lab\nx = 1\n")
        self.assertEqual(got, [("copyright", "Intelligent Robot Motion Lab")])

    def test_owner_copyright_in_code_is_quiet(self):
        self.assertEqual(kinds("a/b.mjs", "// Copyright 2026 Duncan Haywood\n"), [])

    def test_copyright_inside_a_string_literal_is_data(self):
        self.assertEqual(kinds("a/b.mjs", "const c = '© 2026 Test';\nconst d = \"Copyright 2012 Adobe\";\n"), [])

    def test_template_copyright_is_quiet(self):
        self.assertEqual(kinds("a/b.mjs", "out.push(`<p>© ${year} ${name}</p>`);\n"), [])

    def test_spdx_other_than_mit(self):
        self.assertEqual(kinds("a/b.rs", "// SPDX-License-Identifier: Apache-2.0\n"), [("spdx", "Apache-2.0")])
        self.assertEqual(kinds("a/b.rs", "// SPDX-License-Identifier: MIT\n"), [])

    def test_gpl_banner(self):
        got = kinds("a/b.c", "/* This program is distributed under the GNU General Public License */\n")
        self.assertEqual(got, [("banner", "GPL family")])

    def test_whole_file_prefilters_keep_every_line_signal(self):
        """scan_file skips a pattern the whole text lacks; each spelling still reaches its line."""
        cases = [
            ("// COPYRIGHT 2020 Acme Corp\n", [("copyright", "Acme Corp")]),
            ("// coPyRiGhT (c) 2019-2021 Acme\n", [("copyright", "Acme")]),
            ("// \u00a9 2018 Acme Ltd\n", [("copyright", "Acme Ltd")]),
            ("/* CC BY-NC 4.0 */\n", [("banner", "CC non-commercial")]),
            ("/* CC-BY-NC-SA */\n", [("banner", "CC non-commercial")]),
            ("/* Attribution-NonCommercial 4.0 */\n", [("banner", "CC non-commercial")]),
            ("/* BY-NC alone is no banner */\n", []),
            ("let a = 1;\n// Copyright 2020 Acme\n/* Mozilla Public License */\n",
             [("copyright", "Acme"), ("banner", "MPL-2.0")]),
        ]
        for text, want in cases:
            self.assertEqual(kinds("a/b.js", text), want, text)

    def test_prose_is_not_scanned_for_banners(self):
        self.assertEqual(kinds("docs/posts/x.md", "the GNU General Public License says\n"), [])

    def test_minified_code_is_a_bundle(self):
        line = "var a=function(b){return b?this.c:new d};" * 200
        self.assertEqual(kinds("x/lib.min.js", line + "\n")[0][0], "bundle")

    def test_long_data_line_is_not_a_bundle(self):
        nums = "export const X=[" + ",".join(str(i * 0.37) for i in range(3000)) + "];"
        self.assertEqual(kinds("x/example-data.mjs", nums + "\n"), [])
        b64 = 'export const W="' + "QUJD" * 3000 + '";'
        self.assertEqual(kinds("x/wasm.mjs", b64 + "\n"), [])


def git_tree(files):
    d = tempfile.mkdtemp()
    for rel, text in files.items():
        p = os.path.join(d, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8") as fh:
            fh.write(text)
    subprocess.run(["git", "init", "-q", d], check=True)
    subprocess.run(["git", "-C", d, "add", "-A"], check=True)
    return d


class Check(unittest.TestCase):
    def setUp(self):
        self.root = git_tree({
            "LICENSE": MIT.format(year=2026, holder="Duncan Haywood"),
            "vendor/lib.mjs": "// Copyright (c) 2019 Someone Else\nexport const x = 1;\n",
            "vendor/LICENSE-lib": MIT.format(year=2019, holder="Someone Else"),
        })
        self.files = ctp.tracked_files(self.root)
        self.entry = {"name": "lib", "paths": ["vendor/*"], "license": "MIT",
                      "source": "https://example.org/lib", "notice": "vendor/LICENSE-lib"}

    def inv(self, entries=(), ignore=()):
        return {"owner_holders": OWNERS, "entries": list(entries), "not_third_party": list(ignore)}

    def test_unrecorded_signals_fail(self):
        problems, pairs = ctp.check(self.root, self.files, self.inv())
        self.assertEqual(len(pairs), 2)
        self.assertEqual(len(problems), 2)
        self.assertTrue(all("not in platform/ci/third_party.json" in p for p in problems))

    def test_recorded_signals_pass(self):
        problems, _ = ctp.check(self.root, self.files, self.inv([self.entry]))
        self.assertEqual(problems, [])

    def test_stale_glob_fails(self):
        e = dict(self.entry, paths=["vendor/*", "gone/*"])
        problems, _ = ctp.check(self.root, self.files, self.inv([e]))
        self.assertEqual(len(problems), 1)
        self.assertIn("stale", problems[0])

    def test_missing_notice_fails(self):
        e = dict(self.entry, notice="vendor/NOPE")
        problems, _ = ctp.check(self.root, self.files, self.inv([e]))
        self.assertIn("not tracked", problems[0])

    def test_copyleft_needs_a_reason(self):
        e = dict(self.entry, license="GPL-3.0-only")
        problems, _ = ctp.check(self.root, self.files, self.inv([e]))
        self.assertTrue(any("copyleft_ok" in p for p in problems))
        e["copyleft_ok"] = "a reason"
        problems, _ = ctp.check(self.root, self.files, self.inv([e]))
        self.assertEqual(problems, [])

    def test_weak_copyleft_and_nc_need_a_reason_too(self):
        for lic in ("MPL-2.0", "LGPL-3.0-or-later OR MIT", "CC-BY-NC-4.0", "EUPL-1.2"):
            e = dict(self.entry, license=lic)
            problems, _ = ctp.check(self.root, self.files, self.inv([e]))
            self.assertTrue(any("copyleft_ok" in p for p in problems), lic)

    def test_permissive_needs_no_reason(self):
        for lic in ("Apache-2.0", "BSD-3-Clause", "CC-BY-4.0", "Unlicense", "ISC"):
            e = dict(self.entry, license=lic)
            problems, _ = ctp.check(self.root, self.files, self.inv([e]))
            self.assertEqual(problems, [], lic)

    def test_not_third_party_needs_why(self):
        ign = {"name": "x", "paths": ["vendor/*"]}
        problems, _ = ctp.check(self.root, self.files, self.inv(ignore=[ign]))
        self.assertEqual(problems, ["not_third_party 'x': give a `why`"])

    def test_main_writes_and_checks_markdown(self):
        inv = os.path.join(self.root, "inv.json")
        with open(inv, "w") as fh:
            json.dump(self.inv([self.entry]), fh)
        subprocess.run(["git", "-C", self.root, "add", "inv.json"], check=True)
        args = ["--root", self.root, "--inventory", inv]
        self.assertEqual(ctp.main(args), 1)  # THIRD_PARTY.md missing
        self.assertEqual(ctp.main(args + ["--write-md"]), 0)
        with open(os.path.join(self.root, "THIRD_PARTY.md")) as fh:
            md = fh.read()
        self.assertIn("| lib | MIT | `vendor/*` |", md)
        self.assertEqual(ctp.main(args), 0)


class Repository(unittest.TestCase):
    def test_repository_is_clean(self):
        """The real tree: every signal recorded, no stale entry, THIRD_PARTY.md current."""
        self.assertEqual(ctp.main([]), 0)


if __name__ == "__main__":
    unittest.main()
