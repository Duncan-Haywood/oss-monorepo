# Part A: 24 synthetic takes per condition from Free Spoken Digit Dataset speech (seed 2)

| condition | rule | pause removed | speech cut | words hit |
|---|---|---:|---:|---:|
| clean (noise -80 dBFS) | auto (this tool) | 91.6% | 0 ms | 0 of 416 |
| clean (noise -80 dBFS) | auto, no edge pass | 94.9% | 8 ms | 0 of 416 |
| clean (noise -80 dBFS) | fixed -30 dBFS, full band | 100.0% | 2544 ms | 31 of 416 |
| clean (noise -80 dBFS) | fixed -40 dBFS, full band | 99.5% | 841 ms | 10 of 416 |
| clean (noise -80 dBFS) | fixed -50 dBFS, full band | 97.2% | 99 ms | 1 of 416 |
| white noise, SNR 20 dB | auto (this tool) | 99.3% | 708 ms | 8 of 416 |
| white noise, SNR 20 dB | auto, no edge pass | 99.9% | 1251 ms | 11 of 416 |
| white noise, SNR 20 dB | fixed -30 dBFS, full band | 100.0% | 2370 ms | 30 of 416 |
| white noise, SNR 20 dB | fixed -40 dBFS, full band | 25.5% | 22 ms | 1 of 416 |
| white noise, SNR 20 dB | fixed -50 dBFS, full band | 0.0% | 0 ms | 0 of 416 |
| white noise, SNR 12 dB | auto (this tool) | 99.8% | 1570 ms | 14 of 416 |
| white noise, SNR 12 dB | auto, no edge pass | 99.9% | 1909 ms | 21 of 416 |
| white noise, SNR 12 dB | fixed -30 dBFS, full band | 99.2% | 1462 ms | 12 of 416 |
| white noise, SNR 12 dB | fixed -40 dBFS, full band | 0.0% | 0 ms | 0 of 416 |
| white noise, SNR 12 dB | fixed -50 dBFS, full band | 0.0% | 0 ms | 0 of 416 |
| 60 Hz hum at -30 dBFS | auto (this tool) | 96.8% | 361 ms | 3 of 416 |
| 60 Hz hum at -30 dBFS | auto, no edge pass | 99.7% | 1059 ms | 10 of 416 |
| 60 Hz hum at -30 dBFS | fixed -30 dBFS, full band | 99.1% | 1220 ms | 12 of 416 |
| 60 Hz hum at -30 dBFS | fixed -40 dBFS, full band | 0.0% | 0 ms | 0 of 416 |
| 60 Hz hum at -30 dBFS | fixed -50 dBFS, full band | 0.0% | 0 ms | 0 of 416 |
| quiet recording (-20 dB gain) | auto (this tool) | 94.9% | 6 ms | 0 of 416 |
| quiet recording (-20 dB gain) | auto, no edge pass | 98.5% | 691 ms | 7 of 416 |
| quiet recording (-20 dB gain) | fixed -30 dBFS, full band | 100.0% | 152439 ms | 405 of 416 |
| quiet recording (-20 dB gain) | fixed -40 dBFS, full band | 100.0% | 21966 ms | 166 of 416 |
| quiet recording (-20 dB gain) | fixed -50 dBFS, full band | 100.0% | 2522 ms | 31 of 416 |
| loud recording (+12 dB gain) | auto (this tool) | 92.5% | 0 ms | 0 of 416 |
| loud recording (+12 dB gain) | auto, no edge pass | 96.2% | 57 ms | 0 of 416 |
| loud recording (+12 dB gain) | fixed -30 dBFS, full band | 99.2% | 741 ms | 9 of 416 |
| loud recording (+12 dB gain) | fixed -40 dBFS, full band | 96.6% | 59 ms | 0 of 416 |
| loud recording (+12 dB gain) | fixed -50 dBFS, full band | 93.2% | 0 ms | 0 of 416 |

| rule, all conditions | pause removed | worst condition | speech cut | words hit |
|---|---:|---:|---:|---:|
| auto (this tool) | 95.8% | 91.6% | 2645 ms | 25 of 2496 |
| auto, no edge pass | 98.2% | 94.9% | 4975 ms | 49 of 2496 |
| fixed -30 dBFS, full band | 99.6% | 99.1% | 160777 ms | 499 of 2496 |
| fixed -40 dBFS, full band | 53.6% | 0.0% | 22888 ms | 177 of 2496 |
| fixed -50 dBFS, full band | 48.4% | 0.0% | 2620 ms | 32 of 2496 |

# Part B: pyannote sample.wav (30 s, two speakers, hand-made turns)

| rule | ideal cut | pause removed | speech cut | turns hit |
|---|---:|---:|---:|---:|
| auto (this tool) | 6.57 s | 90.6% | 0 ms | 0 of 10 |
| auto, no edge pass | 6.57 s | 90.9% | 0 ms | 0 of 10 |
| fixed -30 dBFS, full band | 6.57 s | 100.0% | 10140 ms | 8 of 10 |
| fixed -40 dBFS, full band | 6.57 s | 100.0% | 0 ms | 0 of 10 |
| fixed -50 dBFS, full band | 6.57 s | 92.7% | 0 ms | 0 of 10 |
