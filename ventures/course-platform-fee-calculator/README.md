# Course Platform Fee Calculator

A free browser calculator for course creators and digital-product sellers: enter your price, monthly sales and refund rate, edit each platform's plan fee, transaction fee and card-processing treatment, and see what you keep per month on each, a cheapest-by-volume ladder, and the sales-per-month crossover where a flat-fee plan starts beating a percentage cut. Entirely client-side; nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/course-platform-fee-calculator/

After using this, you can now **pick the platform that leaves the most at your volume, and know when to switch**, which used to mean building a spreadsheet from five different pricing pages.

Scope: arithmetic on user-editable numbers, USD only. Beyond the six course platforms that load by default, a picker adds Lemon Squeezy, Paddle, Payhip, Ko-fi, Ko-fi Gold, Buy Me a Coffee, Patreon and Stan Store (2026-10-18, from secondary fee guides because the platforms' own pricing pages were unreachable from the build environment; Gumroad's card processing is now modelled as charged on top). The preset fee schedules are approximate and unverified; the page says so. Not legal, tax or financial advice.

Run the tests: `node --test ventures/course-platform-fee-calculator/*.test.mjs`
