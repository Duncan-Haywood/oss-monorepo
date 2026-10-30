---
title: "clonescan now finds copies whose names changed"
date: 2026-10-29
description: "A --normalize mode for the Rust copy-paste detector hashes identifiers, strings and numbers by kind: 40.6% duplicated lines becomes 60.4% on this repo."
tags: [rust, clonescan, dev-tools]
---

*Renamed on 2026-10-30: this tool was published as `dupehound` for its first day. That name was already taken on crates.io by an unrelated duplicate-code tool, so it is now `clonescan`.*

The copy-paste detector clonescan matched code token for token, so a function
pasted and then renamed was invisible, the same as in jscpd's default mode.
`--normalize` (and a checkbox on the browser page) now hashes every
non-keyword identifier as one placeholder, strings as another and numbers as a
third. Keywords and punctuation stay, so `if` is not `while` and a changed
call shape is not a clone.

On this repository's 9,461 `.mjs` files it takes the duplicated share from
40.55% to 60.41%, in 1.65 seconds. Nobody has labelled those extra matches, so
read the 20 points as matches of shape, not proven duplication: two functions
that look alike and mean different things will match. That is why the mode is
off by default.

Writing the tests turned up a limit worth knowing: a window is paired with the
first place its hash occurs, so in a file of many same-looking lines a copy
can be reported as several short clones. The fix (pair with every earlier
occurrence on the diagonal) is in the README's next list.
