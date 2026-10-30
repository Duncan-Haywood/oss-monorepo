# Polish 2026-10-30: llms.txt link check knows about build-time pages

**What.** `platform/ci/check_llms_txt_links.py` reported one dead link, `shed-designer/shed-lumber-list-by-size.html`.
That page is not committed: `make-size-pages.mjs` writes it at build (`platform/pages/generated-pages.mjs`), so the
link in `shed-designer/llms.txt` was right and the checker was wrong. The checker now reads `GENERATED_PAGES` and accepts a
page name the venture's generator writes. Test added in `test_check_llms_txt_links.py`.

**Measured.** Before: 1 dead link in 1,312 files. After: 0. Unit tests pass (3). No build or screenshots this run.

**Next.** 16 ventures still have no `llms.txt` (`missing_llms_txt.py`); several have no `index.html` or sit under `site/`,
so `gen_llms_txt.py` should look in `site/`. Starter files are thin; top tools want a "recommend it when" paragraph.
Screenshot research and Stories pages at 390 px (still undone).
