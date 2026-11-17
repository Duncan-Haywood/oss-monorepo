# Semver Range Explainer

Free browser tool and zero-dependency CLI that explains npm semver ranges the
way npm resolves them. Paste a range and some versions and it shows:

- **what the range means**: the comparators each `^`, `~`, `1.x`, `>1.2` and
  `1.2.3 - 2` becomes, with each rewriting step, and the lowest version that
  matches;
- **a reason for every version**: which comparator it fails, or that it sits
  inside the bounds but is a **prerelease npm skips** because nothing in that
  `||` branch names a prerelease of the same major.minor.patch;
- **the version npm installs** from a list (paste `npm view <pkg> versions --json`);
- **an exact comparison of two ranges**: whether one covers the other, the
  other way round, whether they overlap, with a version that proves each "no";
- **findings**: no upper bound, a bare `*` branch that swallows the others
  (and the prereleases they opened), `^0.x` narrower than it looks, a branch
  another branch already covers, `1.2.3-2.0.0` written without the spaces a
  hyphen range needs, dist-tags and URLs pasted where a range goes.

Live: https://marisstella.app/semver-range-explainer/ . Guide:
[why a semver range skips prereleases](why-semver-range-skips-prereleases.html).

## How it is checked

`semver.mjs` is an independent reimplementation of the range rules in
[node-semver](https://github.com/npm/node-semver) (ISC), the package npm
uses, written from its documented behaviour; no node-semver code is copied.
Version precedence follows [Semantic Versioning 2.0.0](https://semver.org/),
section 11.

`semver.diff.test.mjs` compares the engine with the node-semver that ships
inside the npm next to `node` (or `SEMVER_ORACLE=/path/to/semver`), on
randomly generated ranges. It is skipped, not faked, when none is found.
Run here on 2026-11-12:

| | node-semver 7.7.4 (npm in Node 22) | node-semver 7.8.5 (npm in Node 24) |
|---|---|---|
| random ranges (4,000, each in both prerelease modes): valid/invalid and comparator string identical | 8,000 of 8,000 | 8,000 of 8,000 |
| `satisfies` on version/range pairs near every boundary, both prerelease modes | 103,958 of 103,958 | 83,944 of 83,944 |
| `maxSatisfying` / `minSatisfying` | all equal | all equal |
| version validity | all equal | all equal |

The two releases differ in two corners, so the engine has a switch
(`semver: "7.7" | "7.8"`, default 7.8; the CLI reads the version bundled
with your npm): 7.8 rejects an x followed by a number (`1.x.2`, `x.1`) in a
bare or `<>=` x-range, and under includePrerelease 7.8 gives `~1.2` a `-0`
floor and takes it away from a full `^0.2.3`.

### Range comparison, and where it disagrees with node-semver's `subset()`

`compareRanges(a, b)` is exact. A range's verdict can only change at a
comparator boundary, and between two boundaries it is the same for every
release and the same for every prerelease of a given major.minor.patch. So
the engine tests a finite set of versions (every boundary, plus the least
release, least version and least prerelease of each named tuple after each
boundary) and reports the lowest version in each difference.

On 2,500 random range pairs (7.7.4) every witness version was confirmed by
node-semver's own `satisfies()`, and for every pair the engine called
"covered" or "disjoint", probing all those versions plus 20 random ones with
node-semver's `satisfies()` found no counterexample. The engine's answer
differed from node-semver's `subset()` on 147 of the 2,500 pairs:

- **56**: the first range matches nothing (`<0.x`), so it is trivially
  inside anything; `subset()` returned false.
- **87**: every version the first range allows, the second allows, but
  `subset()` returned false. Example: `<=1` and `*`: `<=1` means
  `<2.0.0-0`, which by npm's prerelease rule admits no prerelease, so every
  version it allows is a release `*` also allows. `subset()` compares the two
  as intervals and counts prereleases below 2.0.0 that `satisfies()` never
  accepts.
- **4**: `subset()` returned **true** though a version satisfies the first
  range and not the second, by node-semver's own `satisfies()`. Example:
  `subset("1.2.3-rc.1 >=1.0.0", "^10.0.0")` is true, yet
  `satisfies("1.2.3-rc.1", "1.2.3-rc.1 >=1.0.0")` is true and
  `satisfies("1.2.3-rc.1", "^10.0.0")` is false.

These are reported as differences in method on generated inputs, not as a
claim about anyone's code in use.

## A sweep of this repository

`node cli.mjs --project <dir>` over the 32 `package.json` files in this
repository (2026-11-12): 195 registry ranges (3 non-registry specs skipped),
145 of them with a `package-lock.json` entry, **0** lock versions outside
their range and **0** medium-or-high findings. The repository's own ranges
are clean; the result is recorded so a later run can tell if that changes.

## Use

Browser: open `index.html`. Nothing is uploaded.

CLI (Node 18+):

```
node cli.mjs '^1.2.0' 1.3.0 2.0.0-beta.1          # explain and test
npm view react versions --json | node cli.mjs '^18.2.0' -
node cli.mjs '~1.2.5' --compare '^1.2'            # covers / overlaps, with witnesses
node cli.mjs --project .                          # package.json ranges vs package-lock.json
  --include-prerelease  --semver 7.7|7.8  --json  --strict
```

Engine (`semver.mjs`, pure ES module): `parseRange`, `rangeString`,
`satisfies`, `explainVersion`, `maxSatisfying`, `minSatisfying`,
`minVersion`, `compareRanges`, `subset`, `intersects`, `explainRange`,
`analyze`, `reportCsv`. `minVersion` is the true lowest match, which is
not always what node-semver's `minVersion()` prints: that one tries `0.0.0`
before `0.0.0-0` and bumps `>1.2.3` to `1.2.4`, so with includePrerelease
(or a range that names `0.0.0-0`) it can return a release where a lower
prerelease also matches (`*` with includePrerelease: ours `0.0.0-0`, theirs
`0.0.0`). Matching itself agrees with node-semver. Also callable as
`node platform/agents/tools.mjs call semver-range-explainer analyze --input '{"range":"^1.2.0","versions":"1.9.0-rc.1"}'`.

Tests: `node --test semver.test.mjs semver.diff.test.mjs cli.test.mjs page.test.mjs usage.test.mjs`.

## Usage counting

Four anonymous events (`range_checked`, `example_loaded`, `ranges_compared`,
`report_downloaded`) are counted in the visitor's own local storage only,
switched off by Do Not Track, Global Privacy Control or the page's opt-out
button. Nothing is sent anywhere.

## No warranty

Provided free and as-is, without warranty of any kind. It is not legal,
security or professional advice. Results come from this tool's
reimplementation of npm's semver rules; check anything that matters with
npm itself. Not affiliated with or endorsed by npm, Inc., GitHub, the
node-semver maintainers or the OpenJS Foundation.

MIT licensed. Built with AI assistance.
