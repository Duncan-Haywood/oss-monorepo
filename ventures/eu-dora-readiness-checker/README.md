# EU DORA Readiness Checker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/eu-dora-readiness-checker/>

Free, private browser tool for financial entities and the software vendors that sell to them: say what kind of organisation you are and tick what you already have. It shows whether the Digital Operational Resilience Act (Regulation (EU) 2022/2554) reaches you, the duty areas and Article 30 contract terms still open, and, for a live major ICT incident, the 4-hour, 72-hour and one-month report deadlines.

After using this, you know whether DORA applies, what is missing, which contract terms your bank customers will ask a vendor for, and when each incident report is due, which used to take reading the Regulation plus the incident-reporting technical standards.

Open `index.html`. Tests: `node --test 'ventures/eu-dora-readiness-checker/**/*.test.mjs'`.

**No warranty.** Free and as-is; not legal advice. Check article numbers and periods against the Regulation (CELEX 32022R2554) and the current technical standards. Never enter real incident details. See `VENTURE.yaml`.
