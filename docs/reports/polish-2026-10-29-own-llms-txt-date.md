# Polish 2026-10-29: as-of date on hand-written llms.txt (AEO)

**Weak surface.** The earlier run (`polish-2026-10-29-llms-txt-as-of.md`) dated the 1,308 generated `llms.txt`
files but left the 18 hand-written ones (ten flagships among them) undated; four flagships
(changepoint-detector, quick-pick-survey, open-tennis-robots, and others) state no date at all.

**Change.** A hand-typed date would go stale, so the build now appends the git date instead.
`withLlmsAsOf` in `platform/pages/build.mjs` adds `Source last changed: YYYY-MM-DD (from the repository's
git history).` to the built copy of a product's own `llms.txt`, using the file's own last-change date (falling
back to `index.html`). It adds nothing when the git date is unknown (shallow clone) or when the author
already wrote "last updated/changed/verified: <date>" or "as of: <date>". Source files are untouched.

**Measured.** `node --test platform/pages/product-llms.test.mjs`: 3 pass. Full site build not run here (7 to 20
minutes); CI's build covers it. No citation or traffic effect measured.

**Next.** A check that every built `/<slug>/llms.txt` states a date; wall-framing-takeoff and
changepoint-detector list no sub-pages beyond the placeholder origin; Lighthouse still not run.
