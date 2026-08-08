# World Traveler — a Garmin Connect IQ watch face

A stylish watch face for frequent travelers: your device's local time front
and center, plus four customizable world-city clocks so you can tell what
time it is almost anywhere, at a glance.

![Design mockup](docs/design-mockup.png)

*(The image above is a design mockup rendered outside the Connect IQ
simulator, to preview the intended layout before a real build. See
[Building & testing](#building--testing) for how to generate real
simulator screenshots.)*

## Features

- Big local time, with the device's own 12/24-hour preference respected.
- Four world-city rows, each independently configurable from a catalog of
  22 cities spanning UTC-11 through UTC+13 (see `source/CityData.mc`).
- Automatic, self-contained DST handling for US, EU, Australian and New
  Zealand rules — no network access or bundled timezone database needed.
- A "+1 / -1" badge on a city row when that city's calendar day differs
  from your local day.
- Four selectable color themes (Midnight, Aurora, Sand, Mono).
- Battery percentage readout.
- Draws everything programmatically from screen width/height, so one
  codebase adapts to round, semi-round and rectangular displays without
  per-device layout resources.
- No permissions requested — the face only reads the system clock, device
  settings and battery level. No location, no network, no background
  service.

## Project layout

```
manifest.xml                    App metadata, target device list
monkey.jungle                   Build configuration
source/
  WorldTravelerApp.mc            App entry point
  WorldTravelerView.mc            Drawing / layout logic
  CityData.mc                    City catalog + timezone/DST math
  Themes.mc                      Color themes
resources/
  drawables/                     Launcher icon
  strings/                       App name + settings labels
  settings/                      properties.xml (defaults) + settings.xml (on-device settings UI)
docs/
  design-mockup.png              Layout preview (not a simulator capture)
```

## How the timezones work

Connect IQ devices don't ship a general IANA timezone database, so every
watch face that shows "other" timezones has to compute offsets itself.
This project stores each city's **standard** (winter) UTC offset plus a
symbolic DST rule (`:none`, `:us`, `:eu`, `:au`, `:nz`), and computes the
*effective* offset from the current UTC instant on every draw — see
`CityData.effectiveOffsetSeconds()`. The technique for rendering an
arbitrary offset: take `Time.now()` (a UTC-referenced `Moment`), add the
target offset as a `Time.Duration`, then read it back with
`Gregorian.utcInfo()`, which reports the moment's calendar fields without
re-applying the device's own timezone.

DST windows are computed from the legal rule definitions (2nd Sunday of
March / 1st Sunday of November for the US; last Sunday of March / October
at 01:00 UTC for the EU; first Sunday of October / April for Australia;
last Sunday of September / first Sunday of April for New Zealand) rather
than hard-coded dates, so the face stays correct year over year.

**Known limitation:** the "+1/-1" day badge is a best-effort comparison of
calendar day-of-month between two cities and does not handle the rare case
where a pair of selected cities is a full two calendar days apart. The
underlying *time* shown is unaffected — only the badge is cosmetic.

## Customizing cities & theme

Users edit the four `World City N` settings and the `Color Theme` setting
from the Garmin Connect mobile app (or Garmin Express) once the face is
installed on a device, the same as any other Connect IQ app setting. The
available city list and defaults live in `resources/settings/settings.xml`
and `resources/settings/properties.xml`; keep their city ordering in sync
with `CityData.CITIES` if you add or reorder cities.

## Building & testing

This repo contains source only — building requires the Garmin Connect IQ
SDK, which isn't installed in this environment.

1. Install the [Connect IQ SDK Manager](https://developer.garmin.com/connect-iq/sdk/)
   and the [Monkey C VS Code extension](https://marketplace.visualstudio.com/items?itemName=garmin.monkey-c),
   or use the legacy Eclipse-based IDE.
2. Open this directory (`ventures/garmin-world-traveler-watchface`) as the
   Connect IQ project root — it's where `manifest.xml` lives.
3. Generate a developer certificate the first time (VS Code command
   "Monkey C: Generate Developer Key Pair") if you don't already have one.
4. Build and run in the simulator: VS Code command "Monkey C: Run Current
   Project in the Simulator" (or `monkeydo` from the CLI once you've built
   a `.prg` with `monkeyc`). Pick a target device from the picker — try a
   round AMOLED device (e.g. `venu3`) and a round MIP device (e.g.
   `fenix7`) to sanity-check both display types.
5. In the simulator, open the app's settings (simulator menu → Settings)
   to exercise the city pickers and theme switcher, and use the
   simulator's time-travel controls to jump across a DST boundary (e.g.
   step the simulated date to the second Sunday of March) to confirm a
   `:us` city's offset flips at the right moment.
6. Take your Connect IQ Store screenshots directly from the simulator
   (File → Save Screenshot) once the face looks right — those are the
   images that must accompany the store listing, not `docs/design-mockup.png`.

### Expanding device support

`manifest.xml` ships with a conservative, long-established set of device
ids across the fenix, epix, venu, vivoactive, forerunner, marq and descent
families. Garmin adds/renames device ids over time, so before your first
real build, use the VS Code extension's "Edit Application" / product
picker (or `connectiq --generate` device list) to refresh the `<iq:products>`
list against your installed SDK's current device catalog, and add any
newer watches (or drop ones you don't want to support).

## Publishing to the Connect IQ Store

1. **Developer account** — register at
   [apps.garmin.com](https://apps.garmin.com) / Connect IQ developer portal
   if you haven't already.
2. **App registration** — create a new "App" listing in the developer
   dashboard; this issues the Store-side app id (separate from the local
   `id` UUID in `manifest.xml`, which only matters for sideloading/builds).
3. **Signed release build** — build a release `.iq` package signed with
   your developer certificate (not the debug key used for simulator/device
   testing): VS Code command "Monkey C: Export Project" or `monkeyc -e`
   with your release `.der` key.
4. **Store listing assets** you'll need to prepare:
   - App name/description/keywords (this repo's working name is "World
     Traveler" — check availability in the store before finalizing).
   - Simulator screenshots for each supported device (or device family
     group) — see step 6 above.
   - The launcher icon is already bundled (`resources/drawables/launcher_icon.png`);
     the store may also ask for a larger promotional image — regenerate at
     a higher resolution from `/tmp/gen_icon.py`'s approach if so (script
     not checked into the repo; recreate with Pillow using the same motif).
   - Category: Watch Faces.
   - Price/monetization tier, if any.
5. **Privacy** — this app requests no permissions and collects no data, so
   the store's privacy questionnaire should be the simplest path (no
   privacy policy URL should be required, but confirm against the current
   Connect IQ Store submission form, since Garmin's requirements do
   change).
6. **Submit for review** and watch for Garmin's automated + manual review
   feedback; common rejection reasons for watch faces are missing device
   coverage for popular models, low-battery-impact violations (not a
   concern here — no `onPartialUpdate`/always-on ticking is implemented),
   and icon/screenshot mismatches with the actual running app.

## Roadmap / possible follow-ups

- Always-on (AOD) support via `onPartialUpdate` for AMOLED devices, with a
  clipped low-power redraw region.
- A 5th/6th city slot on larger rectangular displays.
- Per-city custom labels (e.g. "Mum's House" instead of a city name).
- Localized strings for non-English markets.

## License

Not yet chosen — add a `LICENSE` file before publishing if you want an
explicit open-source license; the Connect IQ Store itself does not require
one.
