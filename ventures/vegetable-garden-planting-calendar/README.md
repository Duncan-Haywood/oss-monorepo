# Vegetable Garden Planting Calendar

Free, browser-only planting calendar for home and market gardeners. Enter your
average last spring frost and first fall frost, tick your crops (34 built in),
and get a dated plan:

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/vegetable-garden-planting-calendar/

- when to **start seeds indoors**, and when to **transplant or sow**, counted
  from the last frost (hardy crops before it, tender ones after it; an optional
  "cautious" mode adds a week for tender and half-hardy crops);
- **succession plantings** at each crop's interval, stopping when there is no
  longer time to mature before frost (hardy crops get four weeks of grace after
  the first frost, half-hardy two, tender none);
- **cool-season crops** stop before summer heat (you can set the date) and get a
  second late-summer window for a fall harvest;
- **garlic** after the first fall frost, harvested the next summer;
- a month grid (S start, P plant, H harvest), a "next 30 days" list, and exports
  as a phone calendar file (.ics), CSV and plain text;
- southern-hemisphere dates: a fall frost that falls before the spring one is
  taken as the following year's.

Save the plan to a file and load it again next season. Nothing is uploaded.

Open `index.html` over any static server (it is an ES module page). No build
step, no dependencies. `node --test *.test.mjs` runs the suite.

- `calc.mjs` - the crop table, season validation, per-crop planning, garden plan,
  month grid, exports.
- `usage.mjs` - local-only feature counters with an opt-out.
- `when-to-start-seeds-indoors.html` - guide with a worked May 1 example that the
  test suite recomputes from the engine.

**No warranty.** Free and as-is; general gardening guidance for a typical year,
not a forecast and not agronomic advice. The timings are common extension-service
rules of thumb; check your local frost dates and your seed packet. No frost-date
database is bundled on purpose: the visitor supplies their own averages. The
property tests build plans across many frost-date combinations and every crop
and assert that no tender crop is planned before the last frost, no planting is
too late to mature, cool crops finish before the heat, and dates stay in order.

**Privacy.** Everything runs in your browser; dates and crop choices are never
uploaded. Anonymous feature counts stay in local storage and can be switched off.

MIT licence, see `LICENSE`.
