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

## Named places, so the log passes its own audit

A drive is detected as two coordinates, but the IRS-style log (and this
repository's web audit) needs a destination and a purpose on every deductible
trip. Name a place once ("Home", "Smith job site", `src/places.mjs`) and every
later drive to or from it is labelled. A business destination remembers its
usual purpose and client, so the next drive there is pre-filled, and when the
category model is sure and the destination is named, **Confirm N drives I
recognise** files them in one tap. No reverse-geocoding service is used, because
that would send your coordinates to a third party. The app also lists recent
trips (with delete) and shares a tax-preparer report (the web app's standalone
HTML) or CSV.

## Vehicles and backup

Pick the vehicle a drive was made in (the standard rate and Schedule C Part IV
miles are per vehicle); it is stamped on every trip, so the web app's
per-vehicle split works on exported data. Because the log lives only on the
phone, **Back up my log** shares a JSON file (the web app's own export format,
plus places and vehicles); pasting it back merges by id and never deletes.

Drive detection also handles the phone going silent: iOS stops sending fixes
once the phone is still, so a gap of 15 minutes or more ends the open drive
where the car last moved, instead of gluing the next drive onto it
(`gap.test.mjs`).

## Why use it

Paid alternatives: MileIQ, Everlance, TripLog, QuickBooks Self-Employed
($6-15 a month, accounts, cloud copies of your location history). This is free,
open source, has no account, and never sends a location anywhere. It is built
for the person who would otherwise keep a notebook.

## Status: first working version, not yet run on a device

- Tested under `node --test` (`npm test`): named places and one-tap confirmation, a check that every name `App.js` imports exists, detection (drive, red light vs real
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
