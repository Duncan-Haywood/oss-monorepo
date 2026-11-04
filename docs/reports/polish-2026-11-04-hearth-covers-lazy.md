---
kind: polish
topics: [performance]
date: 2026-11-04
tagged: auto
---
# Polish 2026-11-04: Hearth & Horizon shelf covers below the first one load lazily

**Weak surface.** A scan of every `ventures/*/index.html` for `img` tags without `loading` found two real cases: the second and third shelf covers on Hearth & Horizon. Other hits were example text or a runtime canvas.

**Change.** `stories.mjs` (`renderIndex`) adds `loading="lazy" decoding="async"` to every cover after the first (the first is above the fold). `index.html` regenerated with `node generate.mjs`.

**Measured.** `node --test ventures/hearth-and-horizon/*.test.mjs`: 11 of 11 pass. No page-speed change measured; the covers are 96 px, so the saving is small.

**Checked and clean.** Post front matter (`check_post_frontmatter.py`) and `missing_llms_txt.py` both report nothing; no venture index lacks a description or `h1`.

**Next.** Generated pages are edited at the generator; a lint that flags `<img>` without `loading` in generated output would keep this fixed.
