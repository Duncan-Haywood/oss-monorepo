# World Clock Widget

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/world-clock-widget/>

An iPhone/iPad app (and, via "Designed for iPad" on Apple Silicon Macs, a Mac app) plus a
WidgetKit widget: pick a handful of major cities, and every widget size shows their current
local time, today's date, and sunrise/sunset — deliberately information-dense rather than a
single decorative clock face.

## What's here

```
Sources/
  WorldClockCore/     Platform-agnostic Swift: City model, city catalog, sunrise/sunset math,
                       time-zone-correct formatting, and the App Group store shared with the widget.
  WorldClockApp/       SwiftUI app: manage your list of cities, see time/sunrise/sunset for each.
  WorldClockWidget/    WidgetKit extension: small/medium/large/extra-large home screen widgets
                       plus lock screen (rectangular/inline) accessories, with a per-widget
                       "choose your cities" configuration via App Intents.
Tests/
  WorldClockCoreTests/ Unit tests for the sunrise/sunset calculator and clock snapshot logic.
project.yml            XcodeGen project spec — generates WorldClock.xcodeproj.
```

## Setup

This project uses [XcodeGen](https://github.com/yonaskolb/XcodeGen) instead of committing a
`.xcodeproj`, so the project file can't drift from `project.yml` and merge conflicts in
`project.pbxproj` are never a thing.

```sh
brew install xcodegen
cd ventures/world-clock-widget
xcodegen generate
open WorldClock.xcodeproj
```

Then in Xcode, for **both** the `WorldClockApp` and `WorldClockWidgetExtension` targets:

1. **Signing & Capabilities** → set your Team, and let Xcode adjust the bundle identifiers if
   `com.duncanhaywood.worldclock` / `.widget` / `.core` aren't available to your account.
2. Confirm the **App Groups** capability is present with `group.com.duncanhaywood.worldclock`
   (already wired up via `project.yml`'s `entitlements` blocks — Xcode just needs to register it
   against your Apple Developer account the first time you build).
3. The app icon is already checked in (`AppIcon-1024.png`, a globe/clock/sunrise motif matching
   the app's design language), so no icon work is needed before archiving.

Run the `WorldClock` scheme on a simulator or device. Long-press the home screen → **+** →
search "World Clock" to add the widget; long-press the widget → **Edit Widget** to choose which
cities it shows.

### Mac support

There's no separate macOS target. Instead, the app ships as a normal iOS/iPadOS app with the
iPad idiom enabled (`TARGETED_DEVICE_FAMILY = "1,2"`), which is what lets Apple Silicon Macs run
it — and its widget — unmodified as **"Mac (Designed for iPad)"**. That gets you iPhone, iPad,
and Mac from one codebase with the least moving parts. It does mean: Apple Silicon only (no
Intel Mac support), and no bespoke AppKit chrome (menu bar items, resizable-window affordances
beyond what iPad apps get for free). If you outgrow that, `WorldClockCore` is already
platform-agnostic Foundation code, so adding a native macOS + Catalyst target later is additive,
not a rewrite.

## Design choices

- **High information by default.** The default city selection
  (`CityCatalog.defaultCityIDs`) spans continents and hemispheres (London, New York, Los
  Angeles, São Paulo, Dubai, Mumbai, Tokyo, Sydney) so even an unconfigured widget reads as a
  useful world clock, not a single clock face. Every widget size — down to the small one — packs
  in city name, live time, date, and sunrise/sunset, not just digits.
- **No network calls, no API key.** Sunrise/sunset is computed on-device with the classic
  "Sunrise/Sunset Algorithm" from the *Almanac for Computers, 1990* (US Naval Observatory) —
  the same public-domain algorithm behind most open-source sunrise calculators. Accurate to
  roughly a minute outside the polar circles, which is what a clock widget needs.
- **Widget clocks tick without needing WidgetKit to refresh every minute.** `Text(date:style:)`
  always renders in the *device's* time zone, which is wrong for a world clock, so
  `CityTimelineProvider` instead pre-generates one timeline entry per minute for the next hour
  and formats each city's time explicitly in that city's own `TimeZone`.
- **The app and widget share a city list via an App Group.** Add a city in the app, and a
  freshly-placed widget defaults to that same set; each widget instance can still be configured
  independently via **Edit Widget**.

## Known limitations

- The city catalog is a fixed list of ~40 major cities (see `CityCatalog.swift`) rather than an
  arbitrary geocoded search — keeps the widget configuration UI (an `AppEnum`, which needs a
  finite case list) simple and avoids depending on a geocoding service.
- Sunrise/sunset math assumes a visible horizon and doesn't model elevation, which can shift
  real sunrise/sunset by a minute or two in mountainous cities.
- No city in the catalog sits inside the polar circles, so the "sun never rises/sets" case
  (`SolarCalculator` returns `nil`) is exercised in tests but not in the shipped UI.
- `WorldClockCore` (the platform-agnostic logic — city catalog, sunrise/sunset math,
  formatting, shared store) builds and its unit tests run on every push/PR via
  `.github/workflows/world-clock-widget-ci.yml`, using the `Package.swift` in this directory
  (a Linux-CI-only SPM manifest alongside `project.yml`; it doesn't replace the XcodeGen flow
  above). That was claimed here before it was true: the workflow's toolchain-install step
  404'd, so the job had never compiled the module at all, and when it finally did,
  `CityTimeFormatting` failed to build because `Date.FormatStyle` exists only in Apple's
  Foundation. "Platform-agnostic" is now a checked property rather than an intention — keep it
  that way by preferring APIs that swift-corelibs-foundation also has.
  `WorldClockApp` and `WorldClockWidgetExtension` depend on SwiftUI/WidgetKit/AppIntents
  and still have no macOS/Xcode toolchain available where this was written or in CI — they
  follow documented APIs but are unverified. Open the project in Xcode and smoke-test the app
  and widget on a simulator before relying on them.

## Tests

```sh
xcodegen generate
xcodebuild test -project WorldClock.xcodeproj -scheme WorldClock \
  -destination 'platform=iOS Simulator,name=iPhone 15'
```

`WorldClockCoreTests` covers the sunrise/sunset calculator (ordering, seasonal day-length trends
in both hemispheres, a sanity check against London's known summer-solstice sunrise/sunset, and
graceful `nil` handling at polar latitudes) and the clock snapshot's day/night and
day-offset-label logic.

## Support

This app is free. Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
never changes what it does or costs.
