# A local mean-field for committed-robot blocks on a ring walking-side game

See [`../README.md`](../README.md) for the model, the threshold table and its limitations. Summary: a deterministic
fixed-point map (memory slots as independent draws) reproduces how the tipping robot share rises with block size and
falls with neighbourhood size, agrees with the simulation on tip/no-tip in 145 of 160 cells and over-predicts the
needed share for evenly spread robots (0.20 against 0.12 at k = 2). Reproduce with `experiments/run.py`. Prior work:
Xie et al. (2011), *Phys. Rev. E* 84, 011130; Centola et al. (2018), *Science* 360, 1116.
