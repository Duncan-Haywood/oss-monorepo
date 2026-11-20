import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import pick_track
import texenv


class ScanTest(unittest.TestCase):
    def test_tex_source(self):
        c, p, svg, pandoc = texenv.scan(r"\documentclass[conference]{IEEEtran}" "\n"
                                        r"\usepackage{amsmath, booktabs}\usepackage[hidelinks]{hyperref}")
        self.assertEqual(c, {"IEEEtran"})
        self.assertEqual(p, {"amsmath", "booktabs", "hyperref"})
        self.assertFalse(svg or pandoc)

    def test_python_generator_strings(self):
        # build_latex.py-style sources: escaped backslashes, f-string doubled braces
        src = ('HEAD = "\\\\documentclass[preprint]{elsarticle}\\n\\\\usepackage{xurl}"\n'
               'f"\\\\usepackage{{fvextra}}"\nsubprocess.run(["rsvg-convert", x])\n'
               'run(["pandoc", "-o", "main.tex"])')
        c, p, svg, pandoc = texenv.scan(src)
        self.assertEqual(c, {"elsarticle"})
        self.assertEqual(p, {"xurl", "fvextra"})
        self.assertTrue(svg and pandoc)

    def test_placeholders_skipped(self):
        c, p, *_ = texenv.scan(r"\usepackage{#1}\usepackage{%s}\documentclass{}")
        self.assertEqual((c, p), (set(), set()))

    def test_scan_paths_skips_hidden_and_other_suffixes(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "main.tex").write_text(r"\documentclass{acmart}")
            (Path(d) / ".cache").mkdir()
            (Path(d) / ".cache" / "x.tex").write_text(r"\usepackage{hidden}")
            (Path(d) / "fig.svg").write_text(r"\usepackage{notsource}")
            c, p, *_ = texenv.scan_paths([d])
        self.assertEqual((c, p), ({"acmart"}, set()))

    def test_wanted_adds_svg_and_pandoc(self):
        self.assertEqual(texenv.wanted(False, False), texenv.FULL)
        self.assertIn("texlive-publishers", texenv.FULL)  # IEEEtran, elsarticle, acmart
        self.assertIn("texlive-latex-extra", texenv.FULL)  # fvextra, xurl
        self.assertEqual(texenv.wanted(True, True)[-2:], ["librsvg2-bin", "pandoc"])


class InstallTest(unittest.TestCase):
    def test_update_then_install_with_lock_wait(self):
        calls = []
        def run(cmd, **kw):
            calls.append(cmd)
            return subprocess.CompletedProcess(cmd, 0)
        self.assertEqual(texenv.install(["a", "b"], run=run), 0)
        self.assertEqual(len(calls), 2)
        self.assertIn("update", calls[0])
        self.assertEqual(calls[1][-2:], ["a", "b"])
        for c in calls:
            self.assertIn("DPkg::Lock::Timeout=600", c)

    def test_failed_update_stops(self):
        calls = []
        def run(cmd, **kw):
            calls.append(cmd)
            return subprocess.CompletedProcess(cmd, 100)
        self.assertEqual(texenv.install(["a"], run=run), 100)
        self.assertEqual(len(calls), 1)

    def test_missing_files_without_kpsewhich_names_all(self):
        with mock.patch.object(texenv.shutil, "which", return_value=None):
            self.assertEqual(texenv.missing_files({"IEEEtran"}, {"url"}), ["IEEEtran.cls", "url.sty"])

    def test_missing_files_reads_kpsewhich(self):
        def run(cmd, **kw):
            return subprocess.CompletedProcess(cmd, 1, stdout="/usr/share/texmf/tex/latex/url/url.sty\n")
        with mock.patch.object(texenv.shutil, "which", return_value="/usr/bin/kpsewhich"):
            self.assertEqual(texenv.missing_files({"IEEEtran"}, {"url"}, run=run), ["IEEEtran.cls"])

    def test_hint_names_package(self):
        self.assertIn("texlive-science", texenv.hint("siunitx.sty"))
        self.assertIn("apt-cache search", texenv.hint("odd.sty"))


class PickTrackTexLineTest(unittest.TestCase):
    def test_cue_for_latex_paper_without_pdflatex(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "p" / "paper").mkdir(parents=True)
            (Path(d) / "p" / "paper" / "main.tex").write_text(r"\documentclass{IEEEtran}")
            (Path(d) / "q" / "paper").mkdir(parents=True)
            (Path(d) / "q" / "paper" / "draft.md").write_text("# no latex")
            with mock.patch.object(pick_track, "RESEARCH", Path(d)):
                line = pick_track.tex_line("p", which=lambda _: None)
                self.assertIn("texenv.py research/p/paper", line)
                self.assertIsNone(pick_track.tex_line("p", which=lambda _: "/usr/bin/pdflatex"))
                self.assertIsNone(pick_track.tex_line("q", which=lambda _: None))
                self.assertIsNone(pick_track.tex_line("none", which=lambda _: None))


if __name__ == "__main__":
    unittest.main()
