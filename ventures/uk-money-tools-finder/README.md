# UK Money Tools Finder

Free, private browser page: tick what applies to you (employee, Scottish taxpayer, landlord, contractor, director, parent, buying a home, employing people) and get the matching UK tax, pay and employment calculators from this repository's 55 UK tools, most relevant first.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/uk-money-tools-finder/

After using this, you know which of the UK calculators answers your situation, without reading 54 landing pages.

Open `index.html`. Tests: `node --test 'ventures/uk-money-tools-finder/**/*.test.mjs'`. A test fails when a `uk-*` venture is added without being listed in `calc.mjs`, so the finder cannot go stale.

**No warranty.** Free and as-is; not tax advice. See `VENTURE.yaml`.
