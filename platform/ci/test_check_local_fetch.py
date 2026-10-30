import contextlib
import io
import tempfile
import unittest
from pathlib import Path

from check_local_fetch import ROOT, main, missing, scan


class LocalFetch(unittest.TestCase):
    def test_missing_relative_file_is_reported(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(missing('x\nfetch("./rates.json")', Path(d)), [(2, "./rates.json")])

    def test_existing_file_passes(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "rates.json").write_text("{}")
            self.assertEqual(missing("fetch('rates.json?v=2')", Path(d)), [])

    def test_routes_urls_and_templates_are_skipped(self):
        with tempfile.TemporaryDirectory() as d:
            src = "fetch('/v1/cases/') fetch('https://a.b/c.json') fetch(`./x/${id}.json`) fetch('api/run')"
            self.assertEqual(missing(src, Path(d)), [])

    def test_api_and_v1_paths_with_extension_are_skipped(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(missing("fetch('api/run.json') fetch('v1/x.json')", Path(d)), [])

    def test_clean_tree_exits_zero_and_root_has_ventures(self):
        self.assertTrue((ROOT / "ventures").is_dir())
        with tempfile.TemporaryDirectory() as d, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(main(["--root", d]), 0)

    def test_scan_and_exit_code(self):
        with tempfile.TemporaryDirectory() as d:
            v = Path(d) / "ventures" / "v"
            v.mkdir(parents=True)
            (v / "index.html").write_text("<script>fetch('./gone.json')</script>")
            self.assertEqual(len(scan(Path(d))), 1)
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(["--root", d]), 1)

    def test_repository_is_clean(self):
        self.assertEqual(scan(), [])


if __name__ == "__main__":
    unittest.main()
