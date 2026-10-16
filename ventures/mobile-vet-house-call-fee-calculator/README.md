# Mobile Vet House-Call Fee Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/mobile-vet-house-call-fee-calculator/>

A free browser tool for mobile and house-call veterinarians: enter your own drive time, mileage, visit
times, supplies and fees and see the **loaded cost of one house call**, the visit fee and **travel-zone
surcharge** that reach your target margin, multi-pet and in-home euthanasia presets, the cost of
no-shows, and the **profit for a day** of N visits at your average drive time. Nothing is uploaded.

## Model

- Hours = drive both ways + setup + exam and treatment (+ minutes per extra pet) + charting.
- Cost = round-trip miles x cost per mile + (own hourly cost + assistant cost x share + forgone clinic-slot value) x hours + supplies.
- No-show drag = wasted-trip cost net of the no-show fee, spread over completed visits.
- Visit fee for target = cost / (1 - margin) - services billed; zone surcharge needed = zone cost gap over zone 1, grossed up.
- Day = N visits on a chained route with N + 1 legs at average drive time.

Not modelled: tax, payment fees, cremation fees, after-hours premiums, complications.
The example numbers are illustrative, not a benchmark. Not veterinary, legal or financial advice.

## Run

Open `index.html` in a browser. Tests: `node --test`. MIT licensed; no secrets, no accounts, no network calls.
