---
kind: polish
topics: [seo]
date: 2026-11-10
tagged: auto
---
# Polish 2026-11-10: two posts on main broke the site build

**Found.** `node platform/pages/build.mjs` on main (b10a9efe) threw in `writing.mjs`: the Senegal/Ghana/El Salvador post's description was 166 characters (limit 160). `check_post_frontmatter.py` also flagged the Singapore UEN post's `seo_title` at 78 characters (limit 70). Both landed on 2026-11-10 in einvoice-preflight PRs; a failing build means the portfolio-pages deploy does not publish.

**Fixed.** Shortened both fields; `check_post_frontmatter.py` exits 0. Rebuild passed the post loader (it got through the writing pages). Full `check.mjs` not run.

**Attempted and dropped.** An answer-first lead for `au-gst-registration-checker`: ato.gov.au and austlii return 403 through the proxy, and the A$75,000 figure lives in the GST regulations, not the Act text I could fetch, so no primary source was verified. No lead written rather than cite one unread.

**Next.** Why both PRs merged with the frontmatter check red or unrun (it is in `portfolio-validate.yml`); au-gst lead once a primary page is reachable; 390 px sweep of blog posts.
