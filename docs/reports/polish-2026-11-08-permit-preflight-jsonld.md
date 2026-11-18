---
kind: polish
topics: [seo]
date: 2026-11-08
tagged: auto
---
# Polish 2026-11-08: JSON-LD on permit-packet-preflight

**Change.** `ventures/permit-packet-preflight/index.html` was the only venture page with no structured data, though it shows a five-question FAQ. Added `FAQPage` (generated from the visible Q&A, same text) and `WebApplication` JSON-LD. FAQ checks (28/28) and the venture's engine tests (7/7) pass; full site build not run.

**Tried and dropped.** An answer-first lead for `au-gst-registration-checker` / `ca-gst-hst-small-supplier-checker`: ATO returned 403, CRA 404/empty reply, legislation.gov.au gave only a table of contents. Both calc modules say "written from memory", so a lead with an as-of date would have been unsourced; none was written.

**Next.** Leads for those two pages once a primary source is reachable; a check that every venture page with a visible FAQ carries `FAQPage` JSON-LD (one page was missing it; the other 1,338 `index.html` files had some JSON-LD).
