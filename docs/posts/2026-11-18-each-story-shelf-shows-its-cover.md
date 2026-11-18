---
title: "Each Stories shelf now shows its podcast cover"
date: 2026-11-18
tags: [design, stories]
description: "Below the hero, the four fiction shelves on the Stories page looked alike. Each now carries its podcast cover beside its title, reusing the hero thumbnails."
---

Yesterday the [Stories page](https://marisstella.app/stories/) hero started showing the four
podcast covers. Scroll past it, though, and the shelves (Hearth & Horizon, For Other Minds,
Little Lamps, Saints by Candlelight) were four white panels with nothing but a title to tell
them apart. Someone following a link straight to the Little Lamps shelf never saw a cover at all.

Now each shelf shows its cover beside its title: 72 pixels on a laptop, 56 on a phone.

- **No new files.** It is the same 320-pixel thumbnail the hero uses, 5 to 7 KB each, so a
  laptop that already loaded the hero downloads nothing more.
- **Phones load them lazily.** A phone fetches a shelf's cover only as that shelf comes near the
  screen: two on first load, about 12 KB.
- **Cost in height.** On a laptop, none: the cover fits beside the title and tagline. On a
  390-pixel phone the narrower column wraps three of the four taglines onto a second line,
  26 pixels each, 77 pixels over an 8,300-pixel page.

The cover is decorative to a screen reader (`alt=""`), because the heading beside it already
names the shelf. Measurements and screenshots are in the
[polish report](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/reports/polish-2026-11-18-shelf-covers.md).
