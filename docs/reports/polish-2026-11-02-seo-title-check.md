# Polish 2026-11-02: a test for the `seo_title:` gap

**Weak surface.** Batches 1 to 14 of `seo_title:` were each found by hand-running `propose_seo_titles.py`; new daily posts kept re-opening the gap.

**Change.** `propose_seo_titles.py --check` exits 1 when any post is over the 70-character budget with no `seo_title:`. `writing.test.mjs` runs it, so the next over-long headline fails the test suite instead of waiting for a polish run.

**Measured.** `node --test platform/pages/writing.test.mjs`: 27 pass (26 before plus the new one). Check exits 0 on the current tree. Full site build not run; rankings not measured.

**Next.** Answer-first leads beyond the pilot (`platform/pages/answer-lead.test.mjs`).
