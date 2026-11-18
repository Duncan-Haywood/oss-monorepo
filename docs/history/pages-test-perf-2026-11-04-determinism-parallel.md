# Pages tests: determinism builds side by side (2026-11-04), backlog P062 part 1

**Change.** `build-determinism.test.mjs` ran two full `buildSite` calls one
after the other. `buildSite` keeps module-level state (`SITE_COUNTER_URL`,
`SITE_FEEDBACK_URL`), so they cannot share a process: each now runs in its own
child process, both at once. Assertion unchanged (equal `cacheName`, different
`outDir`); separate processes also make the test stronger.

**Measured** (4-core sandbox, warm card cache, `node --test <file>`): before
292.5 s (per-file reading); after 263 s. The sandbox is CPU-bound, so two
builds side by side gain little here; a runner with idle cores during the
other two builds is where wall time should drop, unmeasured until
`ci_profile.py` shows the next runs.

**Also fixed (main was red).** Two posts failed every site build:
`2026-11-04-describe-your-clothing-line-in-a-sentence.md` (description 178
chars, limit 160) and `2026-11-04-no-silent-buttons-in-3422-pages.md` (no
`description`). Fixed forward.

**Not changed / next.** Sharing one build between `custom-domain.test.mjs` and
`build.test.mjs` (P062 part 2); judge with ci_profile "Test the site builder"
minutes (baseline 17.5 over 21 jobs).
