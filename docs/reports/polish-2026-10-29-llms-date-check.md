# Polish 2026-10-29: check that built llms.txt files state a date (AEO)

**Why.** The two earlier runs today stamped a git date on every generated and hand-written product `llms.txt`.
Nothing stopped a later change (a new copy path, a changed regex) from quietly shipping undated files again.

**Change.** `llmsTxtMissingDate` in `platform/pages/check.mjs` lists products whose built `/<slug>/llms.txt`
contains no ISO date; `checkSite` reports each as a problem. It stays silent when no file at all is dated,
which is a build without git history, not a defect. Test: `platform/pages/product-llms.test.mjs`.

**Measured.** `product-llms.test.mjs` 4 pass, `check.test.mjs` 99 pass. The full site build (7 to 20 minutes) was not
run here, so the check has not seen the real artifact; if CI's check run flags files, the lists name them.
No citation or traffic effect measured.

**Next.** wall-framing-takeoff and changepoint-detector `llms.txt` list no sub-pages beyond the placeholder origin;
Lighthouse still not run on any page.
