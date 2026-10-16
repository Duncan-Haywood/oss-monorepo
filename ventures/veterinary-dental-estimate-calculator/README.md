# Veterinary Dental Estimate Calculator

A free browser tool for veterinary clinics: enter your own fees, costs and times and see an
**itemised dental estimate and clinic profit for each grade (1-4) of dental disease**, the profit per
anesthesia hour, the price that reaches your target margin, a suggested estimate range, and what a
single flat dental quote gives up over a year at your case mix. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/veterinary-dental-estimate-calculator/

## Model

- Estimate = cleaning + anesthesia hours x hourly charge + bloodwork + IV + radiographs + blocks and extraction fees per tooth + meds.
- Cost = supplies + per-tooth supplies + technician, veterinarian and overhead cost for the hours worked.
- Price for target margin = cost / (1 - margin).

Not modelled: referrals, rechecks, complications, discounts, financing and payment fees, tax.
The example numbers are illustrative, not a benchmark. Not veterinary, legal or financial advice.

## Run

Open `index.html` in a browser. Tests: `node --test`. MIT licensed; no secrets, no accounts, no network calls.
