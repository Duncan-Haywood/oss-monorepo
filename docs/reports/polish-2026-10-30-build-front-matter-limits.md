# Polish 2026-10-30: the Pages build was red on two front-matter limits

**Found.** `node platform/pages/build.mjs` on `main` (a2f2320e) threw in `writing.mjs`:
`docs/posts/2026-10-30-does-an-open-centre-valve-slow-the-dig.md` had a 178-character
`description` (limit 160), then a 79-character `seo_title` (limit 70). The build aborts on the
first bad post, so no deploy of the site could succeed until it was fixed.

**Fix.** Shortened both fields; another session landed an equivalent fix on main while this run was open, so the merged post text is main's. This PR keeps the note.

**Measured.** Full build, then `check.mjs`: 1321 products, 44 category pages, 5816 pages, no dead links.
A scan of every `docs/posts/*.md` found no other description over 160.

**Next.** The same fault hit #11825 (missing description) earlier today, so posts keep reaching `main`
without the build having read them. A cheap PR-time check that runs `loadPosts` alone (seconds, no
full build) would stop this class; it is not written yet.
