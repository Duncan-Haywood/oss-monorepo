# Broken main again: Georgia lien post lacked `description` (2026-11-03)

**Reading.** A perf run timing `platform/pages` test files found
`build-determinism.test.mjs` failing in about 58 s with
`docs/posts/2026-11-03-lien-deadlines-georgia-added.md: front matter needs "description"`
(post from #12756). Every build of the site fails on it.
**Change.** Added the `description` line. No code touched.
**Verification.** `node --test build-determinism.test.mjs`: pass 1, fail 0 (4m43 wall
on this cold-cache container).
**Tried and reverted.** Running the test's two builds with `Promise.all`. Not
measured against a valid serial baseline (the only serial number was a failing
early exit), so it was not shipped. Next run: time the serial test on a warm card
cache first; it is the longest file in the suite.
**Not changed.** The front-matter gate could run in the pre-merge post check so
a post without a description fails in seconds on the PR that adds it.
