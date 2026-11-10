# Description rules: per-class confusion and a corrected Seattle overlap (`src/desc_confusion.py`)

## held_out/chicago/v2 (n = 150)

| class | labelled | predicted | precision [95%] | recall [95%] |
|---|---|---|---|---|
| alteration | 34 | 29 | 0.86 [0.69, 0.95] | 0.74 [0.57, 0.85] |
| new_construction | 2 | 1 | 1.00 [0.21, 1.00] | 0.50 [0.09, 0.91] |
| electrical | 66 | 65 | 0.92 [0.83, 0.97] | 0.91 [0.82, 0.96] |
| plumbing | 2 | 5 | 0.20 [0.04, 0.62] | 0.50 [0.09, 0.91] |
| mechanical | 3 | 1 | 0.00 [0.00, 0.79] | 0.00 [0.00, 0.56] |
| demolition | 0 | 1 | 0.00 [0.00, 0.79] | - [-, -] |
| fire | 8 | 7 | 1.00 [0.65, 1.00] | 0.88 [0.53, 0.98] |
| other | 35 | 41 | 0.83 [0.69, 0.91] | 0.97 [0.85, 0.99] |

Most frequent errors (label -> prediction): electrical -> other (5); alteration -> plumbing (4); alteration -> electrical (3); alteration -> demolition (1); alteration -> mechanical (1)

## held_out/seattle/v2 (n = 150)

| class | labelled | predicted | precision [95%] | recall [95%] |
|---|---|---|---|---|
| alteration | 101 | 101 | 0.98 [0.93, 0.99] | 0.98 [0.93, 0.99] |
| new_construction | 42 | 39 | 1.00 [0.91, 1.00] | 0.93 [0.81, 0.98] |
| demolition | 0 | 1 | 0.00 [0.00, 0.79] | - [-, -] |
| other | 7 | 9 | 0.56 [0.27, 0.81] | 0.71 [0.36, 0.92] |

Most frequent errors (label -> prediction): alteration -> other (2); new_construction -> other (2); other -> alteration (2); new_construction -> demolition (1)

## held_out/chicago/v1 (n = 150)

| class | labelled | predicted | precision [95%] | recall [95%] |
|---|---|---|---|---|
| alteration | 34 | 38 | 0.61 [0.45, 0.74] | 0.68 [0.51, 0.81] |
| new_construction | 2 | 10 | 0.10 [0.02, 0.40] | 0.50 [0.09, 0.91] |
| electrical | 66 | 38 | 0.87 [0.73, 0.94] | 0.50 [0.38, 0.62] |
| plumbing | 2 | 8 | 0.12 [0.02, 0.47] | 0.50 [0.09, 0.91] |
| mechanical | 3 | 3 | 0.33 [0.06, 0.79] | 0.33 [0.06, 0.79] |
| demolition | 0 | 1 | 0.00 [0.00, 0.79] | - [-, -] |
| fire | 8 | 4 | 1.00 [0.51, 1.00] | 0.50 [0.22, 0.78] |
| other | 35 | 48 | 0.56 [0.42, 0.69] | 0.77 [0.61, 0.88] |

Most frequent errors (label -> prediction): electrical -> other (18); electrical -> alteration (8); electrical -> new_construction (7); alteration -> plumbing (4); alteration -> electrical (3)

## held_out/seattle/v1 (n = 150)

| class | labelled | predicted | precision [95%] | recall [95%] |
|---|---|---|---|---|
| alteration | 101 | 97 | 0.98 [0.93, 0.99] | 0.94 [0.88, 0.97] |
| new_construction | 42 | 17 | 0.94 [0.73, 0.99] | 0.38 [0.25, 0.53] |
| demolition | 0 | 2 | 0.00 [0.00, 0.66] | - [-, -] |
| other | 7 | 34 | 0.18 [0.08, 0.34] | 0.86 [0.49, 0.97] |

Most frequent errors (label -> prediction): new_construction -> other (24); alteration -> other (4); alteration -> demolition (1); alteration -> new_construction (1); new_construction -> alteration (1)

## Seattle 2024 test shares corrected for rule error (held-out Seattle P(label | prediction))

| target | description part | overlap w/o other, as run | corrected [95% bootstrap] | overlap with other, as run | corrected |
|---|---|---|---|---|---|
| a2i | 0.907 | 0.501 | 0.501 [0.501, 0.501] | 0.538 | 0.538 |
| i2c | 0.912 | 0.448 | 0.448 [0.448, 0.448] | 0.451 | 0.451 |

| target | class | as run | corrected | sources |
|---|---|---|---|---|
| a2i | alteration | 0.632 | 0.632 | 0.403 |
| a2i | new_construction | 0.212 | 0.229 | 0.083 |
| a2i | electrical | 0.001 | 0.001 | 0.202 |
| a2i | plumbing | 0.000 | 0.000 | 0.127 |
| a2i | mechanical | 0.001 | 0.001 | 0.118 |
| a2i | demolition | 0.098 | 0.093 | 0.012 |
| a2i | sign | 0.000 | 0.000 | 0.017 |
| a2i | fire | 0.000 | 0.000 | 0.001 |
| a2i | other | 0.056 | 0.043 | 0.037 |
| i2c | alteration | 0.646 | 0.645 | 0.333 |
| i2c | new_construction | 0.204 | 0.220 | 0.104 |
| i2c | electrical | 0.002 | 0.002 | 0.217 |
| i2c | plumbing | 0.000 | 0.000 | 0.168 |
| i2c | mechanical | 0.002 | 0.002 | 0.163 |
| i2c | demolition | 0.092 | 0.088 | 0.007 |
| i2c | sign | 0.000 | 0.000 | 0.004 |
| i2c | other | 0.053 | 0.042 | 0.003 |

Post hoc, source side (a2i): shifting the source shares by Chicago's held-out v2 error, weighted by f = 0.210 (upper bound on Chicago's share of the pool), gives an overlap without other of 0.508 [0.500, 0.518].

Q1 held: Seattle new-construction recall 0.929; alteration precision Chicago 0.862, Seattle 0.980.
Q2 held: a2i overlap without other 0.501 as run, 0.501 corrected [0.501, 0.501].
