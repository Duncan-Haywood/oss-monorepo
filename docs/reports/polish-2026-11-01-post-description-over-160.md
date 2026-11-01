# Polish 2026-11-01: a post description over the 160-character build limit

**Weak surface.** `platform/pages/writing.mjs` throws when a post `description` is over 160 characters, so one over-long description stops the whole site deploy. A scan of all 1,707 posts found one: `2026-11-01-dominican-republic-costa-rica-kazakhstan-e-invoicing.md` at 183.

**Change.** Shortened it to 160 or fewer, keeping the facts (64 countries, two Dominican Republic deadlines, Costa Rica 4.4, Kazakhstan VAT control).

**Also checked.** No duplicate titles or descriptions, no missing descriptions, no `seo_title`-less posts over 70 characters (`propose_seo_titles.py`: 0 left). `missing_llms_txt.py` exits 0.

**Measured.** Python scan of front matter only; full build not run. Rankings not measured.

**Next.** Nothing outstanding in post metadata. Heavier polish work (visual pass on a flagship page at phone width) needs a full build, 7 to 20 minutes.
