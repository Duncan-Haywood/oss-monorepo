# Polish 2026-11-01: long post titles fail the front-matter check

**Weak surface.** The last seo-titles note said new posts keep arriving over the 70-character budget.

**Change.** `check_post_frontmatter.py` fails a title over 70 characters with no `seo_title`. Test added.

**Measured.** 0 existing posts violate it. `python3 -m unittest test_check_post_frontmatter` (in platform/ci): 18 pass. Rankings not measured.

**Next.** Fetch real Search Console data once it is set up (in the decision queue) to see whether the shorter titles changed anything.
