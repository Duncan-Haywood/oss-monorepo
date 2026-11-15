# EU Battery Regulation Checker

Free, private browser tool for makers, importers and online sellers of batteries and battery-powered products: pick the battery type, your role and where you are established to see which duties of Regulation (EU) 2023/1542 reach you, the date each applies from (label, removability, QR code, battery passport, due diligence), whether an EU operator stands behind the battery, and which duties are still open.

**Live tool:** https://marisstella.app/eu-battery-regulation-checker/

After using this, you know which deadlines are already live (label since August 2026) and which are coming (passport and removability February 2027), instead of reading a 100-article Regulation.

Open `index.html`. Tests: `node --test 'ventures/eu-battery-regulation-checker/**/*.test.mjs'`.

**No warranty.** Free and as-is; not legal advice. Dates and Article numbers were first written from memory; on 2026-11-15 they were checked against the Official Journal text of Regulation (EU) 2023/1542 and the 2025/1561 amendment, and `calc.test.mjs` pins each start date and category set to that text. Later implementing and delegated acts can still move dates. See `VENTURE.yaml`.

## Known gaps

From the [2026-11-15 quality audit](../../portfolio/quality/audits/2026-11-15-eu-battery-regulation-checker.json), still open:

- Category labels are not checked against Art 3 limits (portable up to 5 kg, the 25 kg LMT ceiling, L-category vehicles over 25 kg as EV batteries); no weight or capacity input.
- Not modelled: Art 12 safety of stationary storage systems and Art 14 battery-management state-of-health data (both from 18 Aug 2024), Art 10 performance and durability, Art 11(7) spare-part availability, LMT recycled content from 18 Aug 2033.
