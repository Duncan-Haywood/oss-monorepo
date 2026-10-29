---
title: "We seeded 12 bugs in the child tax credit calculator; the tests caught 5"
date: 2026-10-29
tags: [child-tax-credit-calculator, testing]
description: "A red-team run on the free Child Tax Credit calculator: the original suite caught 5 of 12 seeded faults, six new tests lifted that to 11 of 11 non-equivalent ones."
---

The free [Child Tax Credit calculator](https://duncan-haywood.github.io/oss-monorepo/) did the arithmetic right, but its tests only checked the numbers, not the explanatory notes a filer reads next to them. We seeded 12 small faults (a `>` turned into `>=`, an `&&` into `||`) into its calculation file. The suite caught 5.

Six escapes were real gaps, all in which note appears when: "Reduced by the phase-out" versus "Fully phased out", the Other Dependents note, and the earned-income-floor warning for a household with no qualifying child. Six new tests close them, and two more escapes were provably equivalent (they cannot change any output). No defect in the tax math itself turned up. The calculator is an estimate, not tax advice.
