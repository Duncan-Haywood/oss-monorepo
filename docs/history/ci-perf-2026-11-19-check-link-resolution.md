# CI perf, 2026-11-19: `check.mjs` resolves links by hand, and remembers each link's outcome

Perf track, prompt 0 (session in the run record). Item 2 of the "not changed"
list in `ci-perf-2026-11-15-check-sync-page-reads.md` ("the 276k-entry
resolution memo hits only 39% ... resolving with string ops instead of
`path.resolve` would do better").

## How the target was picked

- Both perf backlog rows (P063, P064) are owner-gated workflow edits.
- Five perf runs earlier today worked on the Pages build and venture suites;
  `check.mjs` ("Check the built artifact", run on every Portfolio Pages build
  before publishing) had not been read since 2026-11-15.
- A `platform/pages` survey for awaited per-file reads (item 3 of
  `pages-test-perf-2026-11-18-surface-budget-sync-scan.md`) found `check.mjs`
  and `build.mjs` at the top by count; `check.mjs`'s served-page reads were
  already made synchronous on 11-15, so the profile, not the grep, chose.

## Reading

Local container, 4 cores. `PAGES_CARD_CACHE=<dir> node build.mjs --out=<dist>
--audio-cdn` as the workflow runs it (2 m 35 s; 1,411 products, 11,937 pages).

`node --cpu-prof check.mjs <dist>`, self time summed per function, 19.0 s:

| self time | what |
|---:|---|
| 2,783 ms | idle |
| 2,036 ms | GC |
| 1,513 ms | the link-pass callback (regex spreads) |
| 1,228 ms | `normalizeString` (node:path) |
| 723 ms | `path.relative` |
| 539 ms | `resolveLink` (memo key building) |
| 532 ms | `path.resolve` |
| 380 ms | `path.join` |
| 321 ms | `present` |

`normalizeString` came almost entirely from `path.resolve` and from
`path.relative`, which resolves both its arguments again, in the link pass.

## Change (`platform/pages/check.mjs`)

1. **`resolveUnder(root, dir, link)`**, exported. For a link not starting
   with `/` it splits `dir` (a walk-produced directory, real names only) and
   the link on `/`, drops `''` and `.`, pops on `..`, and joins onto the
   already-resolved root. Exactly the old answer, including two quirks it
   reproduces on purpose: a result whose first segment starts with `..`
   (a top-level name like `..x`) counts as an escape, because the old
   `path.relative(...).startsWith('..')` test said so; and a `..` above the
   root falls back to `path.resolve`, because `../dist/x` under a root named
   `dist` climbs out and back in. Absolute links also take `path.resolve`.
2. **The memo holds the link's whole outcome**: escapes, skipped
   (`deploy/` and `dev/`, written after the check), dead, or the final
   target and its site-relative path for the reachability graph. Keyed by
   source kind (`h`/`o`: only non-HTML sources try bundler extensions), the
   directory and the cleaned link. The extension-less directory probe, the
   `index.html` joins and the existence lookups now run once per distinct
   link, not once per occurrence. The artifact does not change while it is
   checked, so a disk answer stays valid.

## Verification

- **Output unchanged:** `cmp` of the full `check.mjs` output, before and
  after, on the real artifact: identical. Then the same with a probe page and
  module injected into `allergen-label-maker/` carrying nine bad links
  (dead, `missing/`, escape by `../../../..`, absolute `/abs.html`,
  `../dist/index.html`, `.//index.html`, `sub/../index.html`, a dead dynamic
  import): both versions exit 1 with byte-identical reports (10 problems).
- **New test** in `check.test.mjs`: `resolveUnder` against
  `path.resolve` + the escape test over 2 roots × 5 dirs × ~300 links (more
  than 1,000 cases, including `..x`, `.well-known`, `//`, climbing out to
  `dist`). Mutation check: deleting the `..x` rule fails it; returning null
  instead of the fallback above the root fails it.
- `node --test check.test.mjs`: 99 of 99 pass.

## After

Interleaved runs (old, new, old, new ...) on the same artifact, phase time
from `performance.now()` around the link pass's `mapLimit`, total from
`date +%s.%N`:

| run | link pass old | link pass new | total old | total new |
|---|---:|---:|---:|---:|
| 1 | 8,044 ms | 4,320 ms | 21.1 s | 17.8 s |
| 2 | 6,710 ms | 3,663 ms | 20.5 s | 16.2 s |
| 3 | 7,105 ms | 3,714 ms | 19.7 s | 16.0 s |

Median: link pass **7.1 s to 3.7 s**, whole check **20.5 s to 16.2 s**
(about 21%). Back-to-back sequential runs earlier in the session drifted by
±1 s with the container's load, which is why the comparison is interleaved.
On CI the step's median was 16 s on 2026-11-15; expect it near 12 to 13 s.

## Not changed, ranked for the next run

1. **The link pass's remaining 3.7 s**: the callback's own work (1.4 s self),
   mostly `[...matchAll]` spread into three arrays per file and the
   `SCRIPT_OR_STYLE_RE` strip of every page. One combined scan per file would
   cut allocation and some of the 2 s of GC.
2. **Idle, 2.8 to 3.6 s**: `walk`'s awaited `readdir` per directory and the
   remaining `exists()` disk lookups for links the walk did not list. A sync
   or `readdir({ recursive: true })` walk would need checking against the
   symlink and empty-directory cases the comment at `present` names.
3. **The description-length pass** runs `<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>`
   over every page three times (once per attribute; 0.5 s). Matching the
   tags once per page and testing each against the three names would be the
   same answer.
4. P063 and P064 remain owner-gated (workflow files).
