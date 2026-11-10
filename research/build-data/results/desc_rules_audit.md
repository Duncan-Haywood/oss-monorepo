# Description rules: per-class audit (session 72)

Recomputed by `python3 src/desc_eval.py audit` from the (label, v1, v2) codes in
`desc_rules_eval.json`; one labeller (the agent). Precision and recall with 95% Wilson intervals;
classes with fewer than 5 labelled or predicted rows are left out of the table.

## held_out chicago

| rules | accuracy | kappa | top confusions (label->rules) |
|---|---|---|---|
| v1 | 0.600 | 0.469 | electrical->other 18, electrical->alteration 8, electrical->new_construction 7, alteration->plumbing 4 |
| v2 | 0.853 | 0.790 | electrical->other 5, alteration->plumbing 4, alteration->electrical 3, other->electrical 1 |

| class | n label | v2 precision [95%] | v2 recall [95%] | v1 precision | v1 recall |
|---|---|---|---|---|---|
| alteration | 34 | 0.86 [0.69, 0.95] | 0.74 [0.57, 0.85] | 0.61 | 0.68 |
| electrical | 66 | 0.92 [0.83, 0.97] | 0.91 [0.82, 0.96] | 0.87 | 0.50 |
| plumbing | 2 | 0.20 [0.04, 0.62] | 0.50 [0.09, 0.91] | 0.12 | 0.50 |
| fire | 8 | 1.00 [0.65, 1.00] | 0.88 [0.53, 0.98] | 1.00 | 0.50 |
| other | 35 | 0.83 [0.69, 0.91] | 0.97 [0.85, 0.99] | 0.56 | 0.77 |

## held_out seattle

| rules | accuracy | kappa | top confusions (label->rules) |
|---|---|---|---|
| v1 | 0.780 | 0.579 | new_construction->other 24, alteration->other 4, new_construction->demolition 1, alteration->demolition 1 |
| v2 | 0.953 | 0.901 | other->alteration 2, alteration->other 2, new_construction->other 2, new_construction->demolition 1 |

| class | n label | v2 precision [95%] | v2 recall [95%] | v1 precision | v1 recall |
|---|---|---|---|---|---|
| alteration | 101 | 0.98 [0.93, 0.99] | 0.98 [0.93, 0.99] | 0.98 | 0.94 |
| new_construction | 42 | 1.00 [0.91, 1.00] | 0.93 [0.81, 0.98] | 0.94 | 0.38 |
| other | 7 | 0.56 [0.27, 0.81] | 0.71 [0.36, 0.92] | 0.18 | 0.86 |

## dev chicago

| rules | accuracy | kappa | top confusions (label->rules) |
|---|---|---|---|
| v1 | 0.560 | 0.423 | electrical->other 22, electrical->alteration 16, electrical->new_construction 15, fire->alteration 6 |
| v2 | 0.925 | 0.895 | alteration->electrical 3, electrical->alteration 2, plumbing->alteration 1, alteration->other 1 |

| class | n label | v2 precision [95%] | v2 recall [95%] | v1 precision | v1 recall |
|---|---|---|---|---|---|
| alteration | 54 | 0.92 [0.82, 0.97] | 0.89 [0.78, 0.95] | 0.62 | 0.83 |
| electrical | 81 | 0.95 [0.88, 0.98] | 0.95 [0.88, 0.98] | 0.78 | 0.35 |
| plumbing | 5 | 0.80 [0.38, 0.96] | 0.80 [0.38, 0.96] | 0.43 | 0.60 |
| fire | 9 | 1.00 [0.68, 1.00] | 0.89 [0.57, 0.98] | 1.00 | 0.22 |
| other | 45 | 0.93 [0.82, 0.98] | 0.96 [0.85, 0.99] | 0.54 | 0.69 |

## dev seattle

| rules | accuracy | kappa | top confusions (label->rules) |
|---|---|---|---|
| v1 | 0.770 | 0.563 | new_construction->other 25, alteration->other 11, alteration->new_construction 4, new_construction->mechanical 2 |
| v2 | 0.965 | 0.925 | alteration->other 2, alteration->new_construction 2, new_construction->mechanical 1, electrical->alteration 1 |

| class | n label | v2 precision [95%] | v2 recall [95%] | v1 precision | v1 recall |
|---|---|---|---|---|---|
| alteration | 138 | 0.99 [0.96, 1.00] | 0.97 [0.93, 0.99] | 0.98 | 0.88 |
| new_construction | 52 | 0.96 [0.87, 0.99] | 0.98 [0.90, 1.00] | 0.86 | 0.46 |
| other | 6 | 0.75 [0.41, 0.93] | 1.00 [0.61, 1.00] | 0.14 | 1.00 |

