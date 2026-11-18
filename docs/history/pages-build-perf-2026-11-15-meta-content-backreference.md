# Pages build: the meta `content=` regex's backreference (2026-11-15)

Perf track, `perf/0`. Item 2 of the "not changed" list in
`pages-build-perf-2026-11-15-writing-sync-writes.md` ("`metaContent`'s
one-slot memo misses after every `setContent`"). The memo turned out not to be
the cost; a regex was.

## Reading

Both open perf backlog items (P063, P064) touch `.github/` and wait for the
owner, so this run took the next item on the last perf run's list.

To time the share step alone, one full build (`node build.mjs
--out=<dir> --base=https://example.test/site/`) was run with a temporary
two-line capture in `finishPagesInOneWalk` (removed before commit) that saved
every page's input to `shareTagsFor`: 9,983 pages, 260 MB. A bench script then
ran `shareTagsFor` over all of them, four rounds per process, outputs hashed
after the timed loop (sha256 over each page's relative path, new HTML and card
plan).

| code | rounds (s) | output digest |
|---|---|---|
| before | 4.73 4.16 4.46 4.05 / 4.79 3.90 4.29 4.34 / 3.86 3.83 4.25 4.02 / 4.30 3.91 4.22 3.97 | `8b4c0fefe9c75876` |
| after | 2.86 2.73 2.74 2.54 / 2.78 2.40 2.77 2.53 | `8b4c0fefe9c75876` |

## The profile

`node --cpu-prof` on the bench, self time per function and `positionTicks`
per line: `metaContent` had 2.2 s of self time over two rounds, and 1,848 of
its ticks were on one line:

```js
const c = /\bcontent\s*=\s*(["'])([\s\S]*?)\1/i.exec(tag);
```

The tags are short: 117,458 of them, 85 characters on average, 267 at most.
Run alone over those tags, that regex took 462 to 513 ms; the same pattern
without the backreference, `/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i`,
took 15 to 24 ms, with the same captured text (5,689,737 characters in total).

### Why: a two-byte subject

A synthetic repro (below) shows the backreference under `i` is only slow when
the subject is a two-byte string. V8 stores a string two bytes per character
when any character is outside Latin-1, and slices (what `html.match` returns)
share their page's representation. Most built pages carry a `—` or a curly
quote. Node v22.23.4, 100,000 tags, third round of three:

| tags | backref, `/i` | backref, no `/i` | alternatives, `/i` |
|---|---|---|---|
| separate one-byte strings | 18.5 ms | 22.1 ms | 11.6 ms |
| slices of 60 kB one-byte pages | 21.6 ms | 24.4 ms | 11.8 ms |
| slices of 60 kB pages with one `—` | 412.3 ms | 41.6 ms | 21.2 ms |

A case-insensitive backreference compares the capture with case folding; the
numbers say V8's path for that on two-byte strings is about 20 times slower.
That is an inference from timings, not from reading V8's source.

```js
// MODE=plain|page|twobyte node repro.mjs
const mode = process.env.MODE ?? 'plain';
const tags = [];
for (let p = 0; p < 1000; p++) {
  const parts = [];
  for (let i = 0; i < 100; i++) parts.push(`<meta property="og:title" content="Page ${p} tag ${i}: a title of ordinary length">`);
  if (mode === 'plain') { tags.push(...parts); continue; }
  const page = 'x'.repeat(30000) + (mode === 'twobyte' ? '—' : '') + parts.join('\n') + 'y'.repeat(30000);
  tags.push(...page.match(/<meta\b[^>]*>/g));
}
const variants = {
  'backref, /i': /\bcontent\s*=\s*(["'])([\s\S]*?)\1/i,
  'backref, no /i': /\bcontent\s*=\s*(["'])([\s\S]*?)\1/,
  'alternatives, /i': /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i,
};
for (let round = 0; round < 3; round++) {
  for (const [name, re] of Object.entries(variants)) {
    const t = process.hrtime.bigint();
    let n = 0;
    for (const tag of tags) n += re.exec(tag) ? 1 : 0;
    if (round === 2) console.log(mode, name, (Number(process.hrtime.bigint() - t) / 1e6).toFixed(1), 'ms', n);
  }
}
```

Full-page `/gi` regexes with backreferences (`<(script|style)\b…<\/\1>`,
`<h([1-6])…<\/h\1>`) were timed the same way over the 9,983 pages and are
within 20% of their alternation forms. They are not worth changing.

## Change

- `share.mjs`: one hoisted `META_CONTENT = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i`,
  used by `metaContent` (value is `c[1] ?? c[2]`) and by `setContent`'s
  replace.
- `share.mjs`: `decode` returns its input at once when it holds no `&`.
  Every one of its 14 patterns starts with `&`, so the result is the same.
- `build.mjs` (`injectDiscoveryTags`'s `contentOf` and `rewrite`) and
  `check.mjs` (the snippet-length check): the same pattern without `\s*`
  around `=`, as before.

Why the patterns are the same: with an opening `"`, the lazy
`[\s\S]*?\1` ends at the first following `"`, which is `"[^"]*"`, and the
same holds for `'`. `\s*` cannot give anything back that would start a
quote. If no closing quote follows, both fail at that position and the
search moves on. The value is `c[1]` (double-quoted) or `c[2]`
(single-quoted), and `??` keeps an empty `""` value.

**Tried and dropped:** keeping the one-slot memo in step across
`setContent` edits, with offsets and a guard that a rescan would give the same
tags. It gave the same digest but no measurable time on top of the regex fix
(2.42 to 2.88 s with it, 2.29 to 3.02 s without, eight rounds each,
interleaved). Simpler code
won.

## Verification

- Same answers: the bench digest above is identical before and after.
  A full build with the new code against the capture build with the old:
  `diff -rq` over 29,463 files differs only in `version.json` (`built_at`).
- `share.test.mjs` 31/31. The whole `platform/pages` suite: 1,658 pass,
  26 skipped, 2 fail. Both failures were two tests in `build.test.mjs`
  saying that files under `docs/` changed while the suite ran (this run
  wrote its post and this file mid-run). `build.test.mjs` re-run on an
  unedited tree: 313/313 pass.

Faster: full `buildSite` (`--base=https://example.test/site/`, warm
`PAGES_CARD_CACHE`, same container, run new, old, new, old):

| | before | after |
|---|---|---|
| full build, wall | 53.9, 61.0 s | 47.4, 55.1 s |

Each new build was about 6 s faster than the old one beside it. The
container got slower across the four runs (47 to 55 s for the same code), so
take the size as rough. The share step alone (the bench above) accounts for
about 1.5 s. The rest is plausibly `injectDiscoveryTags`'s `contentOf`,
which uses the same regex on every page; that was not measured separately.
The CI figure will come from the next `ci_profile.py` reading of "Build the
site" (44 s median before) and of the `check` step.

## Not changed, ranked for the next run

1. **The fixture builds re-render the whole blog** (item 1 of the previous
   list, unchanged).
2. **The app icons are drawn once per process** (`renderIcon`, about 1.2 s);
   not cached on disk.
3. **`loadMerges` runs `git log` twice per build**, and `decision_queue.py
   --json` three times.
4. `platform/agents/tools.mjs:56` uses the same `(["'])…\1/i` shape, once
   per page over the whole page; not on any hot path found.
5. P063 and P064 remain owner-gated.
