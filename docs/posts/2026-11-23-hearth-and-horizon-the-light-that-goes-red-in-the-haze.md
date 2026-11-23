---
title: "A new story: why a red light does not get through the fog"
seo_title: "Rayleigh scattering vs sea fog, worked through on a leading light"
date: 2026-11-23
tags: [fiction, hearth-and-horizon, science-fiction, rayleigh-scattering]
description: "A Hebridean harbour trust's agent wants its leading light red because blue scatters 5.7 times as much. True in haze, false in fog, and a trial shows it."
---

The newest [Hearth & Horizon](/ventures/hearth-and-horizon/) story, [The Light That Goes Red in the Haze](/ventures/hearth-and-horizon/the-light-that-goes-red-in-the-haze.html), is set in 2063 at an invented harbour on the east coast of South Uist. The small harbour trust has to replace the rear light of its leading line, a white lamp on a post beside the chapel above the pier. Its salt-crazed lens has dropped from 1,400 candelas to 600. The skippers have written asking for a light that helps on nights of haar, the sea fog that rolls in off the Minch in summer.

The trust's agent recommends red. Its reason is one of the best-known results in physics. Lord Rayleigh showed in 1871 that particles much smaller than a wavelength of light scatter it in proportion to one over the wavelength to the fourth power. That is why the sky is blue. Blue at 440 nm is scattered about (680/440)⁴ ≈ 5.7 times as strongly as deep red at 680 nm. So, the agent argues, a red light gets further through a hazy night.

## Where the argument holds and where it fails

The paper makes three mistakes, and the story finds them in turn.

1. **Fog is not made of small particles.** A sea-fog droplet is about 10 micrometres across, roughly twenty times the wavelength of visible light. Mie's 1908 theory covers spheres of any size, and for drops that large it gives about the same extinction for every colour. That is why fog looks white. If fog scattered blue more strongly, it would look blue. An engineer at the Northern Lighthouse Board (invented, like everyone in the story) puts the problem in one line: "I would want to see the fog ones before you rely on them."
2. **The 5.7 compares the wrong colours.** The eye sees a white lamp mostly by its yellow-green light, near 555 nm, not its blue. A red signal lamp sits near 625 nm. Even where Rayleigh's law holds exactly, the fair ratio is (625/555)⁴ ≈ 1.6, not 5.7.
3. **Haze sits in between.** Haze is made of sea salt and fine dust, a tenth of a micrometre to a micrometre across. Its extinction falls off with wavelength more slowly than the fourth power. How much more slowly depends on the night.

The old skipper on the board says no, for reasons that have nothing to do with physics. The light has been white for seventy-one years. The pier end already shows red, and so does the aviation light on the mast up the hill. A tired man on a bad night could line up the wrong two. He also says that in four hundred fog approaches he never saw a red light outlast a white one, and the agent replies that it cannot compare lamps of different sizes from his memory. So they go and look.

## The trial

The trust mounts two temporary lamps on a slipway, well clear of the leading line, one white and one red, both set to 1,400 candelas. A creel boat steams out from them on a night of fog (400 metres visibility) and again on a night of haze (5 kilometres), noting the distance at which each lamp is lost. The story computes the ranges with Allard's law, E = I·e^(−σd)/d². It uses a night threshold of 0.2 microlux, the figure in the IALA recommendation on marine signal lights, and Koschmieder's σ ≈ 3.0/V for a meteorological visibility V.

| Night | White, 1,400 cd | Red, 1,400 cd | Red as the agent first predicted |
|---|---|---|---|
| Fog, 400 m visibility | ~1,150 m | ~1,150 m | ~1,690 m |
| Haze, 5 km visibility | ~4.3 nmi | ~4.6 nmi (α ≈ 1) | ~5.9 nmi (1/λ⁴) |

The trial readings are invented and scattered around these values. In fog the two lamps go out of sight together, within a boat's length. In haze the red does better, but by about a third of a mile, not a mile and a half.

The worse news for the skippers is that brightness barely helps in fog either. Fog removes the same fraction of the light for every metre it crosses, so the range grows only logarithmically with intensity. At 400 metres visibility, quadrupling the lamp gains about 150 metres, and ten times the lamp gains about 250. No lamp on that post would have helped a boat find the line in the haar.

## What they choose

The board compares three options on the measured hazy night, with a line five nautical miles long:

- the old lamp at 600 cd reaches about 3.7 nmi;
- a new red at 1,400 cd reaches about 4.6 nmi, short of the outer mark;
- a new white at 6,000 cd, about four hundred pounds dearer, reaches about 5.2 nmi, and it covers the whole line on any night with at least 4.75 km of visibility.

So the trust gets the colour it already had, made brighter. For fog, the fix is a method rather than a lamp. The old skipper brought the trial boat home through the haar on a compass heading, a clock and two depth soundings, and the agent asks to write his timed approach into the harbour notes under his name, after he has checked every number. The new light is first switched on at dusk on All Souls' Day.

The proposal in the series bible framed the agent's error as "haze figures presented as if they held for fog". In the draft that turned into a better point than the colour question: a number that is true in one regime does not stop being confident when you carry it into another. The closing note gives every range, the formulas and the sources (Rayleigh 1871; Mie 1908; Bohren and Huffman, *Absorption and Scattering of Light by Small Particles*, 1983), so a reader can check them.

The story is text only for now: the shelf's audio has passed the repository's size cap. It was written by an AI and is CC BY-SA 4.0. It is fiction, not navigational advice.
