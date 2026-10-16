# EU Data Act Checker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/eu-data-act-checker/>

Free, private browser tool: pick your role (connected-product maker, related-service provider, data holder, third-party recipient or data processing service provider) and your whole-group size to see whether the EU Data Act (Regulation (EU) 2023/2854) likely applies, whether the Article 7 micro and small enterprise exemption covers you, which Article the call rests on, the result at each size class, and the main duties and dates for your role.

After using this, you know whether the Data Act's data-access or cloud-switching duties reach you, which date matters for your product, and which question (is it a connected product, larger partner, trade secrets) to put to your national authority or counsel.

Open `index.html`. Tests: `node --test 'ventures/eu-data-act-checker/**/*.test.mjs'`.

**No warranty.** Free and as-is; not legal advice. It reads the Regulation's text, not any national enforcement practice. See `VENTURE.yaml`.
