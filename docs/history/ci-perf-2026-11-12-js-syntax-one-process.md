# CI perf, 2026-11-12: check_js_syntax.py parses in one Node process

Perf track. Both open backlog perf items (P063, P064) touch
`.github/workflows/`, which CODEOWNERS holds for the owner, so this run took
"the slowest local step an agent session waits on".

## Reading (before)

Every `platform/ci/check_*.py` timed alone (`date +%s.%N` around
`python3 platform/ci/<script>`, this 4-core container, clean tree). Slowest:
`check_js_syntax.py` **58.6 s**, then `check_conflict_markers.py` 11.1 s,
`check_aria_refs.py` 3.9 s, `check_js_dom_refs.py` 3.8 s. No PR workflow runs
`check_js_syntax.py`; `main_health.py` does (every check in parallel, the
command runs use to look for a red main), and it was that script's longest
job: `main_health.py` took **74.3 s** wall. Under load it is the check that hit
the 300 s cap (`docs/posts/2026-11-12-a-timeout-is-not-a-red-check.md`).

Why: 11,238 tracked venture `.js`/`.mjs` files (76 MB), each copied to a fresh
temporary directory and checked with its own `node --check` process (about
20 ms of CPU each, almost all Node start-up), eight threads on four cores.

## Change

- `platform/ci/js_parse_batch.mjs`: reads `[suffix, text]` pairs on stdin and
  answers, per source, whether it parses: `.mjs` with `vm.SourceTextModule`
  (needs `--experimental-vm-modules`), anything else with `vm.compileFunction`
  and the CommonJS loader's five wrapper parameters, the compile
  `node --check` does for a `.js` file (`wrapSafe`).
- `check_js_syntax.py`: `check_all` sends the sources to that script in
  batches of 1,500 (eight processes at once). A `true` is final. A `false`, or
  a failed batch process, sends that file through the old `check_text` (one
  `node --check`), so every failure line and every JSX note is the per-file
  check's own output. The batch is stricter than `node --check` in a few
  cases (Node 22 re-parses some failing CommonJS as a module: top-level
  `await`, `let require`); those fall through to the old path and pass there.
  The design is one-sided on purpose: the fast path can only confirm a pass.

## Verification

- **Same answers.** `check_text` per file (old) against `check_all` (new),
  error text compared with the temporary path stripped:
  - all 11,238 real files: 0 differences (11,237 pass, 1 JSX note);
  - 900 seeded mutations of random real files (seed 20261112; twelve kinds:
    a removed brace or paren, a stray `)`, top-level `await`, `return`,
    `let require`, appended JSX, a hashbang, a BOM, half a file, `const const`,
    an `export` in a `.js` file): 0 differences (422 pass, 75 JSX, 403 errors).
- **Tests** (`test_check_js_syntax.py`, 7 tests OK): `check_all` equals
  `check_text` on eleven edge cases; the batch never passes a source
  `check_text` fails; a missing batch script falls back to per-file checks.
  Making the batch always answer `true` fails two of them.
- `main_health.py`: 62/62 checks pass before and after, same lines (order
  varies with completion).

## After

Same measurements: `check_js_syntax.py` **1.45 s** (from 58.6 s, about 40x);
`main_health.py` **17.3 s** (from 74.3 s). Its longest job is now
`check_conflict_markers.py` (11 s).

## Not changed, ranked for the next run

1. `check_conflict_markers.py` (11.1 s alone), now the floor of
   `main_health.py` and a step of `conflict-markers-ci.yml`. Profile it
   before assuming it is the git calls (the 2026-11-03 conflict-marker-scan
   doc already cut it once).
2. `check_js_dom_refs.py` (3.8 s) and `check_social_proof.py` (3.3 s) are
   serial page walks; `page_pool.map_pages` applies if their per-page work is
   a pure function of one page.
3. A real JS syntax failure still prints the temporary file's path as its
   message (`/tmp/tmpXXXX/f.js:1`), which tells a reader nothing. Printing the
   repo path and line would be better output but is an output change: do it
   as a product change with its own test, not under "same answers".
4. P063 and P064 remain owner-gated.

## Independent check (a second perf run, same evening)

A second perf session (PR #15284) found the same 11,238 `node --check` starts and
built a different batch: it called Node 22's own `check_syntax.js` internals
(`defaultGetFormat`, then `ModuleWrap` or `wrapSafe`) under `--expose-internals`,
one process per core, 62.4 s to 4.4 s. This change landed first and is faster
(1.45 s), so that version was dropped. Its equivalence sweep was run against this
batch instead, with the fallback switched off (`batch_parses` alone):

- 1,500 tracked files (seed 20261112), each plus a truncated copy and a copy with one
  injected token (`)`, `}`, `await x`, `return 1`, `import "z"`, `#!`, `<div>`,
  ` yield 2`, `export {}`, a backtick, `with(a){}`, `08`, `let let=1`), plus 14 hand
  cases (hashbang in `.js` and `.mjs`, BOM, `<!--` comments in both, top-level
  `return` and `await`, `import.meta` and `import()` in `.js`, an empty file):
  **4,514 texts, 2,244 failing `node --check`.**
- The batch passed **none** that `node --check` rejects, and rejected **5** that it
  passes (the stricter cases this doc names; they take the per-file path and pass
  there). The one-sided design holds on a sweep written without sight of this one.
- `main_health.py` timed the same way: 78.8 s and 75.9 s before either change;
  18.0 s and 18.4 s with the internals version, so the two batches are the same
  saving at that level (the check is no longer the sweep's longest job either way).
