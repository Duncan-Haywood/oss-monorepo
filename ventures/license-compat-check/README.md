# License Compatibility Check

A free tool that checks your dependencies' declared licenses against **how you
ship** and lists exactly which ones conflict, which need a human, and the usual
way out of each.

**Live tool:** https://marisstella.app/license-compat-check/

**What it is not:** legal advice, a compliance certifier, or a substitute for
reading license texts. It applies a rules table of widely published FSF/OSI
compatibility positions to the license strings you give it, deterministically,
with no model and no network.

## Contexts

`proprietary-distributed`, `saas`, `internal`, or an open-source outbound license
(`mit`, `apache-2.0`, `gpl-2.0-only`, `gpl-3.0-or-later`, `agpl-3.0-or-later`, ...).
Options: `--linking dynamic` (LGPL), `--modified` (AGPL on a service),
`--allow name1,name2` (already cleared), `--strict` (reviews fail too).

## CLI

```
node cli.mjs scan --out deps.json
node cli.mjs check deps.json --project proprietary-distributed   # exit 1 on conflict
node cli.mjs notices deps.json > THIRD_PARTY_NOTICES.txt
```

Input: `{name, version, license}` JSON, `pip-licenses --format=json`, or CSV.
SPDX expressions (`MIT OR GPL-2.0-only`, `GPL-2.0-only WITH Classpath-exception-2.0`)
are understood; OR takes the better branch, AND the worse.

## Tests

`node --test` in this directory. `spdx.diff.test.mjs` compares the expression
parser with [spdx-expression-parse](https://github.com/jslicense/spdx-expression-parse.js)
(MIT), the SPDX parser bundled inside npm, on 20,000 random valid expressions
over every SPDX license and exception id npm ships; it is skipped, not faked,
when npm's copy is not found (`SPDX_ORACLE_DIR=/path/to/npm/node_modules`). Run
here on 2026-11-19 against spdx-expression-parse 4.0.0: every tree matched.
PyPI trove names, which `pip-licenses` reports ("GNU General Public License v2
or later (GPLv2+)", "Mozilla Public License 2.0 (MPL 2.0)"), resolve through the
id in their trailing parenthesis; a name with no version ("GNU General Public
License (GPL)") stays unknown and is sent to review.

Companion: [`license-drift-check`](../license-drift-check/)
tells you when a license changed between two snapshots.
