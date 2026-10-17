# Donor Acknowledgment Letter Generator

Free, private browser tool: paste a year's gift list and get one acknowledgment letter per donor with the wording a donor needs for a gift of $250 or more, the quid pro quo statement for a payment over $75 that bought something, property described and not valued, and vehicle gifts pointed to Form 1098-C. Gifts that cannot be written up as they stand (pledges, refunds, a missing date, a gala ticket with no value) are listed instead of guessed at. Downloads a printable one-letter-per-page file, a text version and a donor summary CSV.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/donor-acknowledgment-letter-generator/

Open `index.html`. Tests: `node --test 'ventures/donor-acknowledgment-letter-generator/**/*.test.mjs'`.

Not tax advice. The wording follows IRS Publication 1771 as read by the author, unreviewed by a tax professional; column names are alias-matched and have not been run against a real CRM export. See `VENTURE.yaml`.
