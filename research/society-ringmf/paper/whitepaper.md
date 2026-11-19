# A local mean-field for committed-robot blocks on a ring walking-side game

See [`../README.md`](../README.md) for the model, the threshold table and its limitations. Summary: a deterministic
fixed-point map (memory slots as independent draws) reproduces how the tipping robot share rises with block size and
falls with neighbourhood size, agrees with the simulation on tip/no-tip in 141 of 160 cells (11 where only the
simulation tips, 8 where only the map does), over-predicts the needed share for evenly spread robots (0.20 against 0.12
at k = 2) and tips at or below the simulation for blocks of 4 to 8. Corrected 2026-11-19 from a version whose 1/1000
lookup table froze slow fronts (see the README's audit correction). Reproduce with `experiments/run.py`. Prior work:
Xie et al. (2011), *Phys. Rev. E* 84, 011130; Centola et al. (2018), *Science* 360, 1116; Gleeson (2013), *Phys. Rev. X* 3, 021004; Young (1993), *Econometrica* 61, 57; Ellison (1993), *Econometrica* 61, 1047; Mobilia (2003), *Phys. Rev. Lett.* 91, 028701.
