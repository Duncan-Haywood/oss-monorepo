# Pages build broken by a post with no description (2026-10-30)

Found by a perf-track run timing `node platform/pages/build.mjs`: the build
threw `docs/posts/2026-10-30-luxembourg-bill-8815-committee-stage.md: front
matter needs "description"` (`writing.mjs:172`). The post came in with #11820,
so every Pages build on `main` after it would have failed at the same place.

Fix: add `description` and `tags` to the post's front matter. After it the
full build finishes (133 s cold on a loaded container, 2,518 share cards drawn).

Not changed: no check caught a post without `description` before merge; a
front-matter lint in the PR checks would stop the next one. The perf reading
(warm build, card draws) was not taken this run.
