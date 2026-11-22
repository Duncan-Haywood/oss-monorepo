# package-exports-drift-check: a resolver checked against Node (2026-11-22)

What landed: `ventures/package-exports-drift-check/resolve.mjs`, an implementation of Node's
`exports`/`imports` resolution, and `resolve.diff.test.mjs`, which compares it with the `node`
running the test. On Node 22.23.5 the comparison found 0 disagreements in 5,079 resolutions
(default seed) and in about 85,000 more (seeds 1 to 5).

What a later run should know:

- **The oracle trick.** `import.meta.resolve(spec, parentURL)` (with
  `--experimental-import-meta-resolve` for the second argument) returns the URL without
  opening the file. So any resolver question can be put to Node with no fixture files. Other
  ventures that model Node resolution can reuse this.
- **Corrected claim.** The tool used to say that a bare-specifier `exports` target "re-exports
  another package, nothing to check". Node always rejects it (`ERR_INVALID_PACKAGE_TARGET`).
  Other venture pages or posts that describe `exports` the same way are wrong too:
  (A 2026-11-22 grep for "re-export" across other ventures found only unrelated uses.)
- **When Node moves on.** `DEFAULT_CONDITIONS` is pinned to Node 22, and a test fails if the
  running Node's defaults differ. Node 24/25 accept `#/` imports. When CI's Node changes, rerun
  the diff test and update `resolveImports` rather than deleting the case.
- **Next, if it pays off:** chase `imports` targets into the named package through a
  pasted `node_modules` listing, and add a "types" lens that shows which `.d.ts` TypeScript's
  `moduleResolution: bundler/node16` picks. arethetypeswrong does that for published packages;
  our version would run on a package that hasn't been published yet.
