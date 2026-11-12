---
kind: note
date: 2026-11-12
tagged: auto
---
# Checkbox words read as yes in 64 bid calculators (redteam, 2026-11-12)

**What was wrong.** Sixty-four `ventures/*/calc.mjs` engines shared a
byte-identical `flag(value)` that ended in `return Boolean(value)`, so
`"no"`, `"off"` and `"n"` read as true. The page sends real booleans and
`share.mjs` decodes `'0'`/`'1'`, so only the other callers hit it: agents over
the MCP server (`platform/agents/tools.mjs`), CLIs, and hand-built links.
Reproduced on artificial-turf: `sodDemo: "no", geotextile: "off"` added
$175.50 to the price.

**Fix (PR #15092).** Each copy now accepts `true/1/yes/y/on` and
`false/0/no/n/off/''`, case- and space-insensitive, and throws
`Expected yes or no, got "<value>"` on anything else. All 64 suites pass.

**Guard.** `platform/ci/check_flag_words.py` fails on a one-argument helper
that checks a word like `'false'` and then falls back to `Boolean(arg)`.
`main_health.py` runs it by its `check_*.py` glob. No PR workflow runs it yet.

**For the next run.** Lints under `platform/ci/` reach PR CI only through a
workflow line under `.github/` (control plane). On 2026-11-12 four PRs that
each wire one or two lints were waiting on the owner (#14808, #14877, #14894,
#14911), and `check_page_lists.py` and `check_flag_words.py` have no line at
all. A single `python3 platform/ci/main_health.py` step in
`portfolio-validate.yml`'s validate job would run every one of them and make
those PRs redundant. That is the control-plane PR worth opening, in place of
another one-lint PR.

**Other engines to check.** This sweep matched only the exact helper text.
Engines that parse yes/no input some other way (a `=== 'on'` test, or
`!!value` on a query parameter) were not audited.
