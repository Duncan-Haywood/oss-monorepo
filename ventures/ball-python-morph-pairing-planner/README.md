# Ball Python Morph Pairing Planner

Free, browser-only pairing planner for ball python breeders. List your females and
males with their morphs and hets, add what each morph sells for, and it works out the
Mendelian odds for every pairing, expected hatchlings, revenue after fees and raising
cost, and ranks pairings by expected profit or by the chance of a target morph.
Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/ball-python-morph-pairing-planner/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - gene table, animal and price parsing, the per-gene cross
  (recessive, incomplete dominant, dominant, lethal-when-doubled), clutch economics
  and an independent `verifyPlan`. Genes at the same site (allelic groups) are
  refused rather than mis-modelled.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-to-work-out-ball-python-morph-odds.html` - guide whose worked table is
  recomputed by the test suite.

**No warranty.** Free and as-is; not veterinary or animal husbandry advice. Gene
types follow common breeder convention and may be wrong or out of date for your
line; starter prices are examples. Linkage, sex, allelic genes and the premium for a
proven het are not modelled. Checked against an independent gamete-by-gamete count,
not against real clutches.

**Privacy.** Everything runs in your browser; your collection is never uploaded and
is not saved. Anonymous feature counts stay in local storage and can be switched off.

MIT licence, see `LICENSE`.
