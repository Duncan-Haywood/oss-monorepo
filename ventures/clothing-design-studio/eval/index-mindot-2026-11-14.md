# No single dots: eval output, 2026-11-14

Command: `PAINTINGS_CACHE=<dir> node eval/index-mindot.mjs 3` (nine public-domain paintings at up to 640 px, 28 cm wide, flat inks dotted; mean CIE76 delta E after the 1-arcminute blur at 0.5 / 1 / 3 m; "lost" = the same films on a press that loses every single dot, `loseLoneDots`). Search passes are judged at 1 m. Re-run twice; identical output.

```
#ffffff 3 starry_night             lone 4.5% plain 19.26/13.52/9.8 lost 20.53/15.98/12.87 | clean 19.34/13.55/9.79 832 ms | clean+search 19.3/13.01/9.54 2849 ms | search alone 19.43/12.67/9.61 lost 20.91/15.96/13.28 | left 0
#ffffff 3 the_scream               lone 7.2% plain 15.52/11.91/9.05 lost 18.23/17.08/16.66 | clean 14.75/12.07/9.42 1175 ms | clean+search 13.82/11.45/9.48 3692 ms | search alone 14/10.87/9.14 lost 17.55/16.82/16.99 | left 0
#ffffff 3 shipwreck                lone 4.5% plain 13.61/10.15/9.59 lost 15.82/15.07/15.93 | clean 13.35/10.24/9.58 640 ms | clean+search 13.2/9.87/9.65 2417 ms | search alone 13.68/9.45/9.48 lost 16.1/15.01/16.17 | left 0
#ffffff 3 woman-with-hat-matisse   lone 9.5% plain 23.41/19.1/15.98 lost 24.82/21.78/19.61 | clean 22.66/19.07/15.79 955 ms | clean+search 22.12/18.69/15.55 3086 ms | search alone 22.42/18.12/15.22 lost 23.77/21.09/19.06 | left 0
#ffffff 3 wave                     lone 2.2% plain 13.99/9.83/7.44 lost 15/11.43/9.2 | clean 13.99/9.72/7.29 400 ms | clean+search 13.09/8.85/6.98 1270 ms | search alone 13.07/8.56/7.04 lost 14.55/11.01/9.43 | left 0
#ffffff 3 udnie                    lone 10.4% plain 17.4/12.78/10.91 lost 19.33/16.34/15.92 | clean 16.98/13.32/11.36 905 ms | clean+search 16.44/12.81/11.08 2837 ms | search alone 15.71/12.04/10.92 lost 18.27/16.32/16.24 | left 0
#ffffff 3 sassoferrato_madonna     lone 4.7% plain 15.8/11.19/9.66 lost 17.94/16.43/16.4 | clean 15.72/11.26/9.66 853 ms | clean+search 15.63/10.83/9.57 3268 ms | search alone 15.86/10.42/9.61 lost 18.44/17.21/18.11 | left 0
#ffffff 3 barocci                  lone 4.3% plain 12.08/8.93/7.7 lost 15.09/14.7/15.17 | clean 11.93/9.11/7.76 752 ms | clean+search 11.63/8.9/7.85 2647 ms | search alone 11.49/8.55/7.9 lost 15.42/16.07/17.73 | left 0
#ffffff 3 munch_madonna            lone 5% plain 11.84/11.84/7.99 lost 13.65/13.65/10.89 | clean 11.73/11.73/8.67 144 ms | clean+search 11.25/11.25/8.94 504 ms | search alone 11.18/11.18/9.05 lost 11.48/11.48/9.35 | left 0
#ffffff 4 starry_night             lone 5.7% plain 17.01/11.2/7.38 lost 18.77/14.43/11.54 | clean 17/11.14/7.35 822 ms | clean+search 16.75/10.32/6.95 3144 ms | search alone 16.8/9.84/7.03 lost 19.13/14.53/12.48 | left 0
#ffffff 4 the_scream               lone 8.8% plain 13.39/10.09/7.51 lost 17.17/17.06/17.36 | clean 12.56/10.18/7.78 1034 ms | clean+search 11.72/9.5/7.67 3757 ms | search alone 11.93/8.93/7.35 lost 16.75/16.84/17.61 | left 0
#ffffff 4 shipwreck                lone 6.1% plain 12.27/8.91/8.52 lost 15.77/15.82/17.15 | clean 11.98/8.99/8.64 671 ms | clean+search 11.71/8.49/8.58 2537 ms | search alone 12.01/8.08/8.44 lost 15.85/15.88/17.64 | left 0
#ffffff 4 woman-with-hat-matisse   lone 9.5% plain 21.71/17.1/13.67 lost 23.19/20.17/18.2 | clean 21.08/17.35/13.8 892 ms | clean+search 20.3/16.84/13.5 3317 ms | search alone 19.97/16.02/13.11 lost 21.75/19.36/17.69 | left 0
#ffffff 4 wave                     lone 3.3% plain 12.68/8.53/6.56 lost 14.65/11.79/10.21 | clean 12.72/8.42/6.41 418 ms | clean+search 12.13/7.68/6.12 1514 ms | search alone 12.01/7.27/6.17 lost 14.75/12.15/11.25 | left 0
#ffffff 4 udnie                    lone 14.9% plain 17.71/11.84/9.33 lost 20.44/17.46/17.35 | clean 16.4/12.29/10.17 809 ms | clean+search 15.73/11.78/9.97 3123 ms | search alone 15.55/11.04/9.63 lost 18.21/16.02/15.95 | left 0
#ffffff 4 sassoferrato_madonna     lone 5.2% plain 15.88/11.22/9.65 lost 18.05/16.83/17.02 | clean 15.56/11.14/9.53 701 ms | clean+search 15.55/10.73/9.43 3039 ms | search alone 15.76/10.27/9.46 lost 18.31/17.04/17.94 | left 0
#ffffff 4 barocci                  lone 4.8% plain 10.09/7.31/6.36 lost 13.84/14.57/15.59 | clean 9.96/7.46/6.38 812 ms | clean+search 9.65/7.16/6.38 3110 ms | search alone 9.73/6.8/6.25 lost 14.42/15.59/17.43 | left 0
#ffffff 4 munch_madonna            lone 6.8% plain 9.6/9.6/6.08 lost 12.28/12.28/10.47 | clean 9.41/9.41/6.74 155 ms | clean+search 9/9/6.91 639 ms | search alone 8.7/8.7/6.87 lost 9.29/9.29/7.55 | left 0
#ffffff 6 starry_night             lone 7.8% plain 15.52/10.03/6.43 lost 18.09/14.42/12.1 | clean 15.52/9.89/6.34 872 ms | clean+search 15.15/8.86/5.77 3282 ms | search alone 15.22/8.3/5.8 lost 18.59/14.73/13.29 | left 0
#ffffff 6 the_scream               lone 11.8% plain 12.02/8.61/6.14 lost 17.61/18.46/19.87 | clean 11.06/8.74/6.57 1100 ms | clean+search 10.18/7.89/6.14 4068 ms | search alone 10.35/7.23/5.8 lost 18.12/19.54/21.57 | left 0
#ffffff 6 shipwreck                lone 6.9% plain 10.5/7.9/7.85 lost 14.78/15.9/17.81 | clean 10.22/7.88/7.85 690 ms | clean+search 9.98/7.32/7.65 2629 ms | search alone 10.37/6.81/7.41 lost 15.73/17.04/19.39 | left 0
#ffffff 6 woman-with-hat-matisse   lone 14.7% plain 18.59/13.69/9.72 lost 21.91/19.55/18.74 | clean 17.53/13.99/10.18 1097 ms | clean+search 17.18/13.7/10.02 3695 ms | search alone 17.55/13/9.64 lost 20.77/18.52/17.55 | left 0
#ffffff 6 wave                     lone 4.9% plain 11.09/7.5/5.66 lost 14.3/12.35/11.05 | clean 11.01/7.32/5.47 423 ms | clean+search 10.33/6.49/5.13 1611 ms | search alone 10.12/5.94/5.14 lost 14.24/12.56/12.1 | left 0
#ffffff 6 udnie                    lone 15% plain 16.05/10.67/7.81 lost 19.44/17.03/17.05 | clean 15.02/11.14/8.84 934 ms | clean+search 14.48/10.71/8.72 2675 ms | search alone 14.54/9.88/8.24 lost 18.63/16.79/17.12 | left 0
#ffffff 6 sassoferrato_madonna     lone 8% plain 13.11/7.91/6.12 lost 17.3/18.2/19.43 | clean 12.46/7.82/6.51 765 ms | clean+search 12.11/7.43/6.41 3252 ms | search alone 12.38/6.87/6.11 lost 16.85/18/19.41 | left 0
#ffffff 6 barocci                  lone 6.8% plain 8.58/6.13/5.31 lost 13.97/16.02/18.1 | clean 8.33/6.26/5.41 837 ms | clean+search 8.03/5.85/5.25 2762 ms | search alone 8.22/5.37/4.97 lost 14.74/17.42/20.2 | left 0
#ffffff 6 munch_madonna            lone 8.2% plain 7.99/7.99/5.09 lost 11.87/11.87/11.28 | clean 7.63/7.63/5.39 153 ms | clean+search 7.11/7.11/5.28 530 ms | search alone 6.73/6.73/5.17 lost 7.76/7.76/6.55 | left 0
#1b1b1d 4 starry_night             lone 6.1% plain 18.31/12.92/8.97 lost 19.16/14.01/10.09 | clean 18.07/12.55/8.66 918 ms | clean+search 17.12/10.53/7.46 3578 ms | search alone 17.01/9.98/7.27 lost 18.81/12.53/9.7 | left 0
#1b1b1d 4 the_scream               lone 9.1% plain 13.55/10.3/8.15 lost 15.15/12.28/10.22 | clean 12.9/10.39/8.31 1062 ms | clean+search 11.98/9.1/7.03 3955 ms | search alone 11.88/8.53/6.73 lost 14.63/11.51/9.45 | left 0
#1b1b1d 4 shipwreck                lone 4% plain 13.01/10.18/9.17 lost 13.96/11.46/10.27 | clean 12.91/10.09/8.97 706 ms | clean+search 12.22/8.42/7.45 2645 ms | search alone 11.48/7.24/6.4 lost 13.28/9.24/8.13 | left 0
#1b1b1d 4 woman-with-hat-matisse   lone 10.1% plain 20.61/16.87/14.12 lost 22.52/19.06/16.14 | clean 19.98/17.08/14.29 885 ms | clean+search 19.73/16.56/13.82 3531 ms | search alone 19.55/15.82/13.35 lost 22.31/19.14/16.44 | left 0
#1b1b1d 4 wave                     lone 3% plain 12.36/8.85/7.69 lost 13.7/10.27/8.88 | clean 12.37/8.74/7.51 463 ms | clean+search 12.15/7.68/7.25 1441 ms | search alone 11.78/7.24/7.13 lost 13.62/9.31/8.88 | left 0
#1b1b1d 4 udnie                    lone 13.1% plain 16.6/11.89/9.17 lost 18.84/15.08/12.9 | clean 15.49/12.26/10.09 831 ms | clean+search 14.86/11.63/9.79 3012 ms | search alone 14.74/11.09/9.45 lost 17.33/13.94/12.15 | left 0
#1b1b1d 4 sassoferrato_madonna     lone 5.2% plain 16.25/12.27/10.32 lost 16.86/13.44/11.38 | clean 15.54/12.03/10.16 864 ms | clean+search 15.95/11.32/10.09 3409 ms | search alone 16.03/11.02/9.94 lost 17.23/12.54/11.25 | left 0
#1b1b1d 4 barocci                  lone 6% plain 10.02/7.12/5.61 lost 11.08/8.69/7.07 | clean 9.86/7.22/5.64 842 ms | clean+search 9.7/6.74/5.46 2755 ms | search alone 9.65/6.4/5.31 lost 10.96/8.34/7.2 | left 0
#1b1b1d 4 munch_madonna            lone 6.8% plain 8.96/8.96/5.83 lost 10.36/10.36/7.1 | clean 8.77/8.77/6.45 177 ms | clean+search 8.51/8.51/6.51 523 ms | search alone 8.2/8.2/6.54 lost 8.58/8.58/6.86 | left 0
```

| Garment, inks | Single dots | Plain dots | Plain, singles lost | No singles | No singles + 3 passes | Search alone | Search alone, singles lost | No singles + search closer than plain at 1 m |
|---|---|---|---|---|---|---|---|---|
| #ffffff, 3 | 5.81% | 15.88 / 12.14 / 9.79 | 17.82 / 15.83 / 14.74 | 15.61 / 12.23 / 9.92 | 15.16 / 11.74 / 9.85 | 15.20 / 11.32 / 9.77 | 17.39 / 15.66 / 15.15 | 8 of 9 |
| #ffffff, 4 | 7.23% | 14.48 / 10.64 / 8.34 | 17.13 / 15.60 / 14.99 | 14.07 / 10.71 / 8.53 | 13.62 / 10.17 / 8.39 | 13.61 / 9.66 / 8.26 | 16.50 / 15.19 / 15.06 | 9 of 9 |
| #ffffff, 6 | 9.34% | 12.61 / 8.94 / 6.68 | 16.59 / 15.98 / 16.16 | 12.09 / 8.96 / 6.95 | 11.62 / 8.37 / 6.71 | 11.72 / 7.79 / 6.48 | 16.16 / 15.82 / 16.35 | 7 of 9 |
| #1b1b1d, 4 | 7.04% | 14.41 / 11.04 / 8.78 | 15.74 / 12.74 / 10.45 | 13.99 / 11.01 / 8.90 | 13.58 / 10.05 / 8.32 | 13.37 / 9.50 / 8.01 | 15.19 / 11.68 / 10.01 | 9 of 9 |

Single dots left after cleanup + search: 0 in 36 runs. Time per run (median): cleanup 831 ms, with search 3012 ms.
