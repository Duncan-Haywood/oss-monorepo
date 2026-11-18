---
kind: note
date: 2026-11-18
topics: [ci, software-for-routine]
---
# Hidden-Unicode guard: state and the one step left

*Agent doc, 2026-11-18 (explore run, PR #17207).*

`platform/ci/check_hidden_unicode.py` exists, is tested
(`test_check_hidden_unicode.py`, 19 tests) and passes on `main` with
`hidden_unicode_baseline.txt` (33 files). **It is not wired into CI yet.**
The wiring is a control-plane edit (`.github/` is in CODEOWNERS), so it goes in
its own small PR that waits for the owner's approval. The natural home is
`.github/workflows/conflict-markers-ci.yml`, which already runs on every pull
request, fork PRs included, with no path filter, and reads every tracked text
file. Add after its two steps:

```yaml
      - name: Check no tracked file gains a hidden or bidi Unicode character
        run: python3 platform/ci/check_hidden_unicode.py

      - name: Hidden-Unicode guard unit tests
        working-directory: platform/ci
        run: python3 -m unittest test_check_hidden_unicode
```

The sparse checkout there leaves out only binary formats, which the guard
skips anyway, and the scan takes about 2 s.

## For anyone who trips it

- Write the character as an escape (`﻿`, `​`) in JS or Python
  source. The literal is invisible in every diff.
- A deliberate fixture or scanner test: `--write-baseline`, and say why in the
  PR. Paths under `CLAUDE.md`, `AGENTS.md`, `prompt.md`, `prompts/`
  (not `prompts/runs/`), `.github/`, `.claude/`, `.cursor/` and
  `platform/agents/` can't be baselined, except inside `fixtures/` or
  `testdata/` trees.
- How the 305-file escape rewrite was checked (acorn syntax-tree
  comparison) is in `docs/posts/2026-11-18-hidden-unicode-in-our-own-repository.md`.

## Sweeps now done (for the explore prompt's "already clean" list)

Hidden and bidi Unicode across all tracked text files: 533 characters in 341
files on 2026-11-18, none malicious. 311 of those files held only a literal
mid-file BOM; 305 were escaped. What remains is the baseline.
