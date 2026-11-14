# Scholl SALBP-1 benchmark

Data: Scholl (1993), assembly-line-balancing.de, `SALBP-data-sets.zip` sha256 `cf7a5f89e034dee8fe67b305c37399920926dd174f409b96c189653ed35bb78c`.
Limits per instance: 4000000 nodes, 4000 ms. Node v22.23.4. Every balance re-checked by `checkBalance`.

- Instances: 269
- Same value as the published optimum: 258 of 269
- Proved optimal by this engine within the limits: 249 of 269
- Worse than the published best: 10; better than the published upper bound: 0
- Solver time, sum over instances: 153.1 s (wall 153.2 s)

| Graph | Cycle time | Tasks | Published m* | This engine | Proved | Nodes | ms |
|---|---:|---:|---:|---:|---|---:|---:|
| Arcus1 | 3786 | 83 | 21 | 21 | yes | 257 | 7 |
| Arcus1 | 3985 | 83 | 20 | 20 | yes | 246 | 7 |
| Arcus1 | 4206 | 83 | 19 | 19 | yes | 0 | 1 |
| Arcus1 | 4454 | 83 | 18 | 18 | yes | 0 | 0 |
| Arcus1 | 4732 | 83 | 17 | 17 | yes | 0 | 0 |
| Arcus1 | 5048 | 83 | 16 | 16 | yes | 6 | 1 |
| Arcus1 | 5408 | 83 | 15 | 15 | yes | 6 | 1 |
| Arcus1 | 5824 | 83 | 14 | 14 | yes | 0 | 1 |
| Arcus1 | 5853 | 83 | 14 | 14 | yes | 0 | 0 |
| Arcus1 | 6309 | 83 | 13 | 13 | yes | 0 | 0 |
| Arcus1 | 6842 | 83 | 12 | 12 | yes | 0 | 1 |
| Arcus1 | 6883 | 83 | 12 | 12 | yes | 0 | 1 |
| Arcus1 | 7571 | 83 | 11 | 11 | yes | 0 | 0 |
| Arcus1 | 8412 | 83 | 10 | 10 | yes | 16 | 1 |
| Arcus1 | 8898 | 83 | 9 | 9 | yes | 0 | 1 |
| Arcus1 | 10816 | 83 | 8 | 8 | yes | 21 | 1 |
| Arcus2 | 5755 | 111 | 27 | 27 | yes | 0 | 1 |
| Arcus2 | 5785 | 111 | 27 | 27 | yes | 0 | 0 |
| Arcus2 | 6016 | 111 | 26 | 26 | yes | 0 | 0 |
| Arcus2 | 6267 | 111 | 25 | 25 | yes | 1 | 0 |
| Arcus2 | 6540 | 111 | 24 | 24 | yes | 1 | 0 |
| Arcus2 | 6837 | 111 | 23 | 23 | yes | 1 | 0 |
| Arcus2 | 7162 | 111 | 22 | 22 | yes | 1 | 1 |
| Arcus2 | 7520 | 111 | 21 | 21 | no (LB 20) | 3575808 | 4003 |
| Arcus2 | 7916 | 111 | 20 | 20 | yes | 13 | 1 |
| Arcus2 | 8356 | 111 | 19 | 19 | yes | 9 | 1 |
| Arcus2 | 8847 | 111 | 18 | 18 | yes | 16 | 1 |
| Arcus2 | 9400 | 111 | 17 | 17 | yes | 11 | 1 |
| Arcus2 | 10027 | 111 | 16 | 16 | yes | 29 | 1 |
| Arcus2 | 10743 | 111 | 15 | 15 | yes | 28 | 1 |
| Arcus2 | 11378 | 111 | 14 | 14 | yes | 0 | 1 |
| Arcus2 | 11570 | 111 | 13 | 13 | yes | 1640269 | 1475 |
| Arcus2 | 17067 | 111 | 9 | 9 | yes | 0 | 1 |
| Barthol2 | 84 | 148 | 51 | 51 | yes | 252938 | 596 |
| Barthol2 | 85 | 148 | 50 | 52 | no (LB 50) | 1982464 | 4005 |
| Barthol2 | 87 | 148 | 49 | 49 | yes | 827552 | 2067 |
| Barthol2 | 89 | 148 | 48 | 48 | yes | 867145 | 2067 |
| Barthol2 | 91 | 148 | 47 | 47 | yes | 463768 | 1145 |
| Barthol2 | 93 | 148 | 46 | 46 | yes | 65048 | 163 |
| Barthol2 | 95 | 148 | 45 | 45 | yes | 754140 | 2082 |
| Barthol2 | 97 | 148 | 44 | 44 | yes | 147267 | 340 |
| Barthol2 | 99 | 148 | 43 | 43 | yes | 898324 | 2089 |
| Barthol2 | 101 | 148 | 42 | 44 | no (LB 42) | 1880064 | 4002 |
| Barthol2 | 104 | 148 | 41 | 41 | yes | 144881 | 359 |
| Barthol2 | 106 | 148 | 40 | 40 | yes | 1067907 | 2127 |
| Barthol2 | 109 | 148 | 39 | 39 | yes | 751090 | 2078 |
| Barthol2 | 112 | 148 | 38 | 38 | yes | 539 | 3 |
| Barthol2 | 115 | 148 | 37 | 37 | yes | 4858 | 13 |
| Barthol2 | 118 | 148 | 36 | 36 | yes | 90702 | 209 |
| Barthol2 | 121 | 148 | 35 | 35 | yes | 1431903 | 2029 |
| Barthol2 | 125 | 148 | 34 | 34 | yes | 3996 | 7 |
| Barthol2 | 129 | 148 | 33 | 33 | yes | 1054 | 3 |
| Barthol2 | 133 | 148 | 32 | 32 | yes | 511 | 2 |
| Barthol2 | 137 | 148 | 31 | 31 | yes | 569 | 2 |
| Barthol2 | 142 | 148 | 30 | 30 | yes | 510 | 2 |
| Barthol2 | 146 | 148 | 29 | 29 | yes | 797708 | 928 |
| Barthol2 | 152 | 148 | 28 | 28 | yes | 542 | 2 |
| Barthol2 | 157 | 148 | 27 | 27 | yes | 846 | 3 |
| Barthol2 | 163 | 148 | 26 | 26 | yes | 679 | 3 |
| Barthol2 | 170 | 148 | 25 | 25 | yes | 660 | 3 |
| Barthold | 403 | 148 | 14 | 14 | yes | 311 | 2 |
| Barthold | 434 | 148 | 13 | 13 | yes | 298 | 2 |
| Barthold | 470 | 148 | 12 | 12 | yes | 273 | 2 |
| Barthold | 513 | 148 | 11 | 11 | yes | 277 | 1 |
| Barthold | 564 | 148 | 10 | 10 | yes | 277 | 2 |
| Barthold | 626 | 148 | 9 | 9 | yes | 681 | 2 |
| Barthold | 705 | 148 | 8 | 8 | yes | 244 | 1 |
| Barthold | 805 | 148 | 7 | 7 | yes | 350 | 1 |
| Bowman | 20 | 8 | 5 | 5 | yes | 0 | 0 |
| Buxey | 27 | 29 | 13 | 13 | yes | 118 | 0 |
| Buxey | 30 | 29 | 12 | 12 | yes | 5791 | 4 |
| Buxey | 33 | 29 | 11 | 11 | yes | 4677 | 3 |
| Buxey | 36 | 29 | 10 | 10 | yes | 834 | 1 |
| Buxey | 41 | 29 | 8 | 8 | yes | 0 | 0 |
| Buxey | 47 | 29 | 7 | 7 | yes | 716 | 1 |
| Buxey | 54 | 29 | 7 | 7 | yes | 1421 | 1 |
| Gunther | 41 | 35 | 14 | 14 | yes | 2476 | 2 |
| Gunther | 44 | 35 | 12 | 12 | yes | 100 | 0 |
| Gunther | 49 | 35 | 11 | 11 | yes | 863 | 1 |
| Gunther | 54 | 35 | 9 | 9 | yes | 0 | 0 |
| Gunther | 61 | 35 | 9 | 9 | yes | 1131 | 5 |
| Gunther | 69 | 35 | 8 | 8 | yes | 189 | 0 |
| Gunther | 81 | 35 | 7 | 7 | yes | 4139 | 2 |
| Hahn | 2004 | 53 | 8 | 8 | yes | 0 | 0 |
| Hahn | 2338 | 53 | 7 | 7 | yes | 0 | 1 |
| Hahn | 2806 | 53 | 6 | 6 | yes | 69 | 0 |
| Hahn | 3507 | 53 | 5 | 5 | yes | 0 | 0 |
| Hahn | 4676 | 53 | 4 | 4 | yes | 0 | 1 |
| Heskiaoff | 138 | 28 | 8 | 8 | yes | 0 | 0 |
| Heskiaoff | 205 | 28 | 5 | 5 | yes | 0 | 0 |
| Heskiaoff | 216 | 28 | 5 | 5 | yes | 0 | 0 |
| Heskiaoff | 256 | 28 | 4 | 4 | yes | 0 | 0 |
| Heskiaoff | 324 | 28 | 4 | 4 | yes | 0 | 0 |
| Heskiaoff | 342 | 28 | 3 | 3 | yes | 0 | 0 |
| Jackson | 7 | 11 | 8 | 8 | yes | 21 | 0 |
| Jackson | 9 | 11 | 6 | 6 | yes | 0 | 0 |
| Jackson | 10 | 11 | 5 | 5 | yes | 39 | 0 |
| Jackson | 13 | 11 | 4 | 4 | yes | 0 | 0 |
| Jackson | 14 | 11 | 4 | 4 | yes | 0 | 0 |
| Jackson | 21 | 11 | 3 | 3 | yes | 0 | 0 |
| Jaeschke | 6 | 9 | 8 | 8 | yes | 0 | 0 |
| Jaeschke | 7 | 9 | 7 | 7 | yes | 0 | 0 |
| Jaeschke | 8 | 9 | 6 | 6 | yes | 0 | 0 |
| Jaeschke | 10 | 9 | 4 | 4 | yes | 0 | 0 |
| Jaeschke | 18 | 9 | 3 | 3 | yes | 0 | 0 |
| Kilbridge | 56 | 45 | 10 | 10 | yes | 0 | 0 |
| Kilbridge | 57 | 45 | 10 | 10 | yes | 0 | 1 |
| Kilbridge | 62 | 45 | 9 | 9 | yes | 143 | 0 |
| Kilbridge | 69 | 45 | 8 | 8 | yes | 971 | 1 |
| Kilbridge | 79 | 45 | 7 | 7 | yes | 216 | 0 |
| Kilbridge | 92 | 45 | 6 | 6 | yes | 275 | 0 |
| Kilbridge | 110 | 45 | 6 | 6 | yes | 0 | 0 |
| Kilbridge | 111 | 45 | 5 | 5 | yes | 0 | 0 |
| Kilbridge | 138 | 45 | 4 | 4 | yes | 147 | 1 |
| Kilbridge | 184 | 45 | 3 | 3 | yes | 0 | 0 |
| Lutz1 | 1414 | 32 | 11 | 11 | yes | 10 | 0 |
| Lutz1 | 1572 | 32 | 10 | 10 | yes | 10 | 0 |
| Lutz1 | 1768 | 32 | 9 | 9 | yes | 16 | 0 |
| Lutz1 | 2020 | 32 | 8 | 8 | yes | 18 | 1 |
| Lutz1 | 2357 | 32 | 7 | 7 | yes | 21 | 0 |
| Lutz1 | 2828 | 32 | 6 | 6 | yes | 22 | 0 |
| Lutz2 | 11 | 89 | 49 | 49 | yes | 669441 | 1065 |
| Lutz2 | 12 | 89 | 44 | 44 | yes | 331905 | 460 |
| Lutz2 | 13 | 89 | 40 | 40 | yes | 576967 | 830 |
| Lutz2 | 14 | 89 | 37 | 37 | yes | 1125055 | 1377 |
| Lutz2 | 15 | 89 | 34 | 34 | yes | 1180966 | 1385 |
| Lutz2 | 16 | 89 | 31 | 31 | yes | 1344 | 2 |
| Lutz2 | 17 | 89 | 29 | 29 | yes | 724 | 2 |
| Lutz2 | 18 | 89 | 28 | 28 | yes | 524 | 1 |
| Lutz2 | 19 | 89 | 26 | 26 | yes | 675 | 1 |
| Lutz2 | 20 | 89 | 25 | 25 | yes | 371 | 0 |
| Lutz2 | 21 | 89 | 24 | 24 | yes | 388 | 1 |
| Lutz3 | 75 | 89 | 23 | 23 | yes | 269 | 1 |
| Lutz3 | 79 | 89 | 22 | 22 | yes | 31077 | 31 |
| Lutz3 | 83 | 89 | 21 | 21 | yes | 32570 | 33 |
| Lutz3 | 87 | 89 | 20 | 20 | yes | 0 | 0 |
| Lutz3 | 92 | 89 | 19 | 19 | yes | 3542 | 4 |
| Lutz3 | 97 | 89 | 18 | 18 | yes | 210 | 1 |
| Lutz3 | 103 | 89 | 17 | 17 | yes | 0 | 0 |
| Lutz3 | 110 | 89 | 15 | 15 | yes | 5786 | 5 |
| Lutz3 | 118 | 89 | 14 | 14 | yes | 2246 | 3 |
| Lutz3 | 127 | 89 | 14 | 14 | yes | 11552 | 13 |
| Lutz3 | 137 | 89 | 13 | 13 | yes | 70 | 0 |
| Lutz3 | 150 | 89 | 12 | 12 | yes | 43635 | 38 |
| Mansoor | 48 | 11 | 4 | 4 | yes | 0 | 0 |
| Mansoor | 62 | 11 | 3 | 3 | yes | 0 | 0 |
| Mansoor | 94 | 11 | 2 | 2 | yes | 0 | 0 |
| Mertens | 6 | 7 | 6 | 6 | yes | 0 | 0 |
| Mertens | 7 | 7 | 5 | 5 | yes | 0 | 0 |
| Mertens | 8 | 7 | 5 | 5 | yes | 0 | 0 |
| Mertens | 10 | 7 | 3 | 3 | yes | 0 | 0 |
| Mertens | 15 | 7 | 2 | 2 | yes | 0 | 0 |
| Mertens | 18 | 7 | 2 | 2 | yes | 0 | 0 |
| Mitchell | 14 | 21 | 8 | 8 | yes | 0 | 0 |
| Mitchell | 15 | 21 | 8 | 8 | yes | 4 | 0 |
| Mitchell | 21 | 21 | 5 | 5 | yes | 0 | 0 |
| Mitchell | 26 | 21 | 5 | 5 | yes | 0 | 0 |
| Mitchell | 35 | 21 | 3 | 3 | yes | 0 | 0 |
| Mitchell | 39 | 21 | 3 | 3 | yes | 0 | 0 |
| Mukherje | 176 | 94 | 25 | 25 | yes | 0 | 0 |
| Mukherje | 183 | 94 | 24 | 24 | yes | 0 | 1 |
| Mukherje | 192 | 94 | 23 | 23 | yes | 0 | 1 |
| Mukherje | 201 | 94 | 22 | 22 | yes | 284 | 1 |
| Mukherje | 211 | 94 | 21 | 21 | yes | 1253386 | 2004 |
| Mukherje | 222 | 94 | 20 | 20 | yes | 0 | 1 |
| Mukherje | 234 | 94 | 19 | 19 | yes | 0 | 3 |
| Mukherje | 248 | 94 | 18 | 18 | yes | 0 | 1 |
| Mukherje | 263 | 94 | 17 | 17 | yes | 0 | 0 |
| Mukherje | 281 | 94 | 16 | 16 | yes | 0 | 0 |
| Mukherje | 301 | 94 | 15 | 15 | yes | 0 | 0 |
| Mukherje | 324 | 94 | 14 | 14 | yes | 0 | 0 |
| Mukherje | 351 | 94 | 13 | 13 | yes | 1630218 | 2007 |
| Roszieg | 14 | 25 | 10 | 10 | yes | 0 | 0 |
| Roszieg | 16 | 25 | 8 | 8 | yes | 0 | 0 |
| Roszieg | 18 | 25 | 8 | 8 | yes | 0 | 0 |
| Roszieg | 21 | 25 | 6 | 6 | yes | 0 | 0 |
| Roszieg | 25 | 25 | 6 | 6 | yes | 3 | 0 |
| Roszieg | 32 | 25 | 4 | 4 | yes | 0 | 1 |
| Sawyer | 25 | 30 | 14 | 14 | yes | 478 | 2 |
| Sawyer | 27 | 30 | 13 | 13 | yes | 296 | 2 |
| Sawyer | 30 | 30 | 12 | 12 | yes | 16284 | 17 |
| Sawyer | 33 | 30 | 11 | 11 | yes | 11536 | 6 |
| Sawyer | 36 | 30 | 10 | 10 | yes | 2890 | 3 |
| Sawyer | 41 | 30 | 8 | 8 | yes | 0 | 0 |
| Sawyer | 47 | 30 | 7 | 7 | yes | 1593 | 1 |
| Sawyer | 54 | 30 | 7 | 7 | yes | 4157 | 2 |
| Sawyer | 75 | 30 | 5 | 5 | yes | 0 | 0 |
| Scholl | 1394 | 297 | 50 | 50 | yes | 412990 | 1116 |
| Scholl | 1422 | 297 | 50 | 50 | yes | 893859 | 2017 |
| Scholl | 1452 | 297 | 48 | 49 | no (LB 48) | 1716224 | 4012 |
| Scholl | 1483 | 297 | 47 | 48 | no (LB 47) | 1441792 | 4020 |
| Scholl | 1515 | 297 | 46 | 47 | no (LB 46) | 1462272 | 4008 |
| Scholl | 1548 | 297 | 46 | 46 | yes | 978972 | 2006 |
| Scholl | 1584 | 297 | 44 | 44 | yes | 1293778 | 3253 |
| Scholl | 1620 | 297 | 44 | 44 | yes | 880716 | 2005 |
| Scholl | 1659 | 297 | 42 | 43 | no (LB 42) | 1613824 | 4011 |
| Scholl | 1699 | 297 | 42 | 42 | no (LB 41) | 1560576 | 4009 |
| Scholl | 1742 | 297 | 40 | 40 | yes | 1332284 | 3067 |
| Scholl | 1787 | 297 | 39 | 39 | yes | 206329 | 558 |
| Scholl | 1834 | 297 | 38 | 38 | yes | 109398 | 257 |
| Scholl | 1883 | 297 | 37 | 37 | yes | 220198 | 453 |
| Scholl | 1935 | 297 | 36 | 37 | no (LB 36) | 1994752 | 4008 |
| Scholl | 1991 | 297 | 35 | 35 | yes | 141686 | 286 |
| Scholl | 2049 | 297 | 34 | 35 | no (LB 34) | 1871872 | 4010 |
| Scholl | 2111 | 297 | 33 | 33 | yes | 1165727 | 2324 |
| Scholl | 2177 | 297 | 32 | 32 | yes | 318089 | 705 |
| Scholl | 2247 | 297 | 31 | 31 | yes | 1360376 | 2912 |
| Scholl | 2322 | 297 | 30 | 30 | yes | 274519 | 503 |
| Scholl | 2402 | 297 | 29 | 29 | yes | 512122 | 919 |
| Scholl | 2488 | 297 | 28 | 28 | yes | 54651 | 103 |
| Scholl | 2580 | 297 | 27 | 27 | yes | 16270 | 29 |
| Scholl | 2680 | 297 | 26 | 26 | yes | 11891 | 22 |
| Scholl | 2787 | 297 | 25 | 25 | yes | 6068 | 12 |
| Tonge | 160 | 70 | 23 | 23 | yes | 16866 | 20 |
| Tonge | 168 | 70 | 22 | 22 | yes | 119724 | 124 |
| Tonge | 176 | 70 | 21 | 21 | yes | 7176 | 8 |
| Tonge | 185 | 70 | 20 | 20 | yes | 31404 | 25 |
| Tonge | 195 | 70 | 19 | 19 | yes | 1581 | 4 |
| Tonge | 207 | 70 | 18 | 18 | yes | 155311 | 131 |
| Tonge | 220 | 70 | 17 | 17 | yes | 113064 | 110 |
| Tonge | 234 | 70 | 16 | 16 | yes | 24310 | 28 |
| Tonge | 251 | 70 | 14 | 14 | yes | 4299 | 4 |
| Tonge | 270 | 70 | 14 | 14 | yes | 3067 | 3 |
| Tonge | 293 | 70 | 13 | 13 | yes | 105252 | 84 |
| Tonge | 320 | 70 | 11 | 11 | yes | 731 | 1 |
| Tonge | 364 | 70 | 10 | 10 | yes | 0 | 0 |
| Tonge | 410 | 70 | 9 | 9 | yes | 0 | 0 |
| Tonge | 468 | 70 | 8 | 8 | yes | 0 | 0 |
| Tonge | 527 | 70 | 7 | 7 | yes | 0 | 0 |
| Warnecke | 54 | 58 | 31 | 31 | yes | 1342716 | 2186 |
| Warnecke | 56 | 58 | 29 | 29 | yes | 1204908 | 1472 |
| Warnecke | 58 | 58 | 29 | 29 | yes | 1918108 | 2823 |
| Warnecke | 60 | 58 | 27 | 27 | yes | 625767 | 754 |
| Warnecke | 62 | 58 | 27 | 27 | yes | 1301471 | 2033 |
| Warnecke | 65 | 58 | 25 | 25 | yes | 170379 | 159 |
| Warnecke | 68 | 58 | 24 | 24 | yes | 1628500 | 2010 |
| Warnecke | 71 | 58 | 23 | 23 | yes | 1572254 | 2009 |
| Warnecke | 74 | 58 | 22 | 22 | yes | 844182 | 758 |
| Warnecke | 78 | 58 | 21 | 21 | yes | 1644706 | 2005 |
| Warnecke | 82 | 58 | 20 | 20 | yes | 1900643 | 2003 |
| Warnecke | 86 | 58 | 19 | 19 | yes | 154855 | 114 |
| Warnecke | 92 | 58 | 17 | 17 | yes | 1771 | 2 |
| Warnecke | 97 | 58 | 17 | 17 | yes | 2000124 | 1816 |
| Warnecke | 104 | 58 | 15 | 15 | yes | 1769 | 12 |
| Warnecke | 111 | 58 | 14 | 14 | yes | 1338 | 2 |
| Wee-mag | 28 | 75 | 63 | 63 | yes | 0 | 0 |
| Wee-mag | 29 | 75 | 63 | 63 | yes | 0 | 0 |
| Wee-mag | 30 | 75 | 62 | 62 | yes | 515 | 1 |
| Wee-mag | 31 | 75 | 62 | 62 | yes | 0 | 0 |
| Wee-mag | 32 | 75 | 61 | 61 | no (LB 60) | 1310720 | 4012 |
| Wee-mag | 33 | 75 | 61 | 61 | no (LB 60) | 1245184 | 4010 |
| Wee-mag | 34 | 75 | 61 | 61 | no (LB 60) | 1236992 | 4195 |
| Wee-mag | 35 | 75 | 60 | 60 | yes | 0 | 1 |
| Wee-mag | 36 | 75 | 60 | 60 | yes | 0 | 0 |
| Wee-mag | 37 | 75 | 60 | 60 | yes | 0 | 0 |
| Wee-mag | 38 | 75 | 60 | 60 | yes | 0 | 1 |
| Wee-mag | 39 | 75 | 60 | 60 | yes | 0 | 1 |
| Wee-mag | 40 | 75 | 60 | 60 | yes | 0 | 0 |
| Wee-mag | 41 | 75 | 59 | 59 | yes | 0 | 0 |
| Wee-mag | 42 | 75 | 55 | 55 | yes | 0 | 1 |
| Wee-mag | 43 | 75 | 50 | 50 | yes | 0 | 1 |
| Wee-mag | 45 | 75 | 38 | 39 | no (LB 35) | 1903069 | 4003 |
| Wee-mag | 46 | 75 | 34 | 35 | no (LB 33) | 1794048 | 4006 |
| Wee-mag | 47 | 75 | [32, 33] | 33 | no (LB 32) | 1994752 | 4049 |
| Wee-mag | 49 | 75 | 32 | 32 | no (LB 31) | 2060288 | 4007 |
| Wee-mag | 50 | 75 | 32 | 32 | no (LB 31) | 2476805 | 4004 |
| Wee-mag | 52 | 75 | 31 | 31 | no (LB 30) | 1720320 | 4003 |
| Wee-mag | 54 | 75 | 31 | 31 | no (LB 30) | 1662976 | 4122 |
| Wee-mag | 56 | 75 | 30 | 30 | yes | 64042 | 133 |
