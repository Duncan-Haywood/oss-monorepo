---
kind: polish
topics: [build, writing]
date: 2026-11-07
tagged: auto
---
# Polish 2026-11-07: an uppercase post slug stopped the whole site build

**Found.** `node platform/pages/build.mjs` on `main` threw at `writing.mjs` `loadPost`: `docs/posts/2026-11-07-a-lumber-size-called-toString.md: name must be <YYYY-MM-DD>-<slug>.md`. `FILE_RE` only accepts lowercase slugs, so the capital S in `toString` failed the build before any page was written. Merged in PR #13811 and later runs.

**Changed.** Renamed the post to `...-called-tostring.md` (the post URL slug is lowercase; nothing else referenced the old name).

**Checked.** Full build completes; `check.mjs`: 7556 pages, no dead links.

**Next.** A pre-merge lint that runs `FILE_RE` over `docs/posts/` names would catch this in the PR, not at deploy. Not added here.
