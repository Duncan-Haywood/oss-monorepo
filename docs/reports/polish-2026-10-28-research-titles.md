# Polish 2026-10-28: research page titles clipped for search results

**Weak surface.** A scan of every built page (3,439 `index.html`, `node platform/pages/build.mjs`) for
title, description, h1, canonical and image attributes found one large class: 910 research project
pages used the project's whole question as `<title>` (median 74 characters over all pages, maximum 246,
e.g. `research/free-buckreal`). Result pages show about 60 characters, so the part that tells a
searcher what the page is got cut, and the `| Open research` suffix was pushed out entirely.

**Fix.** `research/_homepage/build.py` `title_tag()` clips the `<title>` (not the h1, `og:title` or
JSON-LD) to 48 characters at a word boundary with an ellipsis. Ten pairs of sibling projects clip to
identical text, so `clipped_title_taken()` appends ` (research/<slug>)` to both, as the existing
`shared_title` rule does for identical full titles. Template: `research/_homepage/project.html`.

**Check that keeps it fixed.** `platform/pages/page-identity.mjs` now fails a build whose `<title>`
(entities counted as one character) exceeds `MAX_TITLE_LENGTH` = 130; test in `page-identity.test.mjs`.

**Measured** (before -> after, same scan): titles over 65 characters 2,355 -> 1,412; longest title
246 -> 124 (a blog post); duplicate titles 0 -> 0. Not measured: rankings or traffic.

**Still weakest / next.**
- 1,412 titles are still over 65 characters: tool pages (`Name — long subtitle (2026)`, up to 101),
  blog posts (up to 124) and `/compare/` pages (up to 121). Clip or reword to the ~60-character
  budget, query words first.
- Scan findings left alone: `social-preview-check` has 4 `<img>` without alt and 8 without lazy;
  `page-seo-audit` has 3 h1 and three tool pages 2 h1 (probably tool-rendered; `check.mjs` counts
  markup outside scripts and passes, so confirm in a browser); `/lab/` pages lack a canonical and have
  descriptions over 170 characters.
- `node platform/pages/check.mjs` on a local build reported 3 problems in `writing/` (a dead link to
  `ventures/einvoice-preflight/luxembourg-e-invoice-mandate.html` and two `example.invalid` mentions
  in a post about that very check); not touched by this change.
