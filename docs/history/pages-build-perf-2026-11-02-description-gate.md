# Pages build failed on main again: a 172-character description (2026-11-02)

Perf track run. Before: `node platform/pages/build.mjs --out=<dir>` on `main`
at c5b98eba exited 1 after 60 s (`time`, one run): `docs/posts/2026-11-02-cold-email-replies-in-six-languages.md`
had a 172-character `description` (limit 160), thrown by `writing.mjs`.
`python3 platform/ci/check_post_frontmatter.py` reported the same, so the
three-hourly deploy would have failed.

Fix: a 134-character description. After: the checker exits 0 and the build
exits 0 in 2 m 54 s wall, 5 m 15 s user (one run, shared container).

Second time in a day (see `pages-build-perf-2026-11-02-broken-main.md`) that
a post's front matter reached `main` and broke the build. Not changed, for the
next run: make `check_post_frontmatter.py` a required check on any PR touching
`docs/posts/**`, or run it in the session gate; a CI change is a CODEOWNERS
path, so it needs its own small PR.

Update: another session landed its own shortening of the same description on
`main` while this PR was open; the merge kept main's text. This PR therefore
carries only this note and the run record.
