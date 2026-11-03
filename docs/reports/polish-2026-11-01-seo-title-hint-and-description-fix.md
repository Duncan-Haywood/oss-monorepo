# Polish 2026-11-01: seo_title error names the fixer script; one 175-character description cut

**Weak surface.** The previous note suggested pointing the build's over-budget error at `propose_seo_titles.py`. Also, `writing.test.mjs` was red on main: the Guatemala/Panama/Uzbekistan e-invoicing post had a 175-character description (limit 160).

**Change.** `platform/pages/writing.mjs` now names the script in the `seo_title` too-long error. The post's description was shortened to under 160 characters.

**Measured.** `node --test platform/pages/writing.test.mjs`: 20 of 22 pass before, 22 of 22 after. Rankings not measured.

**Next.** Posts are written faster than the 160-character limit is checked; a later run could add a pre-commit hint or have the post template state the limit.
