# Security Camera Installation Bid Calculator

A private browser calculator for low-voltage and security installers. It prices
an IP camera install from the drops, the cable, the head end, and your own wage
and margin — and it checks the three things a camera bid gets wrong before the
bid goes out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/security-camera-bid-calculator/

Open `index.html`. There is no build step, no account, and no server.

Search page: [`how-much-to-charge.html`](how-much-to-charge.html).

## Why this exists

Per-camera pricing hides the job. Eight cameras through an accessible attic is
not the same job as eight through masonry with a lift, and neither of them is
the job where the customer was quoted "30 days of recording" on drives that
hold eleven.

Three numbers decide whether a camera bid is defensible, and all three are
arithmetic the trade routinely does by feel:

- **Storage.** Recording days are a function of bitrate, camera count, hours
  per day, and the drive you can actually buy. The tool reports the storage the
  quoted retention needs *and*, separately, the retention the purchased drives
  will deliver. Those are different numbers, and the gap is where a handover
  fails.
- **PoE budget.** A switch over its budget does not fail cleanly — it drops
  cameras intermittently, often months later when heaters come on, and each one
  is a callback the bid never priced. Anything over 80% of the budget is
  flagged, because a system at its ceiling has nothing left for next spring's
  extra camera.
- **Run length.** Ethernet stops at 100 m / 328 ft. A run past it needs a
  mid-span switch, an extender, or fibre. Finding that out on install day is a
  change order the customer never agreed to.

Each warning names the remedy, not just the fault.

## What it works out

- Recording per day, storage for the quoted retention, and the days the fitted
  drives actually hold, plus the smallest stocked drive size that would cover it
- PoE load against the switch budget, with headroom and an 80% planning ceiling
- Cable footage including a 15% waste allowance, and a check on the longest run
- Labour hours from drops × hours-per-drop (by construction type, or your own
  figure, which always wins), commissioning, lift time, and other hours
- Loaded hourly rate from wage and burden
- Materials, overhead, and the **cost floor** — the walk-away price to hold when
  a customer asks you to match a lower bid
- Bid price at your target margin, priced as margin on revenue rather than
  markup on cost, plus price per camera
- The margin a price you are considering would actually earn

## What it is not

Bitrates are typical planning figures at roughly 15 fps, not a guarantee that
any camera hits them — a scene full of moving foliage will exceed them and a
static hallway will beat them. Motion-only recording is estimated from the share
of the day you enter. Nothing here is a manufacturer specification, an ONVIF
profile, or a building, fire, electrical, or privacy-law ruling.

Where cameras may point, whether audio may be recorded, what signage is
required, and how long footage may be kept are governed by law that varies by
country, state, and sometimes by the room. This prices an install; it does not
tell you whether the install is lawful.

## Privacy

Nothing is uploaded. The calculation runs entirely in your browser.

A local draft of your inputs is kept in this browser so a reload does not lose
the takeoff, and an anonymous aggregate usage count is kept under the
`security-camera-bid-usage` key: event names and the current day only. It never
includes the site, the camera count, wages, or prices, and it never leaves the
device. Untick "Do not keep anonymous local usage counts" in the footer to
switch it off; a Do Not Track or Global Privacy Control signal switches it off
without asking.

## Tests

```
node --test
```

Covers the storage arithmetic against hand-computed figures, the PoE and run
checks, the labour and margin stack, input validation, and that the page's form
and the calculator's field list cannot drift apart.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not electrical, engineering, code, security,
privacy, legal, tax, or contracting advice, and it does not replace a licensed
installer, a manufacturer's specification, or the authority having jurisdiction.
**You are responsible for reviewing and verifying its output before relying on
it**, and for meeting any permit, licensing, inspection, or privacy obligation
it helps you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be
slow, broken, moved, or taken offline without notice. We do not promise uptime,
backups of anything you type, or that a URL will keep working. Do not use this
as a system of record. If a tool needs to survive, export your inputs and run it
yourself.

## Support

Free and open source. [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
is optional and never changes what the tool does.
