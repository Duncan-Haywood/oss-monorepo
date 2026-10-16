# Dog Boarding & Daycare Pricing Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/dog-boarding-daycare-pricing/>

Independent dog boarding and daycare facility owners (a home-based boarder or
a small kennel/run building — not a marketplace app) can use this free
browser-local calculator to price a reservation from staff time, supplies,
allocated overhead, a long-stay discount, and a multi-dog discount — then
check whether the whole facility's occupancy clears a monthly break-even at
that rate. **After using this, you can quote a defensible per-stay price and
know the minimum occupancy your facility needs to break even, which used to
take a spreadsheet and a guess about what other local kennels charge.**

Open `index.html` directly, or serve this directory with `python3 -m
http.server`. The deterministic calculation works with no account, API key,
upload, or paid dependency.

## Why this is different from picking a flat nightly rate

A round number like "$35 a night" ignores four things that change the real
economics for an independent operator:

- **Staff time per dog per day** (feeding, potty breaks, play/exercise,
  cleaning the run) is a real labor cost, and it does not disappear just
  because the rate is flat.
- **A second dog on the same reservation** costs almost nothing extra to
  handle beyond the first, so pricing it as a full second stay loses
  multi-dog bookings the calculator's discount is built to keep.
- **A long stay is not the same economics as a short one** — after a
  threshold night count, most facilities discount the rest, and doing that
  consistently (not by feel) protects margin on the stays that fill a
  calendar for two weeks at a time.
- **Facility overhead (rent, utilities, insurance, software) has to be
  allocated to a dog-day somehow**, or every quoted price is quietly
  subsidized by whichever nights the operator forgot to count.

The occupancy section then answers the question a single reservation price
can't: given the facility's fixed costs and kennel/run capacity, what
occupancy percentage breaks even, and does a realistic projected occupancy
clear it?

## Privacy and usage

Everything runs in your browser and nothing is ever uploaded. Your
reservation and facility inputs are saved locally on this device so you
don't retype them — **Reset to defaults** clears them, and **Copy shareable
link** puts them in a URL fragment your browser never sends anywhere. We
count anonymous local feature events only (`estimate`, `occupancy-check`,
`link-copied`, `reset`), with a visible opt-out. Do Not Track and Global
Privacy Control disable counting automatically. No people, prices, or
facility names are recorded. The counter is not sent to the maintainers.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not tax, financial, or business advice,
and it does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its
use.

This calculator produces arithmetic observations from numbers you supply. It
does not evaluate whether a facility, run, or kennel meets any local
licensing, zoning, or animal-care regulation, does not screen dogs or
owners, and does not replace your own judgment, contract, or insurance.

MIT licensed. See `LICENSE`.
