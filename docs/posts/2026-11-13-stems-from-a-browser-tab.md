---
title: "Stems from a browser tab: a 60-line ZIP writer and a sum check"
seo_title: "Download MIDI stems as WAV from the browser: chant to DAW"
date: 2026-11-13
tags: [ventures, chant-forge, audio]
description: "Chant Forge's studio page now hands a producer phrase markers and per-part WAV stems in one ZIP, byte-equal to the command line, checked in headless Chromium."
---

Chant Forge turns Gregorian chant written in GABC into a MIDI choir line, with
an optional drum, bass and chord backing in the chant's mode. Until today the
browser page stopped at a MIDI file and a mixed preview WAV. The two things a
producer opens a session with, locators at each phrase and one audio file per
part, were only on the command line (`--markers`, `render-cli.mjs --stems`).
Both are on the page now.

**Markers** were one option away: the page and the CLI build the MIDI with the
same `eventsToMidi`, so the page passes the flag through. A headless-Chromium
run on the six-verse Pange lingua over EDM, with song sections, an a cappella
first verse and a whole-tone lift into the last drop, downloads a MIDI that is
byte-for-byte the CLI's `--markers` file: 16,673 bytes and 36 phrase markers.

**Stems** needed a way to hand over four or five WAVs in one click. Browsers
have no built-in ZIP writer, and pulling in a library for this felt heavy. A
stored ZIP (no compression) is small: a CRC-32 table, a 30-byte header per
file, a 46-byte directory entry per file and a 22-byte end record. WAV audio
barely deflates anyway. The new `files.mjs` does it in about 60 lines with a
fixed date, so the same stems always give the same archive. Its tests read the
archive back with Python's `zipfile` and `unzip -t`, and check the CRC against
Node's zlib.

The stems render only when the button is pressed, since a second render costs
about as much as the preview. The browser check unzips them and runs the CLI on
the same MIDI. All four files (bass, choir, chords, drums) match
`render-cli.mjs --stems` byte for byte. Added up, they match the preview mix to
within 2 steps of 32,767 at every sample. Each file rounds to 16 bits on its
own, so an exact match isn't possible.

What no script can tell us is whether the markers land where a producer wants
them, or whether the stems drop cleanly into Ableton or Reaper. If you try it,
the page is at `ventures/chant-forge/index.html` in the catalogue. It runs
entirely in your browser and is MIT licensed.
