# Security Deposit Deadline Checker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/tenant-security-deposit-deadline-checker/>

Free, private browser tool for tenants: pick a US state, enter the deposit, the move-out date and what has come back, and see the day the landlord's statutory deadline ran out, the statute it comes from, what that statute says about a landlord who misses it, and a demand (or forwarding-address, or deduction-dispute) letter that fills itself in. Covers 19 jurisdictions: AZ, CA, CO, DC, FL, GA, MA, MD, MI, MN, NC, NJ, NY, OH, OR, PA, TX, VA, WA.

Open `index.html`. Tests: `node --test 'ventures/tenant-security-deposit-deadline-checker/**/*.test.mjs'`.

General information, not legal advice. The statute table in `calc.mjs` is a best-effort summary (reviewed October 2026) and does not model city ordinances; check the current text before relying on it. Nothing typed is uploaded. See `VENTURE.yaml`.
