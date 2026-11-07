---
kind: polish
topics: [seo, titles]
date: 2026-11-07
tagged: auto
---
# Polish 2026-11-07: one duplicate title and one over-long title found by a full build

**Checked.** Full `node platform/pages/build.mjs` then `check.mjs`. The build warned that the fence-calculator post reused the
calculator page's title; `check.mjs` reported one `<title>` of 144 characters (El Salvador DTE page, over the 130 limit).

**Fixed.** The post now has its own `seo_title`; the El Salvador page title and `og:title` are 88 characters.
Not rebuilt after the edit (a build takes ~10 minutes); the source strings were checked directly. Rankings and traffic are unmeasured.

**Next.** Still undone: 390 px screenshots of research and Stories pages; the research-title disambiguator; `front-door.mjs` long phrase.
