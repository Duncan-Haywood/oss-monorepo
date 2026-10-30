# Polish 2026-10-29: optional `seo_title:` for blog posts

**Weak surface.** `polish-2026-10-28-compare-titles.md` listed about 570 blog headlines over the 70-character
title budget, so their `<title>` is the full headline and search results cut it.

**Change.** `platform/pages/writing.mjs` reads an optional `seo_title:` front-matter field. It sets only the
page `<title>`; the `h1`, structured data and feeds keep the headline. A value over `TITLE_BUDGET` fails the build.
Test: `writing.test.mjs`. First use: the 2026-10-29 Zita post.

**Not measured:** rankings, traffic; no full build was run this session (the change touches post `<title>` only).

**Still weakest / next.** Add `seo_title:` to the most-visited long-headline posts (a script can list posts over
budget); 45 research titles with the disambiguator; `platform/marketing/front-door.mjs:1646` long phrase.
