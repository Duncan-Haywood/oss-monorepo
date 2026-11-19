---
title: "Eleven import cycles, and whether any of them can break"
seo_title: "ES module cycles that throw 'Cannot access before initialization'"
date: 2026-11-19
tags: [ventures, cyclehound, javascript, dev-tools]
description: "cyclehound lists circular imports; a new two-second check loads each file on a cycle first to see which ones throw a ReferenceError. On this repository: none."
---

[cyclehound](https://marisstella.app/cyclehound/), the portfolio's Rust
import-graph checker, finds 11 circular imports through 34 files in
`ventures/` in 0.58 s. That raises the obvious question: do any of them
matter?

An ES module cycle is usually harmless. Module A imports B, B imports A,
and as long as each only *calls* the other's functions after loading has
finished, nothing goes wrong. It breaks when one module reads the other's
top-level value while that other module is still loading:

```js
// a.mjs
import { RATE } from './b.mjs';
export const DOUBLE = RATE * 2;

// b.mjs
import { DOUBLE } from './a.mjs';
export const RATE = 3;
```

`import './a.mjs'` works. `import './b.mjs'` throws `ReferenceError:
Cannot access 'RATE' before initialization`, because Node starts B, follows
its import to A, and runs A's top line before B has set `RATE`. The bug
depends on which file the program enters first. So a test suite that always
imports the same file never sees it, and the first person to load the cycle
from the other end (a new page, a worker, a new test) does.

## The check

`tools/entry-order.mjs` takes cyclehound's report and loads each `.mjs`,
`.js` or `.cjs` file on a cycle as the first module, one fresh Node process
per file. It costs one Node start per file *on a cycle*, not per file in the
tree, so the whole pass over 14,196 files takes about 2 seconds. It exits 1
on a "before initialization" error and lists other load errors (a module
that needs a browser) without failing.

## What it found here

Nothing. All 21 product modules on cycles, in ai-bookkeeper,
league-schedule-generator, shed-designer, babysitting-business-kit and the
site's page builder, load cleanly whichever one comes first. The only
failures were the fixtures: cyclehound's own `ring` test folder (a
deliberate directory import) and the new `tdz` fixture above, which fails
from exactly one end as it should.

A clean result is still worth having: it means these cycles are a tidiness
question, not a latent crash, and the check can now tell anyone who adds a
cycle which kind they added. It runs the modules' top-level code, so it is
for your own repository, not for code you just downloaded.

Source and usage: [`ventures/cyclehound/README.md`](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/cyclehound/README.md),
"Which cycles break: entry order".
