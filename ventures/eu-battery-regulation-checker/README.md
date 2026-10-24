# EU Battery Regulation Checker

Free, private browser tool for makers, importers and online sellers of batteries and battery-powered products: pick the battery type, your role and where you are established to see which duties of Regulation (EU) 2023/1542 reach you, the date each applies from (label, removability, QR code, battery passport, due diligence), whether an EU operator stands behind the battery, and which duties are still open.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/eu-battery-regulation-checker/

After using this, you know which deadlines are already live (label since August 2026) and which are coming (passport and removability February 2027), instead of reading a 100-article Regulation.

Open `index.html`. Tests: `node --test 'ventures/eu-battery-regulation-checker/**/*.test.mjs'`.

**No warranty.** Free and as-is; not legal advice. Dates and Article numbers were written from memory and must be checked against the Regulation (CELEX 32023R1542) and later implementing acts. See `VENTURE.yaml`.
