# Music Lesson Pricing Calculator

Independent music teachers can use this free browser calculator to find a sustainable lesson price after cancellations, preparation, travel, and monthly teaching costs. After using it, you can state the lesson price that reaches your annual pay target, which used to take a spreadsheet and guesswork.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/music-lesson-break-even/

Serve this directory with `python3 -m http.server` before opening the page (ES module imports are blocked from `file://`). Run `node --test` for the pricing tests. The default example models 20 weekly lessons, 10% cancellations, 48 teaching weeks, 10 minutes of preparation, and $200 monthly costs. That week reaches a $40,000 target at $49.07 per paid lesson; two more weekly lessons keep $5,184 more after costs and drop the required price to $44.61. Travel time does not change cash — it only changes the effective hourly rate. Submitted assumptions are saved locally so a teacher can revisit a recurring pricing decision; use **Reset saved inputs** to remove them.

## Opportunity and differentiation

The target user is a solo piano, guitar, voice, or instrument teacher who prices recurring lessons but loses time to cancellations and unpaid preparation. Generic hourly-rate calculators ignore the teaching workflow; studio-management platforms are broader, paid, and often require accounts. This tool is a focused, transparent alternative that answers “how much should I charge for music lessons?” without uploading student information.

Organic acquisition comes from searches about private music lesson pricing, piano lesson rates, teacher hourly pay, cancellation assumptions, and studio costs. A future hosted version could offer saved rate scenarios or an optional user-supplied AI scope reviewer, but the deterministic workflow remains free and needs no API key.

See [vs-mymusicstaff.html](vs-mymusicstaff.html) for how this free, private calculator differs from My Music Staff's paid studio-management platform, or [vs-picking-a-rate-off-the-going-local-price.html](vs-picking-a-rate-off-the-going-local-price.html) for what copying a nearby teacher's posted rate misses about your own cancellations, travel time, and income target.

## Privacy, usage, and cost

Everything runs in the browser. Inputs never leave the device; there are no accounts, cookies, tracking pixels, or analytics vendors. The local counter records only the aggregate `lesson_price_calculated` event and can be stopped with Do Not Track / Global Privacy Control or by clearing browser storage. Hosting and inference cost is $0 per user at launch.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not financial, tax, legal, or professional teaching advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) support never changes access.

MIT licensed; see `LICENSE`.
