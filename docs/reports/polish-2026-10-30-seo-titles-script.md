# Polish 2026-10-30: `seo_title:` proposed by script, 203 posts

**Weak surface.** 469 posts in `docs/posts/` had a headline over the 70-character title budget and no `seo_title:`
(batches 1 to 3 did 25 by hand each).

**Change.** `platform/pages/propose_seo_titles.py` lists, or with `--apply` writes, a `seo_title:` for every such post
whose headline has a clean cut at the first ": " or "? " (25 to 70 characters before it). Applied to 203 posts. The `h1` and
structured data keep the full headline.

**Measured.** `node --test platform/pages/writing.test.mjs`: 21 pass, 0 fail. Full site build not run. Rankings not measured.
The first apply wrote at the wrong offset and corrupted front matter; `writing.test.mjs` caught it, I reverted and fixed it.

**Still weakest.** 266 headlines have no clean cut and need a person or agent to title them
(`python3 platform/pages/propose_seo_titles.py` reports the count). Cuts like "Machine learning on qualitative data"
drop the detail, so spot-check any that read too generic. First-screen call-to-action on flagship pages at 390 px and Lighthouse remain open.
