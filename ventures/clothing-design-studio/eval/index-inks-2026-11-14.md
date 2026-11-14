# Inks chosen for the dots: eval run, 2026-11-14

`node eval/index-inks.mjs` (PAINTINGS_CACHE set), the nine public-domain paintings of
`eval/index-paintings.mjs` decoded at up to 640 px in headless Chromium, printed 28 cm wide.
Values are mean CIE76 delta E after the 1-arcminute eye blur, at 0.5 / 1 / 3 m.
"index" is the dots with the flat separation's inks; "for N m" is `chooseIndexInks`
choosing for N m, then scored at all three distances. Times are on one CPU of the build
container, per choice (flat run + up to three fits and their index runs).

```
#ffffff 3 starry_night             flat 21.18/17.4/13.13 | index 19.26/13.52/9.8 | for 0.5 m: 19.19/11.5/7.61 2478 ms | for 1 m: 21.36/10.84/6.36 3484 ms | for 3 m: 25.11/11.64/6.56 5684 ms
#ffffff 3 the_scream               flat 12.84/12.35/11.22 | index 15.52/11.91/9.05 | for 0.5 m: 14.9/12.07/9.58 2746 ms | for 1 m: 16.16/11.61/8.21 2930 ms | for 3 m: 25.8/15.62/5.72 5373 ms
#ffffff 3 shipwreck                flat 12.52/12.16/12.1 | index 13.61/10.15/9.59 | for 0.5 m: 13.32/9.84/9.4 2014 ms | for 1 m: 14.77/9.14/7.94 2473 ms | for 3 m: 29.25/15.19/7.16 4894 ms
#ffffff 3 woman-with-hat-matisse   flat 21.25/20.56/18.77 | index 23.41/19.1/15.98 | for 0.5 m: 23.27/18.99/15.8 2323 ms | for 1 m: 23.98/19.02/15.58 2860 ms | for 3 m: 44.19/23.16/9.25 4230 ms
#ffffff 3 wave                     flat 14.47/11.89/9.15 | index 13.99/9.83/7.44 | for 0.5 m: 13.06/8.16/6.05 1813 ms | for 1 m: 15.01/7.39/4.9 2412 ms | for 3 m: 28.1/10.21/4.2 4183 ms
#ffffff 3 udnie                    flat 14.6/14.25/13.72 | index 17.4/12.78/10.91 | for 0.5 m: 14.82/11.98/10.74 1979 ms | for 1 m: 14.86/11.99/10.74 2375 ms | for 3 m: 33.68/16.05/6.77 4604 ms
#ffffff 3 sassoferrato_madonna     flat 14.89/13.88/12.69 | index 15.8/11.19/9.66 | for 0.5 m: 14.36/9.54/7.83 2484 ms | for 1 m: 15.21/8.92/6.91 3027 ms | for 3 m: 29.24/12.8/5.12 4878 ms
#ffffff 3 barocci                  flat 11.34/10.91/10.17 | index 12.08/8.93/7.7 | for 0.5 m: 11.99/8.64/7.09 1950 ms | for 1 m: 14.48/7.93/5.25 2592 ms | for 3 m: 15.09/8.27/5.12 5457 ms
#ffffff 3 munch_madonna            flat 10.58/10.58/8.8 | index 11.84/11.84/7.99 | for 0.5 m: 11.7/11.7/8.55 718 ms | for 1 m: 11.7/11.7/8.55 728 ms | for 3 m: 13.15/13.15/6.86 1325 ms
#ffffff 4 starry_night             flat 18.78/14.84/10.53 | index 17.01/11.2/7.38 | for 0.5 m: 17.01/11.2/7.38 (flat inks kept) 3277 ms | for 1 m: 22.37/9.01/3.25 4037 ms | for 3 m: 25.25/9.69/3.06 6749 ms
#ffffff 4 the_scream               flat 10.94/10.42/9.27 | index 13.39/10.09/7.51 | for 0.5 m: 13.39/10.09/7.51 (flat inks kept) 2333 ms | for 1 m: 14.06/9.65/6.32 3134 ms | for 3 m: 19.31/11.13/4.76 6364 ms
#ffffff 4 shipwreck                flat 11.09/10.66/10.68 | index 12.27/8.91/8.52 | for 0.5 m: 12.13/8.94/8.73 2168 ms | for 1 m: 13.38/8.63/7.73 3175 ms | for 3 m: 24.78/10.97/5.72 6678 ms
#ffffff 4 woman-with-hat-matisse   flat 19.04/18.29/16.39 | index 21.71/17.1/13.67 | for 0.5 m: 21.71/17.1/13.67 (flat inks kept) 2952 ms | for 1 m: 26.75/16.57/8.73 3979 ms | for 3 m: 40.5/21.03/5.11 8856 ms
#ffffff 4 wave                     flat 13.61/11.02/8.39 | index 12.68/8.53/6.56 | for 0.5 m: 12.05/7.2/5.62 2609 ms | for 1 m: 15.74/6.63/3.74 4086 ms | for 3 m: 24.24/8.55/3.29 6651 ms
#ffffff 4 udnie                    flat 13.75/13.37/12.85 | index 17.71/11.84/9.33 | for 0.5 m: 15.49/11/9.15 2522 ms | for 1 m: 15.58/11/9.01 3022 ms | for 3 m: 29.52/14.07/4.07 5716 ms
#ffffff 4 sassoferrato_madonna     flat 14.76/13.74/12.56 | index 15.88/11.22/9.65 | for 0.5 m: 12.59/8.86/7.48 3058 ms | for 1 m: 14.14/8.08/6.05 4019 ms | for 3 m: 22.66/10.89/4.92 5682 ms
#ffffff 4 barocci                  flat 10.46/9.9/8.93 | index 10.09/7.31/6.36 | for 0.5 m: 10.09/7.31/6.36 (flat inks kept) 2504 ms | for 1 m: 11.03/6.98/5.36 2819 ms | for 3 m: 15.47/7.52/3.99 5081 ms
#ffffff 4 munch_madonna            flat 8.42/8.42/6.76 | index 9.6/9.6/6.08 | for 0.5 m: 9.42/9.42/5.93 719 ms | for 1 m: 9.42/9.42/5.93 805 ms | for 3 m: 9.95/9.95/5.65 1453 ms
#ffffff 6 starry_night             flat 17.33/13.26/9.02 | index 15.52/10.03/6.43 | for 0.5 m: 14.86/8.61/4.98 5233 ms | for 1 m: 15.61/7.42/3.46 7776 ms | for 3 m: 28.95/10.66/2.48 11650 ms
#ffffff 6 the_scream               flat 9.23/8.74/7.66 | index 12.02/8.61/6.14 | for 0.5 m: 11.99/8.86/6.45 2451 ms | for 1 m: 12.33/8.07/5.07 4390 ms | for 3 m: 18.38/10.48/3.83 7000 ms
#ffffff 6 shipwreck                flat 9.82/9.38/9.38 | index 10.5/7.9/7.85 | for 0.5 m: 10.5/7.9/7.85 (flat inks kept) 2737 ms | for 1 m: 13.67/6.94/5.87 5121 ms | for 3 m: 19.03/9.02/5.27 11332 ms
#ffffff 6 woman-with-hat-matisse   flat 16.42/15.54/13.35 | index 18.59/13.69/9.72 | for 0.5 m: 18.59/13.69/9.72 (flat inks kept) 3959 ms | for 1 m: 21.12/13.39/7.11 5777 ms | for 3 m: 29.97/16.32/4.55 10733 ms
#ffffff 6 wave                     flat 12.39/9.79/7.2 | index 11.09/7.5/5.66 | for 0.5 m: 9.99/5.98/4.54 2783 ms | for 1 m: 11.43/5.35/3.66 4732 ms | for 3 m: 19.53/7.28/2.93 7481 ms
#ffffff 6 udnie                    flat 12.65/12.22/11.62 | index 16.05/10.67/7.81 | for 0.5 m: 14.13/10.35/8.5 3052 ms | for 1 m: 14.69/9.01/5.95 5906 ms | for 3 m: 20.08/9.99/3.78 10012 ms
#ffffff 6 sassoferrato_madonna     flat 11.77/10.53/9.1 | index 13.11/7.91/6.12 | for 0.5 m: 12.26/6.99/5.38 3942 ms | for 1 m: 12.82/6.91/4.98 6534 ms | for 3 m: 19.12/7.91/3.26 10988 ms
#ffffff 6 barocci                  flat 8.85/8.27/7.35 | index 8.58/6.13/5.31 | for 0.5 m: 8.58/6.13/5.31 (flat inks kept) 3333 ms | for 1 m: 9.02/5.57/4.46 3748 ms | for 3 m: 15.43/7.34/3.3 8479 ms
#ffffff 6 munch_madonna            flat 6.99/6.99/5.46 | index 7.99/7.99/5.09 | for 0.5 m: 7.99/7.99/5.09 (flat inks kept) 952 ms | for 1 m: 7.99/7.99/5.09 (flat inks kept) 1187 ms | for 3 m: 8.01/8.01/4.59 2004 ms
#1b1b1d 4 starry_night             flat 18.77/14.76/10.33 | index 18.31/12.92/8.97 | for 0.5 m: 17.44/10.44/6.25 2968 ms | for 1 m: 20.27/9.31/4.1 4378 ms | for 3 m: 25.45/10.08/3.37 5370 ms
#1b1b1d 4 the_scream               flat 10.94/10.37/9.04 | index 13.55/10.3/8.15 | for 0.5 m: 13.16/10.24/8.25 2757 ms | for 1 m: 13.82/10/7.5 3338 ms | for 3 m: 26.48/13.83/3.87 5377 ms
#1b1b1d 4 shipwreck                flat 11.1/9.72/8.27 | index 13.01/10.18/9.17 | for 0.5 m: 13.01/10.18/9.17 (flat inks kept) 2320 ms | for 1 m: 16.14/8.15/5.41 3343 ms | for 3 m: 21.96/9.67/4.15 5934 ms
#1b1b1d 4 woman-with-hat-matisse   flat 19.04/18.35/16.63 | index 20.61/16.87/14.12 | for 0.5 m: 20.46/17.41/15.08 3073 ms | for 1 m: 22.19/15.76/10.81 4801 ms | for 3 m: 39.45/21.38/6.03 5492 ms
#1b1b1d 4 wave                     flat 13.65/11.46/9.7 | index 12.36/8.85/7.69 | for 0.5 m: 11.5/7.06/6.4 1960 ms | for 1 m: 12.22/6.2/5.26 3927 ms | for 3 m: 24.09/8.28/3.89 5750 ms
#1b1b1d 4 udnie                    flat 13.75/13.16/12.13 | index 16.6/11.89/9.17 | for 0.5 m: 14.72/11.42/9.35 2644 ms | for 1 m: 16.32/9.67/5.23 4359 ms | for 3 m: 25.52/11.8/3.61 5149 ms
#1b1b1d 4 sassoferrato_madonna     flat 14.75/13.52/11.76 | index 16.25/12.27/10.32 | for 0.5 m: 13.09/8.8/6.9 3734 ms | for 1 m: 15.02/7.8/5.14 4309 ms | for 3 m: 22.31/9.65/5.01 7748 ms
#1b1b1d 4 barocci                  flat 10.47/9.57/7.88 | index 10.02/7.12/5.61 | for 0.5 m: 10.02/7.12/5.61 (flat inks kept) 2962 ms | for 1 m: 10.64/6.91/4.74 3531 ms | for 3 m: 12.98/7.66/4.23 4465 ms
#1b1b1d 4 munch_madonna            flat 8.42/8.42/6.89 | index 8.96/8.96/5.83 | for 0.5 m: 8.96/8.96/5.83 (flat inks kept) 669 ms | for 1 m: 8.96/8.96/5.83 (flat inks kept) 889 ms | for 3 m: 9.64/9.64/5.18 1705 ms

| Garment, inks | flat 0.5/1/3 m | index, flat inks | inks for 0.5 m | inks for 1 m | inks for 3 m | closer than index, flat inks (at its own distance) |
| #ffffff 3 | 14.85 / 13.78 / 12.19 | 15.88 / 12.14 / 9.79 | 15.18 / 11.38 / 9.18 | 16.39 / 10.95 / 8.27 | 27.07 / 14.01 / 6.31 | 9 / 9 / 9 of 9 |
| #ffffff 4 | 13.43 / 12.30 / 10.71 | 14.48 / 10.64 / 8.34 | 13.76 / 10.12 / 7.98 | 15.83 / 9.55 / 6.24 | 23.52 / 11.53 / 4.51 | 5 / 9 / 9 of 9 |
| #ffffff 6 | 11.72 / 10.52 / 8.90 | 12.61 / 8.94 / 6.68 | 12.10 / 8.50 / 6.42 | 13.19 / 7.85 / 5.07 | 19.83 / 9.67 / 3.78 | 5 / 8 / 9 of 9 |
| #1b1b1d 4 | 13.43 / 12.15 / 10.29 | 14.41 / 11.04 / 8.78 | 13.60 / 10.18 / 8.09 | 15.06 / 9.20 / 6.00 | 23.10 / 11.33 / 4.37 | 6 / 8 / 9 of 9 |
```
