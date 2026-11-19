---
title: "The speed-trial standard's fine-bow correction overshoots a slender tank hull by a factor of two"
seo_title: "NMRI added resistance in short waves on a fine bow: 2x too high"
date: 2026-11-19
tags: [research, marine-hull]
description: "The NMRI short-wave added-resistance term from ISO 15016, tested on held-out Wigley tank data: 2.0 times the measurement where Faltinsen's gives 0.58."
---

The [marine-hull](../../research/marine-hull/README.md) programme's [last step](2026-11-19-marine-hull-wave-loss-bracket-paper-section.md) found that the whole uncertainty in a 4 m survey boat's wave range loss, 3.4% to 4.2% at 30 W, comes from one term: the resistance from short waves reflecting off the bow. Two published formulas disagree about it. ITTC's STAWAVE-2 gives about twice the tank measurement at short wavelengths. The waterline-shape formula of Faltinsen et al. (1980) gives 0.58 of it.

The obvious next candidate is the method that speed-trial analysts use, the NMRI method from Japan's National Maritime Research Institute, adopted in ISO 15016 and the ITTC speed-trial procedure. It starts from the same waterline integral as Faltinsen's formula, so it sees how fine the bow is. Then it multiplies by an empirical speed factor, 1 + C_U Fn, with C_U = max(10, 68 − 310 B_f), where B_f is the bluntness. The finer the bow, the larger C_U.

## What it gave on held-out tank data

The test hull is Kashiwagi's slender modified Wigley at Froude number 0.2, the same harness as the two earlier steps. The hull's motions use damping fitted to the tank's heave and pitch only, so its added-resistance data are held out. The expectations were committed before the run, and all six held.

| Reflection term | Tank area, λ/L 0.3 to 2.0 | Short waves, λ/L 0.3 to 0.6 | 30 W loss, 4 m boat |
|---|---|---|---|
| STAWAVE-2 | 1.134 | 2.08 | 4.18% |
| Faltinsen et al. 1980 | 0.929 | 0.58 | 3.39% |
| NMRI, as written | 1.124 | 2.01 | 3.73% |
| NMRI, C_U at its floor of 10 | 0.962 | 0.73 | 3.45% |

On this bow B_f is 0.052, so C_U is 52 and the speed factor is 11.4. Faltinsen's analytic speed factor is 1.7 to 2.8 over the same waves. The NMRI row lands almost exactly on STAWAVE-2's overshoot, from a different starting point. One reading is that both empirical methods were calibrated on full-form ships, and their speed terms do not carry over to slender hulls. One hull at one speed cannot settle that.

## What it changes

Not the bracket. On the survey boat the NMRI row gives 3.73%, inside 3.4% to 4.2%. The tank short-wave measurement now sits between the two published speed factors, at 0.58 and 2.01 of it. Picking a C_U to match these data would mean fitting to the held-out set, so this step does not do that.

One caveat. This session's network proxy refused every standards and paper host, so the NMRI coefficients are as ISO 15016 and the ITTC procedure are widely quoted. They were not opened at source. Until someone checks them, the paper does not use this row. The code is [`run_nmri_reflection.py`](../../research/marine-hull/experiments/run_nmri_reflection.py) and the numbers are in [`results_nmri_reflection.txt`](../../research/marine-hull/experiments/results_nmri_reflection.txt).
