"""Tree checks skip `.next/`, the build output `npm run build` leaves in a Next venture.

`.next/` is gitignored, so CI never sees it, but a session that runs a Next
venture's `npm run verify` (which builds) and then `venture-preflight.mjs` or
`main_health.py` does. Before 2026-11-13 most checks skipped `node_modules` but
not `.next`, and two run records that week met a preflight that failed on
Next's own bundle (percent-float.test.mjs, inherited_keys.py). Probed with a
real `next build` of ventures/vendor-watch: 38 checks and one site test read
inside `.next`; check_markup_basics.py failed on
`.next/server/app/_global-error.html: no <html lang>`, and
check_duplicate_meta.py reported Next's three prerendered copies of the
venture's description as shared.

Each check below gets a page with known defects twice: under `site/`, where it
must fail (so the test proves the check looked), and under `.next/server/app/`,
where it must pass.
"""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent

# A page that trips every check listed in CHECKS.
BAD = (
    '<!doctype html><html><head><title>x</title></head><body>'
    '<div id="d"></div><div id="d"></div><img src="missing.png">'
    '<a href="#nope">j</a><a target="_blank" href="http://x.example/">y</a>'
    '<button></button><script>document.getElementById("gone")</script>'
    '<p>{{placeholder}}</p></body></html>'
)

# Checks that take --root (the repository root) and walk ventures/ for pages.
CHECKS = [
    "check_blank_targets.py",
    "check_dom_ids.py",
    "check_duplicate_ids.py",
    "check_empty_controls.py",
    "check_fragment_links.py",
    "check_inpage_refs.py",
    "check_js_dom_refs.py",
    "check_local_assets.py",
    "check_markup_basics.py",
    "check_page_anchors.py",
    "check_thin_pages.py",
    "check_unrendered_placeholders.py",
]


def run_check(check, where):
    with tempfile.TemporaryDirectory() as d:
        page = Path(d) / "ventures" / "demo" / where / "index.html"
        page.parent.mkdir(parents=True)
        page.write_text(BAD, encoding="utf-8")
        return subprocess.run(
            [sys.executable, str(HERE / check), "--root", d],
            capture_output=True, text=True, timeout=120,
        )


class BuildOutputSkipped(unittest.TestCase):

    def test_each_check_reads_pages_but_not_next_build_output(self):
        for check in CHECKS:
            with self.subTest(check=check):
                seen = run_check(check, "site")
                self.assertNotEqual(seen.returncode, 0,
                                    f"{check} passed a broken page; the test cannot tell it skips .next")
                built = run_check(check, ".next/server/app")
                self.assertEqual(built.returncode, 0,
                                 f"{check} read gitignored .next build output:\n{built.stdout}{built.stderr}")


if __name__ == "__main__":
    unittest.main()
