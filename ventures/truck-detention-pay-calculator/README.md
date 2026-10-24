# Truck Detention Pay Calculator

A free browser calculator for owner-operators and drivers: turn gate arrival/departure times and the detention terms from a rate confirmation into billable hours, the dollars owed, real hourly pay with and without the claim, and a claim email to paste to the broker. Entirely client-side; nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/truck-detention-pay-calculator/

After using this, you can now **claim the detention you are owed in two minutes with the right numbers**, which used to mean doing the clock math by hand and writing the email from scratch.

- Clock starts at the later of arrival and appointment; free time, then rounded UP to the billing increment, optional per-stop cap.
- Two stops per run, overnight stays handled. Wall-clock times, no time zone (a daylight-saving change inside a stop is off by an hour).

Scope: arithmetic on the user's own times and terms; does not read the contract. Not legal or tax advice.

Run the tests: `node --test ventures/truck-detention-pay-calculator/*.test.mjs`
