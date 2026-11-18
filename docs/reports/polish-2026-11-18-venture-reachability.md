---
kind: polish
topics: [seo]
date: 2026-11-18
---
# Polish: every venture page reachable from its own index, and a check for it

Date: 2026-11-18. Track: polish/0. Picked items 1 and 2 of "Still weakest" in
`polish-2026-11-18-framing-more-tools.md` (shed-designer and changepoint-detector buyer pages
unlinked from their index; a platform check for in-venture reachability). No open PR touched
them (#17388 edits changepoint-detector but not its `index.html`).

## Changed

- Links added from each index: changepoint-detector (`change-report-for-analysts.html`, whose page
  links the three samples), shed-designer (branded plan pack + sample), einvoice-preflight (audit
  pack + sample), shift-roster-builder (staff schedule pack, which links its sample),
  babysitting-business-kit (`self-host.html`; the footer's "self-hosting guide" pointed at GitHub).
- `platform/pages/venture-reachability.mjs`: breadth-first walk over relative links from each
  `ventures/*/index.html` (skips `node_modules`, `test(s)`, `fixtures`, `dist`), `ALLOW` with a
  reason per page, CLI exits 1 on an orphan. `venture-reachability.test.mjs`: link resolution on a
  fixture, the allowlist is live (the page exists and is still unlinked), and the scan of `ventures/` is empty.
  `portfolio-pages.yml` runs `*.test.mjs` on every `ventures/**` PR, so it gates new orphans.

## Measured

Pages unreachable from their own index and not exempt: 11 on main → 0 (CLI run before and after).
Exempt pages: 3 (babysitting `admin.html`, error-keeper `dashboard.html`, shed-designer
`hoa-packet.html`). Scan time over 1,385 ventures and about 4,000 pages: 0.3 s.

## Still weakest, and what I would do next

1. **Reachability isn't prominence.** Most of the new links sit in footers. A buyer page could
   instead appear next to the result it sells: for example, a "Print this as a report" link beside
   the change-point result. That's a product call for each venture.
2. **Other ventures with pasted "related" blocks** may have drifted the way framing's had
   (carried over: einvoice-preflight, 105 pages, is the likeliest). `more-tools.mjs` in
   wall-framing-takeoff is the pattern to copy.
3. **The walk ignores links built by JS** (e.g. `window.open` in shed-designer's `app.mjs`). That's
   right for crawlers, but an exempt page can also go dead without the check noticing.
