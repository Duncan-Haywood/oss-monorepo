---
title: "One page in 3,576 was missing its no-warranty clause"
date: 2026-11-08
tags: [quality, compliance, clothing-design-studio]
description: "A sweep with the repository's own clause checker found one published page, the fabric shrinkage calculator, with no no-warranty footer. Fixed, and the checker passes."
---

`node platform/pages/clauses.mjs` checks that every page the site would publish carries the no-warranty clause the product playbook requires (section 5b). Run over the whole tree on 2026-11-08, it reported exactly one miss: `ventures/clothing-design-studio/shrink.html`, the fabric shrinkage allowance calculator added in #13978. The page had a one-line "Not QC or legal advice" note but no footer, so it had no no-warranty paragraph, no liability limit and no licence line.

The fix is a footer on that page: free and as-is, not legal, tax, financial, manufacturing or quality-control advice, verify before relying on it (with a pointer to cutting and washing a test piece), no liability, and the MIT licence link. After the change the checker reports "3575 published page(s) across 1331 surface(s) carry their required clauses".

Why it slipped through: the checker is scoped to what a venture PR touches, and that PR added a new sub-page to an existing venture rather than a new venture directory. Worth checking next whether the scoping should include new `*.html` files in an existing venture.
