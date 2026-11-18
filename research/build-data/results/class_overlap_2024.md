# Harmonised class overlap between cities, test year 2024

Made by `src/class_overlap.py` from the `class_share_test` field of `results/transfer_*.json`. Source mix = row-weighted mean of the source cities' test-year shares (the cities that run trained on) (a proxy for the training years, which those files do not store). Overlap = sum over classes of min(held-out share, source share); 1 = identical mix, 0 = no class in common.

| target | held out | sources | top class (share) | 'other' share | overlap | overlap without 'other' |
|---|---|---|---|---|---|---|
| a2i | austin | chicago, sf | electrical (0.31) | 0.22 | 0.22 | 0.00 |
| a2i | chicago | sf, austin | other (0.69) | 0.69 | 0.34 | 0.19 |
| a2i | seattle | chicago, sf, austin | other (0.91) | 0.91 | 0.32 | 0.01 |
| a2i | sf | chicago, austin | alteration (0.97) | 0.00 | 0.10 | 0.10 |
| i2c | austin | sf | electrical (0.32) | 0.21 | 0.00 | 0.00 |
| i2c | seattle | sf, austin | other (0.91) | 0.91 | 0.15 | 0.00 |
| i2c | sf | austin | alteration (0.98) | 0.00 | 0.00 | 0.00 |
