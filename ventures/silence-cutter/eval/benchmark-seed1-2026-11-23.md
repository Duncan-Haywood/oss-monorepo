# Part A: 24 synthetic takes per condition from Free Spoken Digit Dataset speech (seed 1)

| condition | rule | pause removed | speech cut | words hit |
|---|---|---:|---:|---:|
| clean (noise -80 dBFS) | auto (this tool) | 89.4% | 0 ms | 0 of 480 |
| clean (noise -80 dBFS) | auto, no edge pass | 93.1% | 14 ms | 0 of 480 |
| clean (noise -80 dBFS) | fixed -30 dBFS, full band | 100.0% | 2315 ms | 24 of 480 |
| clean (noise -80 dBFS) | fixed -40 dBFS, full band | 99.6% | 1042 ms | 9 of 480 |
| clean (noise -80 dBFS) | fixed -50 dBFS, full band | 95.9% | 86 ms | 0 of 480 |
| white noise, SNR 20 dB | auto (this tool) | 99.2% | 984 ms | 9 of 480 |
| white noise, SNR 20 dB | auto, no edge pass | 99.9% | 1405 ms | 11 of 480 |
| white noise, SNR 20 dB | fixed -30 dBFS, full band | 100.0% | 2073 ms | 21 of 480 |
| white noise, SNR 20 dB | fixed -40 dBFS, full band | 22.7% | 27 ms | 1 of 480 |
| white noise, SNR 20 dB | fixed -50 dBFS, full band | 0.0% | 0 ms | 0 of 480 |
| white noise, SNR 12 dB | auto (this tool) | 99.8% | 1437 ms | 13 of 480 |
| white noise, SNR 12 dB | auto, no edge pass | 99.9% | 1962 ms | 18 of 480 |
| white noise, SNR 12 dB | fixed -30 dBFS, full band | 99.1% | 1492 ms | 12 of 480 |
| white noise, SNR 12 dB | fixed -40 dBFS, full band | 0.0% | 0 ms | 0 of 480 |
| white noise, SNR 12 dB | fixed -50 dBFS, full band | 0.0% | 0 ms | 0 of 480 |
| 60 Hz hum at -30 dBFS | auto (this tool) | 95.8% | 474 ms | 4 of 480 |
| 60 Hz hum at -30 dBFS | auto, no edge pass | 99.7% | 1286 ms | 9 of 480 |
| 60 Hz hum at -30 dBFS | fixed -30 dBFS, full band | 99.1% | 1358 ms | 10 of 480 |
| 60 Hz hum at -30 dBFS | fixed -40 dBFS, full band | 0.0% | 0 ms | 0 of 480 |
| 60 Hz hum at -30 dBFS | fixed -50 dBFS, full band | 0.0% | 0 ms | 0 of 480 |
| quiet recording (-20 dB gain) | auto (this tool) | 93.3% | 14 ms | 0 of 480 |
| quiet recording (-20 dB gain) | auto, no edge pass | 98.3% | 943 ms | 9 of 480 |
| quiet recording (-20 dB gain) | fixed -30 dBFS, full band | 100.0% | 174540 ms | 474 of 480 |
| quiet recording (-20 dB gain) | fixed -40 dBFS, full band | 100.0% | 20773 ms | 161 of 480 |
| quiet recording (-20 dB gain) | fixed -50 dBFS, full band | 100.0% | 2214 ms | 23 of 480 |
| loud recording (+12 dB gain) | auto (this tool) | 90.5% | 0 ms | 0 of 480 |
| loud recording (+12 dB gain) | auto, no edge pass | 94.4% | 86 ms | 0 of 480 |
| loud recording (+12 dB gain) | fixed -30 dBFS, full band | 99.2% | 973 ms | 9 of 480 |
| loud recording (+12 dB gain) | fixed -40 dBFS, full band | 95.1% | 66 ms | 0 of 480 |
| loud recording (+12 dB gain) | fixed -50 dBFS, full band | 92.0% | 0 ms | 0 of 480 |

| rule, all conditions | pause removed | worst condition | speech cut | words hit |
|---|---:|---:|---:|---:|
| auto (this tool) | 94.7% | 89.4% | 2909 ms | 26 of 2880 |
| auto, no edge pass | 97.6% | 93.1% | 5695 ms | 47 of 2880 |
| fixed -30 dBFS, full band | 99.6% | 99.1% | 182751 ms | 550 of 2880 |
| fixed -40 dBFS, full band | 52.9% | 0.0% | 21909 ms | 171 of 2880 |
| fixed -50 dBFS, full band | 48.0% | 0.0% | 2300 ms | 23 of 2880 |

# Part B: pyannote sample.wav (30 s, two speakers, hand-made turns)

| rule | ideal cut | pause removed | speech cut | turns hit |
|---|---:|---:|---:|---:|
| auto (this tool) | 6.57 s | 90.6% | 0 ms | 0 of 10 |
| auto, no edge pass | 6.57 s | 90.9% | 0 ms | 0 of 10 |
| fixed -30 dBFS, full band | 6.57 s | 100.0% | 10140 ms | 8 of 10 |
| fixed -40 dBFS, full band | 6.57 s | 100.0% | 0 ms | 0 of 10 |
| fixed -50 dBFS, full band | 6.57 s | 92.7% | 0 ms | 0 of 10 |
