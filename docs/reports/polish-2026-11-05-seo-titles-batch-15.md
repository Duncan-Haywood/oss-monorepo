---
kind: polish
topics: [seo]
date: 2026-11-05
tagged: auto
---
# Polish 2026-11-05: `seo_title:` batch 15, main's writing test green again

**Weak surface.** `writing.test.mjs` ("no committed post is over the title budget without a seo_title") was red on main: eight 2026-11-05 posts had headlines over 70 characters.

**Change.** `propose_seo_titles.py --apply` wrote six clean cuts; two with no clean cut got hand-written titles (flooring budget, Czech VAT bill). `h1` and structured data keep the full headline.

**Measured.** `node --test platform/pages/writing.test.mjs`: 26 of 27 pass before, 27 of 27 after. Full build not run. Rankings not measured.

**Next.** This is the third batch in a week; new posts keep landing over budget. Have the post-writing step (or a pre-merge hook) run `propose_seo_titles.py --apply` so no run has to.
