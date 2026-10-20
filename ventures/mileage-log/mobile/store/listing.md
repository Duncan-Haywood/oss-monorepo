# Store listing (copy, then fill in your own developer account)

Everything here is plain text you paste into App Store Connect and Play
Console. Limits are enforced by `store.test.mjs`. Use your own bundle
identifier / package name, privacy-policy URL and support email.

## Names and short text

- **Name (both stores, max 30):** Mileage Log: IRS Tracker
- **Apple subtitle (max 30):** Private auto mileage tracker
- **Play short description (max 80):** Automatic IRS mileage log. No account. Your location never leaves the phone.
- **Apple keywords (max 100, comma separated):** mileage,log,tracker,irs,tax,deduction,self employed,gig,driver,odometer,business miles

## Full description (max 4000)

Mileage Log keeps the mileage record the IRS asks for, without a subscription
and without sending your location to anyone.

It notices when you drive, records the start, end, distance and time, and lists
each drive for one-tap classification as business, commuting, medical, charity
or personal. Places you label once (the office, a client, the supplier) are
remembered, so the next drive there is filled in for you.

What you get
- Automatic drive detection in the background
- One-tap classification, with a suggested category from your own history
- Each trip priced at the IRS standard rate for its own date
- Schedule C Part IV numbers: business, commuting and other miles
- A year-end report to hand to a tax preparer, plus CSV export
- Several vehicles, each with its own totals
- Backup and restore as a file you control

Private by design
- No account, no sign-in, no ads, no analytics
- Locations are stored only on this phone
- No location is sent to any server, ours or anyone else's

Free and open source (MIT). If it saves you money you can donate to the creator
from the app. Mileage Log applies published rates to the trips you record. It
is not tax advice; confirm rates and rules at irs.gov or with a tax professional.

## Background location justification (paste into the store review forms)

Core feature: automatically logging the start, end and distance of the user's
drives so they can document business mileage. Background location is required
because the user cannot be expected to open the app before and after every
drive, and a log written at the time of the trip is what the IRS gives the most
weight. Location is processed on the device only. Foreground-only tracking
would miss every drive the user forgot to start. The user can turn tracking off
in the app at any time. For the Play Console video: show the permission prompt,
turn tracking on, take a short drive (or replay one), and show the drive
appearing in the list.

## Apple privacy labels ("App Privacy")

Data not collected. Location is processed on-device and never transmitted, so
nothing is "collected" in Apple's sense. No tracking.

## Google Play Data safety form

- Data collected: none. Data shared: none.
- Location is accessed (approximate and precise, including in the background)
  and processed only on the device.
- Encryption in transit: not applicable, nothing is transmitted.
- Users can delete trips inside the app; uninstalling removes all data.

## Category and rating

Finance (Apple) / Finance or Business (Google). Rating 4+/Everyone.
