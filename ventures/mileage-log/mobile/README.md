# Mileage Log — phone app (Expo / React Native)

The one thing the web version cannot do: **record drives in the background**.
The phone's location service wakes the app with GPS fixes; a small, tested
state machine (`src/tripdetect.mjs`) opens a trip when you start driving and
closes it after you have been parked five minutes. Each finished drive waits in
a "To review" list where one tap picks business, medical, charity, commute or
personal. A tiny on-device model (`src/classify.mjs`) suggests the category
from how you classified drives to the same place before and says why. Trips
are saved in the same format as the web app, so the IRS-rate pricing, Schedule C
Part IV split, audit-readiness check and CSV export are shared (`../calc.mjs`).

## Why use it

Paid alternatives: MileIQ, Everlance, TripLog, QuickBooks Self-Employed
($6-15 a month, accounts, cloud copies of your location history). This is free,
open source, has no account, and never sends a location anywhere. It is built
for the person who would otherwise keep a notebook.

## Status: first working version, not yet run on a device

- Tested under `node --test` (`npm test`): detection (drive, red light vs real
  stop, walking, GPS teleports, missing speed), category suggestion, and the
  hand-off into the web app's trip format.
- The Expo screens, background task and permission flow are written to
  Expo SDK 53's documented API but **have not been run on a phone or emulator**
  in this repository's sandbox. Expect to fix small things on first run.
- Detection thresholds are untuned guesses; replaying real recorded days through
  `detectTrips` is the way to tune them.

## Run it yourself

```
cd ventures/mileage-log/mobile
npm install
npx expo prebuild     # background location needs a dev build, not Expo Go
npm run android       # or: npm run ios
```

`bundleIdentifier` / `package` in `app.json` are placeholders: set your own.
Publishing to the App Store or Play Store is under your own developer account;
background-location apps need the stores' location-use review. Storage is
on-device only (AsyncStorage). Not tax advice.
