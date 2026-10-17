# ambient-wearable: a power budget and gating firmware for a pendant-style always-on audio wearable

Track 2 (ambient AI assistant), milestone 5. Produced with AI assistance. **Nothing here was
measured on hardware.** The battery-life numbers come from a small model whose inputs are a few
vendor figures plus assumptions of mine, all listed below. No lab from `prompt.md` is built on;
there is no lab tag.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/ambient-wearable/

## Motivation

`PROJECTS.md` asks for a wearable design the owner could build: a microcontroller, a MEMS
microphone and Bluetooth LE, with a power budget from datasheets, a priced bill of materials,
firmware that compiles in the container, and a comparison with Omi. The question this project
answers is narrower: with this class of parts, what dominates battery life, and how much does
gating the radio on speech buy?

## Builds on

- Nordic nRF52840 product specification, key-features page (read 2026-10-13 through a
  page-summarising fetch tool, not from the PDF): 4.8 mA radio TX peak at 0 dBm, 4.6 mA RX peak,
  52 &micro;A/MHz CPU running CoreMark from flash, 1.5 &micro;A System ON with RTC wake, 64 MHz
  Cortex-M4F. Re-check against the PDF before relying on any of them.
- Omi (BasedHardware/omi, MIT): its README describes "24h+ continuous capture" and its DevKit2
  documentation page names a Seeed XIAO nRF52840 as the MCU (both read 2026-10-13 via the same
  tool). I found no battery capacity, microphone or current figure for Omi, so **no numeric
  comparison is made**; only the design point (same MCU class, pendant form) is comparable.
- Seeed XIAO nRF52840 Sense listing: US$15.90 (US$13.90 each at 10+), page tags PDM audio, mic
  part not named. Adafruit 150 mAh 3.7 V LiPo (product 1317): US$5.95. Adafruit PDM MEMS
  microphone breakout (product 3492): US$4.95, 0.6 mA typical active supply, 61 dB SNR. Prices and
  the mic current are retailer-page figures read 2026-10-13, not datasheet figures.

## Method

`src/ambient_wearable/power.py` computes average battery-side current for five modes:
`idle`, `push_to_talk` (mic off until the user presses), `vad_gate` (mic and a cheap energy gate
always on; codec and radio only while speech), `always_stream` (coded audio all the time) and
`raw_stream` (uncoded 256 kbit/s PCM). Radio on-time is `bitrate / PHY rate x overhead`; the
CPU, mic and radio currents add up; the sum is divided by a conversion efficiency; life is
usable capacity over current. Assumptions of mine, not sourced: conversion efficiency 0.85,
80% of nominal capacity usable, 32 kbit/s LC3-class codec, 1 Mbit/s PHY, 2x link overhead, 30% of
radio time in RX, codec using 25% of the CPU while running, energy gate using 1%. The 2x overhead
and the codec load are the least certain; they are swept below.

`firmware/vad_gate.c` is the gate: mean-square energy per frame with a hangover, plain C99, no
SDK. It is tested on the host and compiled for Cortex-M4 (74 bytes of `.text` at `-Os`). It is
**not** a firmware image: there is no audio driver, no BLE stack, no codec and no board
support, and the threshold is untuned on real audio.

## Reproduce

```
cd research/ambient-wearable
PYTHONPATH=src python3 -m pytest -q tests      # 8 tests; the two firmware tests need gcc and arm-none-eabi-gcc
PYTHONPATH=src python3 experiments/run.py      # prints experiments/output.txt
```

## Results (model output; stylised)

| mode | speech fraction | avg mA | hours | days |
|---|---|---|---|---|
| idle | &ndash; | 0.002 | 68000 | 2833 |
| push_to_talk | 0.1 | 0.206 | 583 | 24.3 |
| push_to_talk | 0.3 | 0.614 | 195 | 8.1 |
| vad_gate | 0.1 | 0.880 | 136 | 5.7 |
| vad_gate | 0.3 | 1.148 | 105 | 4.4 |
| vad_gate | 0.6 | 1.548 | 78 | 3.2 |
| always_stream | 1.0 | 2.043 | 59 | 2.4 |
| raw_stream | 1.0 | 3.641 | 33 | 1.4 |

- The microphone is the floor: at 0.6 mA and these assumptions, an always-on mic alone limits a
  150 mAh cell to 170 h, so gating the radio can recover at most part of the gap to push-to-talk.
- Gating on speech (30% speech) lengthens life from 59 h to 105 h versus always streaming, about
  1.8x; a codec cuts raw streaming's 33 h to 59 h.
- Sweeping one input at a time around the 105 h case: mic current 0.3/1.0 mA gives 151/74 h;
  usable capacity 60%/100% gives 78/131 h; codec load 10%/50% gives 123/83 h; link overhead
  4x gives 96 h. The mic current and the capacity derating matter more than the radio.

## Bill of materials (prototype, owner steps)

| part | US$ | source, read 2026-10-13 |
|---|---|---|
| Seeed XIAO nRF52840 Sense (MCU, BLE, onboard PDM mic) | 15.90 | Seeed listing |
| 150 mAh 3.7 V LiPo | 5.95 | Adafruit 1317 |
| **Total** | **21.85** | before shipping, tax, case, lanyard |

I did not verify that the XIAO board charges a LiPo or a battery connector fit; check the board
documentation. A discrete design (bare nRF52840 module, separate mic, charger IC, antenna) is not
priced here.

## Limitations

- Vendor figures were read through a summarising fetch tool; the mic figure is a retailer's. The
  model's inputs are not a measured system and omit sensor and LED loads, flash writes, radio
  connection-interval effects, temperature and battery ageing.
- Conversion efficiency applies one factor to all currents quoted at 3 V.
- The speech fraction is an input, not data about anyone's day.
- No comparison with Omi's actual battery life.

## Next steps

Take the figures from the nRF52840 and microphone PDFs; measure current with a power analyser on
a real board; add an audio driver and a BLE stack and test the gate threshold on recordings.

## Owner steps

Buy the two parts above, flash a firmware image (not provided), and measure current.

## Outside dependencies

Nordic and Seeed hardware, a BLE stack and audio codec (not written), vendor datasheets (not
read in full), and an ARM GCC toolchain (installed here via apt as `gcc-arm-none-eabi`).
