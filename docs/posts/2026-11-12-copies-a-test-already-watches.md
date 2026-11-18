---
title: "Copies a test already watches count as one"
date: 2026-11-12
description: "dupehound --guarded counts vendored copies a sync test keeps identical as one. On this repo the duplication estimate drops from 396,673 to 283,122 lines."
tags: [rust, dupehound, dev-tools]
---

Earlier today [dupehound learned to group clones into families](2026-11-12-39263-copies-are-3214-blocks.md),
ranked by how many lines a shared module could remove. Ranks 2 and 3 on this
repository were the `proposal.mjs` module and its test suite, each copied
whole into 122 ventures. Neither is forgotten debt.
`platform/proposal/sync.test.mjs` fails the build when any venture's copy
differs by a byte from the canonical file. The ventures vendor their
dependencies on purpose, because each one is published as its own directory
and an import reaching across the tree would 404 on the live site.

So the ranking was spending its two best rows on code someone already
watches. `--guarded FILE` fixes that. You give it the path patterns of copies
kept in sync on purpose, one per line, in the usual glob syntax:

```
platform/proposal/proposal.mjs
ventures/*/proposal.mjs
...
```

## The obvious rule found nothing

The first version marked a family as guarded when every copy matched a
pattern. On this repository it marked **zero** of 3,305 families. That
includes the two proposal families, which match 122 of their copies.

The leftover copies were not proposal code. Three `calc.mjs` files
(`booth-rent-vs-commission`, `junk-removal-bid-calculator` and
`lawn-care-bid-calculator`) carry the 12-line `number()` input validator,
pasted from `proposal.mjs`. Two `usage.test.mjs` files share its 16-line test
header. Those copies overlap the module, so they join its family, and one
unguarded copy was enough to make the whole family count as unguarded.

A yes-or-no flag would give the wrong answer either way. If it hid the
family, it would also hide the three validator copies, which no test keeps in
step. If it kept the family, the 122 synced copies would stay at the top of
the table.

## Fold, don't flag

So `--guarded` folds. Inside each family, the guarded copies collapse into
one occurrence (the longest of them), because the test already makes them a
single maintained copy. Then the family's statistics and rank are
recomputed. A family whose every copy is guarded drops out of the table and
into a total at the end.

| (11,360 `.mjs` files, commit `4dcaf94d`) | before | with `--guarded` |
|---|---|---|
| proposal module family | rank 3, 55,297+ removable lines | rank 568, 36 lines (122 copies fold into one, plus the 3 `calc.mjs` strays) |
| proposal test family | rank 2, 58,322+ lines | rank 645, 32 lines |
| summed lower estimate, all families | 396,673 lines | 283,122 lines |
| run time | 0.83 to 0.91 s | 0.84 to 0.96 s |

The summed estimate overstates any real saving, because families can overlap
and the import lines that would replace each copy are not subtracted. The
drop is still the point: about 113,500 lines of the "duplication" on this
repository were copies a test already watches. What is left at the top of
the table is the 76-line block in 1,025 `usage.mjs` files, and no
byte-for-byte test covers it. The privacy tests check each copy's behaviour,
not that the copies match.

The guard list for this repository is in
[`ventures/dupehound/guards/oss-monorepo.txt`](../../ventures/dupehound/guards/oss-monorepo.txt).
Without `--guarded`, the output is exactly what it was, and the browser
build's output still matches the CLI's in the parity test.

## Next

Guard lists should be suggested, not only written by hand. A family whose
copies are all whole files and all token-identical is probably vendored on
purpose. dupehound could print those as candidate `--guarded` lines for a
person to confirm.
