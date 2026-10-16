# Music Distribution Fee Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/music-distribution-fee-calculator/>

A free browser calculator for independent artists: enter releases per year and streams per month, edit each distributor's yearly fee, per-release fee and royalty cut, and see what you keep per year on DistroKid, TuneCore, CD Baby, Amuse, RouteNote and UnitedMasters, a cheapest-by-volume ladder, and the streams-per-month crossover where a flat plan starts beating a revenue share. Entirely client-side; nothing is uploaded.

After using this, you can now **pick the distributor that leaves the most at your volume, and know when to switch**, which used to mean building a spreadsheet from six pricing pages.

Scope: arithmetic on user-editable numbers, USD only. Preset schemes and the default payout per stream are approximate and unverified; the page says so. Not legal, tax or financial advice.

Run the tests: `node --test 'ventures/music-distribution-fee-calculator/**/*.test.mjs'`
