"""P047: platform code must not build URLs on the retired /monorepo-projects/ Pages path."""
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
DEAD = "github.io/monorepo-projects"
# Deliberate mentions: the legacy constant that rewrites old content, and tests of it.
ALLOWED = {"platform/pages/build.mjs", "platform/ci/test_no_dead_pages_base.py",
           "platform/ci/test_research_live_links.py",  # asserts an old-base line is rewritten
           "platform/pages/readme-live-link.test.mjs"}  # an old-base link still counts as present


class NoDeadPagesBase(unittest.TestCase):
    def test_platform_does_not_name_the_dead_path(self):
        hits = []
        for p in (ROOT / "platform").rglob("*"):
            if not p.is_file() or "node_modules" in p.parts or p.suffix in {".png", ".jpg", ".woff2", ".ico"}:
                continue
            rel = p.relative_to(ROOT).as_posix()
            if rel in ALLOWED:
                continue
            try:
                text = p.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            if DEAD in text.replace("github\\.io\\/monorepo-projects", DEAD):
                hits.append(rel)
        self.assertEqual(hits, [], "dead Pages base; use https://duncan-haywood.github.io/oss-monorepo/")

    def test_venture_front_doors_do_not_name_the_dead_path(self):
        """The README "Live tool" line and VENTURE.yaml `production:` are what readers and tools follow;
        the build rewrites old links in served pages, but GitHub's README view does not."""
        hits = []
        for v in sorted((ROOT / "ventures").iterdir()):
            for name, marker in (("README.md", "**Live tool:**"), ("VENTURE.yaml", "production:")):
                f = v / name
                if f.is_file() and any(marker in ln and DEAD in ln for ln in f.read_text(encoding="utf-8").splitlines()):
                    hits.append(f.relative_to(ROOT).as_posix())
        self.assertEqual(hits, [], "dead Pages base in a venture front door; use https://duncan-haywood.github.io/oss-monorepo/<slug>/")

    def test_venture_code_and_docs_do_not_name_the_dead_path(self):
        """The build rewrites the dead path in served pages, but not in what ships
        outside them: CLI user-agents, SARIF helpUri links shown in code scanning,
        footers a self-hosted server emails, READMEs, sitemaps. Red team found about 190
        such files on 2026-10-24 and fixed them 2026-11-03; this keeps them fixed.
        Test files may name it, and so may subpath-robots-check: its worked
        example needs a site served from a subpath, and this is one."""
        hits = []
        for p in sorted((ROOT / "ventures").rglob("*")):
            if (not p.is_file() or "node_modules" in p.parts or ".test." in p.name
                    or "subpath-robots-check" in p.parts
                    or p.name.startswith("test_") or p.suffix in {".png", ".jpg", ".woff2", ".ico", ".pdf"}):
                continue
            try:
                text = p.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            if DEAD in text:
                hits.append(p.relative_to(ROOT).as_posix())
        self.assertEqual(hits, [], "dead Pages base in a venture; use https://marisstella.app/<slug>/")


if __name__ == "__main__":
    unittest.main()
