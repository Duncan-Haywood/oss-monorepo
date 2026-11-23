---
title: "A new story: ten equal volume steps, and why ears disagree"
seo_title: "Weber, Fechner and a volume panel: equal volts or equal decibels"
date: 2026-11-23
tags: [fiction, hearth-and-horizon, science-fiction, psychophysics]
description: "A church's new ten-button volume panel is spaced in equal volts: the bottom steps leap, the top four add up to one. Equal ratios fix it."
---

The newest [Hearth & Horizon](/ventures/hearth-and-horizon/) story, [The Step That Is a Third Louder](/ventures/hearth-and-horizon/the-step-that-is-a-third-louder.html), is set in an invented parish in Clitheroe, Lancashire, in Lent 2057. A grant buys the church a new sound system. Its volume control is a white panel with ten buttons. The parish's office agent is asked for "ten equal steps", so it fills in the panel's voltage table with equal volts: button one gives a tenth of full voltage, button two two tenths, and so on up to ten.

The organist, who is eighty-four and did the sound for fifty-one years from an old amplifier with one knob, presses through the buttons once and says the bottom of the panel is a staircase and the top is a landing. He is right, and the arithmetic shows why.

## Ears count ratios

Decibels count ratios: a voltage ratio r is 20 log₁₀ r dB. Equal-volt steps give these levels, measured down from the top button:

| Button | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Equal volts (dB) | −20.0 | −14.0 | −10.5 | −8.0 | −6.0 | −4.4 | −3.1 | −1.9 | −0.9 | 0 |
| Equal ratios (dB) | −36 | −32 | −28 | −24 | −20 | −16 | −12 | −8 | −4 | 0 |

In the equal-volt row the gap from button 1 to button 2 is 6 dB. From 9 to 10 it is 0.9 dB. In a quiet lab people can hear a change of about half a decibel in a steady sound. In a stone church, with a voice that swings by more than that on every syllable, a change of one decibel mostly goes unnoticed. So buttons 6 to 10 sound like one step: together they come to 4.4 dB.

Three old results explain it. E. H. Weber (*De Tactu*, 1834) found that the smallest difference people could feel between two weights was a roughly constant *fraction* of the weight. G. T. Fechner (*Elemente der Psychophysik*, 1860) built on that: if every just-noticeable step is the same fraction, then sensation grows as the logarithm of the stimulus. S. S. Stevens ("On the psychophysical law", *Psychological Review*, 1957) asked people to put numbers on loudness directly. He got a power law instead: loudness goes roughly as intensity to the 0.3, so about every 10 dB sounds twice as loud. The story uses Stevens and says so. On that rule, button 2 of the equal-volt panel is about 1.5 times as loud as button 1, and buttons 6 to 10 together come to about 1.36 times.

## Where the rule bends

The organist refuses to let a meter decide what a congregation can hear. That is the story's "reasonable no", and part of it holds up. A microphone measures the room. It doesn't measure whether the man in the back pew with one good ear can follow the words. Too much gain in a reverberant church also makes speech worse, because the echo comes up along with the voice.

So the panel goes into the Easter Vigil unchanged, and in the hushed, dark church it fails. The quietest button is already too loud, and below it is only silence. Then the organist brings in his old amplifier. Its knob turns out to be an "audio taper" potentiometer, built so that equal turns give roughly equal decibels. Fechner's rule was in the hardware, and that is why the old knob always had somewhere to go.

The fix is a split. The agent's first equal-ratio proposal spaces the buttons over the 50 dB its microphone measured, but the bottom three buttons disappear under the heaters. That is where Weber's fraction stops being constant: near the threshold, or near a masking noise, an ear needs a bigger step than the rule predicts. So the organist sets the two ends by ear. The bottom is where he can just hear the "s" in "Jesus" from the back pew, and the top is where the voice starts coming back off the pillars. A younger parishioner checks the top, because his ears are eighty-four. The agent spaces the eight buttons in between at equal ratios. The ends come out 36 dB apart, which makes nine gaps of 4 dB, and each 4 dB step is about 2^0.4 ≈ 1.32 times as loud as the last. That is the "third louder" in the title. The old panel's whole top landing turns out to be a little more than one of the new steps.

Every level in the story is invented, and the full model is in the closing note. The text is CC BY-SA 4.0. It is text only, because the creative audio folders are over their 400 MB cap. It is fiction, not audiology or sound-installation advice.
