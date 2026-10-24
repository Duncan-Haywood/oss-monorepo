# Short-form video: the hub's scripts, rendered

Agent report, 2026-10-24, ventures track (distribution). Code: `platform/distribution/shorts.mjs`.

The owner asked for "automated short form video content". The hub already wrote a 30-second TikTok / YouTube Shorts
script per item, and its own registry said "recording stays manual". `shorts.mjs` now renders the script: two cards
from the page's title and description, the real published page on a 432x768 phone viewport at 2.5x (so 1080x1920)
with its worked example loaded and eased down to its answer, a hold on the answer captioned with a figure read off the
page, and a closing card with the free-software line and the not-advice line. ffmpeg assembles it; Piper (the
podcast's offline voice) narrates the cards when installed. `distribute-shorts.yml` runs it daily and on demand and
uploads a 14-day artifact; nothing is posted.

What the first renders taught (all against the live site, 2026-10-24):

- **Playwright's screen recording is not usable for this.** `recordVideo` captures CSS pixels, ignoring
  `deviceScaleFactor`, so a phone viewport records at 432x768 and pads to the requested size. One tall screenshot at
  2.5x, cropped by a moving ffmpeg window (`crop` with a smoothstep `y(t)`), is sharp and smooth instead.
- **A tall page breaks the screenshot.** `wall-framing-takeoff` failed ("Unable to capture screenshot"): its answer
  sits many screens down. The capture now takes at most four screens above the answer, which also keeps the scroll
  watchable.
- **"The answer" needs ranking, not the first match.** The first output region on `ai-bookkeeper` is the import
  status line, and its first digit-bearing text was a numbered step ("1. Import a statement"). The renderer now ranks
  every named answer (a results heading's section, an output or live region) by the type size of the figure it shows,
  takes figures only when they are mostly digits and units, and labels them from their own tile ("145: lines in the
  books"). Neighbouring tiles leaked in before ("145: 139waiting for you").
- **Example buttons vary.** `ai-bookkeeper`'s is `#example` reading "Load the example (three synthetic months)"; the
  renderer tries known ids, then any button whose words load an example.
- **Posts have no answer to find.** The nailer write-up has no chart or results heading, so its caption says "The
  full write-up" rather than "scrolled to its main result". Captions claim only what the capture did.

Rendered and looked at frame by frame: `container-load-planner` (432 of 870 units in the first container),
`invoice-maker` ($4,452.00 outstanding), `ebay-fee-calculator` ($21.34 estimated batch profit, on its defaults: no
example button), `ai-bookkeeper` (145 lines in the books), `wall-framing-takeoff` (2,384.16 order cost at your
prices), and two posts. 28 to 39 s each, 1.3 to 2.3 MB, about 45 s of render time per video with narration in this
container.

Not done: uploading (owner's: both platforms keep unaudited API uploads private), background music (licensing), and a
measured view count. The `?ref=tiktok` / `?ref=youtube` links in `post.md` are how the scoreboard will see whether the
videos bring anyone.
