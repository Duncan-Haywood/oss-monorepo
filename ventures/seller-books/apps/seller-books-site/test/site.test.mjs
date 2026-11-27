// Build output checks: SEO tags, links, sitemap/llms.txt coverage, and the honesty rules in the copy.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { build, fileFor } from "../build.mjs";
import { BASE_PATH, PLATFORMS, SITE_URL, TIERS } from "../src/content.mjs";
import {
  COGS_EXAMPLE,
  cogsLines,
  DE_MINIMIS_ELECTION_TITLE,
  DE_MINIMIS_LIMIT_CENTS,
  EQUIPMENT_EXAMPLE,
  ESTIMATE_DUE_DATES_2026,
  ESTIMATE_EXAMPLE,
  ESTIMATE_RESULT,
  equipmentLine,
  FORM_1099K_EXAMPLE,
  HOME_OFFICE_EXAMPLE,
  HOME_OFFICE_MAX_SQFT,
  HOME_OFFICE_RATE_CENTS,
  homeOfficeLines,
  MILEAGE_EXAMPLE,
  MILEAGE_RATES,
  mileageLines,
} from "../src/pages.mjs";

let out;
let pages;
const base = () => join(out, BASE_PATH.slice(1));
const read = (rel) => readFileSync(join(base(), rel), "utf8");
const htmlOf = (page) => read(fileFor(page.path));

before(() => {
  out = mkdtempSync(join(tmpdir(), "seller-books-site-"));
  ({ pages } = build(out));
});
after(() => rmSync(out, { recursive: true, force: true }));

/** A served path under BASE_PATH → the file that serves it, or null for API endpoints. */
function fileForServed(path) {
  const rel = path.slice(BASE_PATH.length) || "/";
  if (rel.startsWith("/api/")) return null;
  if (/\.(txt|xml|css|svg)$/.test(rel)) return rel.slice(1);
  return fileFor(rel.replace(/\/$/, "") || "/");
}

describe("pages", () => {
  test("home, six platform pages, pricing, early access, llms.txt and sitemap exist", () => {
    const paths = pages.map((p) => p.path);
    for (const p of [
      "/",
      "/pricing",
      "/early-access",
      "/faq",
      "/schedule-c-worksheet",
      "/platforms",
    ]) {
      assert.ok(paths.includes(p), p);
    }
    for (const p of PLATFORMS) assert.ok(paths.includes(`/platforms/${p.slug}`), p.slug);
    assert.deepEqual(
      PLATFORMS.map((p) => p.name),
      [
        "eBay",
        "Poshmark",
        "Mercari",
        "Whatnot",
        "Depop",
        "Etsy",
        "Shopify",
        "Amazon",
        "TikTok Shop",
        "Square",
      ],
    );
    for (const f of ["llms.txt", "llms-full.txt", "sitemap.xml", "robots.txt", "404.html"]) {
      assert.ok(existsSync(join(base(), f)), f);
    }
    assert.ok(existsSync(join(out, "_headers")));
  });

  test("each page: one h1, a title, a description, canonical (or noindex), valid JSON-LD", () => {
    for (const page of pages) {
      const html = htmlOf(page);
      assert.equal(html.match(/<h1[ >]/g)?.length, 1, `${page.path} h1`);
      assert.match(html, /<title>[^<]{5,70}<\/title>/, `${page.path} title`);
      const desc = /<meta name="description" content="([^"]+)">/.exec(html)?.[1];
      assert.ok(desc && desc.length <= 200, `${page.path} description`);
      if (page.noindex) assert.match(html, /noindex/);
      else
        assert.ok(
          html.includes(
            `<link rel="canonical" href="${SITE_URL}${page.path === "/" ? "/" : page.path}">`,
          ),
          page.path,
        );
      for (const m of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)) {
        JSON.parse(m[1]);
      }
      // No executable script anywhere (CSP is script-src 'none').
      assert.equal(
        html.replace(/<script type="application\/ld\+json">.*?<\/script>/g, "").includes("<script"),
        false,
      );
    }
  });

  test("every internal link resolves to a built file", () => {
    for (const page of pages) {
      const html = htmlOf(page);
      for (const m of html.matchAll(/(?:href|action)="(\/[^"#?]*)/g)) {
        assert.ok(m[1].startsWith(BASE_PATH), `${page.path}: ${m[1]} outside base path`);
        const file = fileForServed(m[1]);
        if (file) assert.ok(existsSync(join(base(), file)), `${page.path} → ${m[1]} (${file})`);
      }
    }
  });

  test("early-access form on home, every platform page, pricing and the form page", () => {
    const withForm = [
      "/",
      "/pricing",
      "/early-access",
      ...PLATFORMS.map((p) => `/platforms/${p.slug}`),
    ];
    for (const path of withForm) {
      const html = htmlOf(pages.find((p) => p.path === path));
      assert.match(html, /action="\/seller-books\/api\/early-access\/subscribe"/, path);
      assert.match(html, new RegExp(`name="source" value="${path}"`), path);
      assert.match(html, /name="website"[^>]*tabindex="-1"/, `${path} honeypot`);
    }
  });
});

describe("crawler files", () => {
  test("sitemap lists exactly the indexable pages", () => {
    const xml = read("sitemap.xml");
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const expected = pages
      .filter((p) => !p.noindex)
      .map((p) => `${SITE_URL}${p.path === "/" ? "/" : p.path}`);
    assert.deepEqual(locs, expected);
    assert.ok(!xml.includes("thanks"));
  });

  test("llms.txt links only to sitemap pages and states the honest framing", () => {
    const txt = read("llms.txt");
    const sitemap = read("sitemap.xml");
    for (const m of txt.matchAll(/\]\((https:[^)]+)\)/g)) {
      if (m[1].endsWith("llms-full.txt")) continue;
      assert.ok(sitemap.includes(`<loc>${m[1]}</loc>`), m[1]);
    }
    assert.match(txt, /^# Seller Books\n\n> /);
    assert.match(txt, /early access/);
    assert.match(txt, /not a tax adviser/);
    assert.match(txt, /working name/);
  });

  test("robots.txt allows the site, disallows the API, names AI crawlers and the sitemap", () => {
    const txt = read("robots.txt");
    assert.match(txt, /Disallow: \/seller-books\/api\//);
    for (const bot of ["ClaudeBot", "GPTBot", "PerplexityBot"])
      assert.match(txt, new RegExp(`User-agent: ${bot}`));
    assert.match(txt, /Sitemap: https:\/\/marisstella\.app\/seller-books\/sitemap\.xml/);
  });

  test("_headers sets a no-script CSP for the base path", () => {
    const h = readFileSync(join(out, "_headers"), "utf8");
    assert.match(h, /^\/seller-books\/\*$/m);
    assert.match(h, /script-src 'none'/);
    assert.match(h, /frame-ancestors 'none'/);
  });
});

describe("honesty rules", () => {
  const allText = () =>
    [...pages.map(htmlOf), read("llms.txt"), read("llms-full.txt")].join("\n").toLowerCase();

  test("every page says early access and not tax advice", () => {
    for (const page of pages) {
      const html = htmlOf(page);
      assert.match(html, /early access/i, page.path);
      assert.match(html, /not a tax adviser/, page.path);
    }
  });

  test("no testimonials, ratings, savings claims or fear marketing", () => {
    const text = allText();
    for (const banned of [
      "testimonial",
      "aggregaterating",
      "reviewcount",
      "trusted by",
      "thousands of",
      "save you",
      "you'll save",
      "saves you",
      "audit-proof",
      "irs is watching",
      "irs is coming",
      "guarantee",
      "$600",
      "$5,000",
    ]) {
      assert.ok(!text.includes(banned), banned);
    }
  });

  test("$2,500 appears only as the de minimis safe harbor limit, never as a 1099-K amount", () => {
    // The old $600 / $2,500 / $5,000 1099-K phase-in amounts are fear marketing and no longer apply. The
    // equipment page states the de minimis safe harbor's $2,500, so the ban is on the figure outside that
    // context: every sentence (or table row) carrying it must name the de minimis limit or be about one item.
    const text = allText().replace(/<[^>]+>/g, " ");
    const sentences = text.split(/(?<=[.:?!])\s+|\n+/).filter((s) => s.includes("$2,500"));
    for (const s of sentences) {
      assert.ok(!/1099/.test(s), s);
      assert.match(s, /de minimis|or less an item|form 4562|over \$2,500/, s);
    }
  });

  test("1099-K: only the federal $20,000 / 200 threshold is stated", () => {
    const text = allText();
    for (const m of text.matchAll(/1099-k[^.]*\./g)) {
      const amounts = m[0].match(/\$[\d,]+/g) ?? [];
      for (const a of amounts) assert.equal(a, "$20,000", m[0]);
    }
    assert.match(text, /over \$20,000 and more than 200 transactions/);
  });

  test("the invented worked example adds up", () => {
    const html = htmlOf(pages.find((p) => p.path === "/"));
    assert.match(html, /An invented example/);
    assert.ok(Math.abs(40 - 6.1 - 5.25 - 8 - 20.65) < 1e-9);
    assert.match(html, /\$20\.65/);
  });
});

describe("the 1099-K page", () => {
  const page = () => pages.find((p) => p.path === "/1099-k");

  test("quotes box 1a's IRS definition and links the instructions", () => {
    const html = htmlOf(page());
    assert.match(html, /refunded amounts, shipping amounts, or any other amounts/);
    assert.ok(html.includes("https://www.irs.gov/instructions/i1099k"));
    assert.ok(html.includes('"@type":"FAQPage"'));
  });

  test("the invented example adds up and is labelled invented", () => {
    const html = htmlOf(page());
    const { itemSales, shippingPaid, refunds, fees } = FORM_1099K_EXAMPLE;
    const usd = (n) => `$${n.toLocaleString("en-US")}`;
    assert.match(html, /An invented example/);
    assert.ok(html.includes(usd(itemSales + shippingPaid)));
    assert.ok(html.includes(usd(itemSales + shippingPaid - refunds - fees)));
    assert.ok(html.includes(usd(refunds + fees)));
  });

  test("linked from the Schedule C page, every footer and llms.txt", () => {
    const link = `href="${BASE_PATH}/1099-k"`;
    assert.ok(htmlOf(pages.find((p) => p.path === "/schedule-c-worksheet")).includes(link));
    assert.ok(htmlOf(pages.find((p) => p.path === "/")).includes(link));
    assert.ok(read("llms.txt").includes(`${BASE_PATH}/1099-k)`));
  });
});

describe("the cost of goods sold page", () => {
  const page = () => pages.find((p) => p.path === "/cost-of-goods-sold");
  const usd = (n) => `$${n.toLocaleString("en-US")}`;

  test("quotes the IRS wording and links the instructions and Publication 334", () => {
    const html = htmlOf(page());
    assert.ok(html.includes("https://www.irs.gov/instructions/i1040sc"));
    assert.ok(html.includes("https://www.irs.gov/publications/p334"));
    assert.match(html, /you can choose not to keep an inventory/);
    assert.match(html, /\$31 million or less for the 3 prior tax years/);
    assert.match(html, /Freight-in, express-in, and cartage-in/);
    assert.ok(html.includes('"@type":"FAQPage"'));
  });

  test("the invented example follows Part III and is labelled invented", () => {
    const ex = COGS_EXAMPLE;
    const l = cogsLines(ex);
    assert.equal(l.line36, ex.purchases - ex.personalUse);
    assert.equal(l.line40, l.line35 + l.line36 + l.line39);
    assert.equal(l.line42, l.line40 - l.line41);
    assert.equal(l.line42, 5800, "1,800 + 6,250 - 2,250 by hand");
    const html = htmlOf(page());
    assert.match(html, /An invented example/);
    for (const n of [l.line35, l.line36, l.line40, l.line41, l.line42])
      assert.ok(html.includes(usd(n)), usd(n));
  });

  test("linked from the Schedule C page, every footer and llms.txt", () => {
    const link = `href="${BASE_PATH}/cost-of-goods-sold"`;
    assert.ok(htmlOf(pages.find((p) => p.path === "/schedule-c-worksheet")).includes(link));
    assert.ok(htmlOf(pages.find((p) => p.path === "/")).includes(link));
    assert.ok(read("llms.txt").includes(`${BASE_PATH}/cost-of-goods-sold)`));
  });
});

describe("the mileage deduction page", () => {
  const page = () => pages.find((p) => p.path === "/mileage-deduction");

  test("its rates are the app's own, period for period", () => {
    const src = readFileSync(
      new URL("../../seller-books/src/shared/reference/mileage-rates.ts", import.meta.url),
      "utf8",
    );
    const app = [
      ...src.matchAll(
        /\{ from: "([\d-]+)", to: "([\d-]+)", cents: ([\d.]+), source: "([^"]+)" \}/g,
      ),
    ].map(([, from, to, cents, source]) => ({ from, to, cents: Number(cents), source }));
    assert.ok(app.length >= MILEAGE_RATES.length);
    assert.deepEqual(app.slice(-MILEAGE_RATES.length), MILEAGE_RATES, "the latest periods match");
  });

  test("the invented 2026 example prices each half at its own rate", () => {
    const m = mileageLines();
    assert.equal(m.firstHalfRate, 72.5);
    assert.equal(m.secondHalfRate, 76);
    assert.equal(m.byTripDate, 87000 + 114000, "1,200 x 72.5c + 1,500 x 76c by hand");
    assert.equal(m.allAtJanuaryRate, 195750);
    assert.equal(m.allAtJulyRate, 205200);
    assert.equal(m.miles, MILEAGE_EXAMPLE.firstHalfMiles + MILEAGE_EXAMPLE.secondHalfMiles);
    const html = htmlOf(page());
    assert.match(html, /An invented example/);
    for (const s of ["$2,010.00", "$1,957.50", "$2,052.00", "1,200 business miles", "2,700 miles"])
      assert.ok(html.includes(s), s);
    assert.ok(!html.includes("$1,200 business"), "miles are not dollars");
  });

  test("links the IRS rates page and Publication 463, with FAQ markup", () => {
    const html = htmlOf(page());
    assert.ok(html.includes("https://www.irs.gov/tax-professionals/standard-mileage-rates"));
    assert.ok(html.includes("https://www.irs.gov/publications/p463"));
    assert.ok(html.includes('"@type":"FAQPage"'));
  });

  test("linked from the Schedule C page, every footer, llms.txt and the sitemap", () => {
    const link = `href="${BASE_PATH}/mileage-deduction"`;
    assert.ok(htmlOf(pages.find((p) => p.path === "/schedule-c-worksheet")).includes(link));
    assert.ok(htmlOf(pages.find((p) => p.path === "/")).includes(link));
    assert.ok(read("llms.txt").includes(`${BASE_PATH}/mileage-deduction)`));
    assert.ok(read("sitemap.xml").includes(`${BASE_PATH}/mileage-deduction`));
  });
});

describe("the home office and equipment page", () => {
  const page = () => pages.find((p) => p.path === "/home-office-and-equipment");
  const appSource = () =>
    readFileSync(
      new URL("../../seller-books/src/worker/services/books/schedule-c.ts", import.meta.url),
      "utf8",
    );

  test("its rate, square-foot cap, de minimis limit and statement title are the worksheet's own", () => {
    const src = appSource();
    const constant = (name) => {
      const m = src.match(new RegExp(`export const ${name} = ([^;]+);`));
      assert.ok(m, name);
      return m[1].trim();
    };
    assert.equal(
      Number(constant("HOME_OFFICE_RATE_CENTS").replaceAll("_", "")),
      HOME_OFFICE_RATE_CENTS,
    );
    assert.equal(
      Number(constant("HOME_OFFICE_MAX_SQFT").replaceAll("_", "")),
      HOME_OFFICE_MAX_SQFT,
    );
    assert.equal(
      Number(constant("DE_MINIMIS_LIMIT_CENTS").replaceAll("_", "")),
      DE_MINIMIS_LIMIT_CENTS,
    );
    assert.equal(constant("DE_MINIMIS_ELECTION_TITLE"), JSON.stringify(DE_MINIMIS_ELECTION_TITLE));
    // The same averaging and limit as the worksheet's homeOfficeLine30.
    assert.match(
      src,
      /Math\.round\(\(allowedSqft \* months\.size \* HOME_OFFICE_RATE_CENTS\) \/ 12\)/,
    );
    assert.match(src, /Math\.min\(fullCents, Math\.max\(0, line29Cents\)\)/);
    assert.match(src, /category === "equipment" && amountCents > DE_MINIMIS_LIMIT_CENTS/);
  });

  test("the invented examples add up by hand", () => {
    const h = homeOfficeLines();
    assert.equal(HOME_OFFICE_EXAMPLE.sqft, 150);
    assert.equal(h.averageSqft, 112.5, "150 sq ft x 9 months / 12");
    assert.equal(h.full, 56250, "112.5 x $5");
    assert.equal(h.limited, 40000, "held to $400 of line 29 profit");
    assert.equal(h.lost, 16250);
    assert.equal(h.yearCap, 150000, "300 sq ft x $5");
    assert.equal(
      homeOfficeLines({ sqft: 450, months: 12, thinProfitCents: 1e9 }).full,
      150000,
      "300 cap",
    );
    assert.equal(equipmentLine(250000), "Line 27a, its own row", "exactly the limit is de minimis");
    assert.equal(equipmentLine(250001), "Form 4562, then line 13");
    assert.deepEqual(
      EQUIPMENT_EXAMPLE.map((e) => equipmentLine(e.cents)),
      ["Line 27a, its own row", "Line 27a, its own row", "Form 4562, then line 13"],
    );
    const html = htmlOf(page());
    assert.match(html, /An invented example/);
    for (const s of [
      "$562.50",
      "$400.00",
      "$162.50",
      "$1,500.00",
      "112.5 sq ft average",
      "Laptop, $2,799.00",
    ])
      assert.ok(html.includes(s), s);
  });

  test("links the IRS pages, says what is not built, with FAQ markup", () => {
    const html = htmlOf(page());
    for (const url of [
      "https://www.irs.gov/publications/p587",
      "https://www.irs.gov/businesses/small-businesses-self-employed/faqs-simplified-method-for-home-office-deduction",
      "https://www.irs.gov/businesses/small-businesses-self-employed/tangible-property-final-regulations",
      "https://www.irs.gov/forms-pubs/about-form-4562",
    ])
      assert.ok(html.includes(url), url);
    assert.match(html, /regular method \(Form 8829\) and the depreciation itself are not built/);
    assert.match(html, /not carried forward/);
    assert.ok(html.includes('"@type":"FAQPage"'));
  });

  test("linked from the Schedule C page, every footer, llms.txt and the sitemap", () => {
    const link = `href="${BASE_PATH}/home-office-and-equipment"`;
    assert.ok(htmlOf(pages.find((p) => p.path === "/schedule-c-worksheet")).includes(link));
    assert.ok(htmlOf(pages.find((p) => p.path === "/")).includes(link));
    assert.ok(read("llms.txt").includes(`${BASE_PATH}/home-office-and-equipment)`));
    assert.ok(read("sitemap.xml").includes(`${BASE_PATH}/home-office-and-equipment`));
  });
});

describe("the quarterly estimated tax page", () => {
  const page = () => pages.find((p) => p.path === "/quarterly-estimated-tax");
  // The app's own engine (TypeScript, loaded by Node's type stripping: no build step, no dependency).
  const engine = () => import("../../seller-books/src/shared/estimated-tax.ts");
  const usd = (cents) =>
    `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  test("its 2026 due dates are the app's own", async () => {
    const { estimatedDueDates } = await engine();
    assert.deepEqual(estimatedDueDates(2026), ESTIMATE_DUE_DATES_2026);
  });

  test("the invented example's figures are what the app's engine gives", async () => {
    const { estimate } = await engine();
    const ex = ESTIMATE_EXAMPLE;
    const e = estimate({
      year: ex.year,
      filing: ex.filing,
      wages: 0,
      otherIncome: 0,
      asOf: `${ex.year}-12-31`,
      profitToDate: ex.profitToDate,
      withholding: 0,
      priorYearTax: ex.priorYearTax,
      priorAgiOver150k: false,
      paid: [0, 0, 0, 0],
    });
    const r = ESTIMATE_RESULT;
    assert.equal(e.projected.se.tax, r.seTax);
    assert.equal(e.projected.incomeTax, r.incomeTax);
    assert.equal(e.projected.total, r.total);
    assert.deepEqual(e.safeHarbor, {
      current90: r.current90,
      prior: r.prior,
      required: r.required,
    });
    assert.deepEqual(
      e.rows.map((x) => x.regularInstallment),
      r.regular,
    );
    assert.deepEqual(
      e.rows.map((x) => x.annualizedInstallment),
      r.annualized,
    );
    assert.equal(
      r.annualized.reduce((a, b) => a + b, 0),
      r.required,
      "both methods reach the required payment by January",
    );
    const ne = Math.round(ex.profitToDate[3] * 0.9235);
    assert.equal(
      r.seTax,
      Math.round(ne * 0.124) + Math.round(ne * 0.029),
      "15.3% of 92.35% by hand",
    );
  });

  test("the page shows the example, the dates and the safe harbours, and links the IRS", () => {
    const html = htmlOf(page());
    assert.match(html, /An invented example/);
    for (const n of [
      ESTIMATE_RESULT.total,
      ESTIMATE_RESULT.required,
      ...ESTIMATE_RESULT.annualized,
    ])
      assert.ok(html.includes(usd(n)), usd(n));
    for (const s of [
      "April 15, 2026",
      "June 15, 2026",
      "September 15, 2026",
      "January 15, 2027",
      "110%",
      "$184,500",
    ])
      assert.ok(html.includes(s), s);
    for (const u of [
      "https://www.irs.gov/forms-pubs/about-form-1040-es",
      "https://www.irs.gov/forms-pubs/about-form-2210",
      "https://www.irs.gov/forms-pubs/about-schedule-se-form-1040",
      "https://www.irs.gov/publications/p505",
    ])
      assert.ok(html.includes(u), u);
    assert.ok(html.includes('"@type":"FAQPage"'));
    assert.doesNotMatch(html, /\baudit/i, "no fear marketing");
  });

  test("linked from the Schedule C page, every footer, llms.txt and the sitemap", () => {
    const link = `href="${BASE_PATH}/quarterly-estimated-tax"`;
    assert.ok(htmlOf(pages.find((p) => p.path === "/schedule-c-worksheet")).includes(link));
    assert.ok(htmlOf(pages.find((p) => p.path === "/")).includes(link));
    assert.ok(read("llms.txt").includes(`${BASE_PATH}/quarterly-estimated-tax)`));
    assert.ok(read("sitemap.xml").includes(`${BASE_PATH}/quarterly-estimated-tax`));
    assert.ok(read("llms-full.txt").includes("Schedule AI"));
  });
});

describe("pricing tiers", () => {
  test("move up by order volume and platforms; annual is ten months", () => {
    for (let i = 1; i < TIERS.length; i++) {
      assert.ok(TIERS[i].monthly > TIERS[i - 1].monthly);
      assert.ok(TIERS[i].orders > TIERS[i - 1].orders);
    }
    for (const t of TIERS) assert.equal(t.annual, t.monthly * 10, t.key);
    assert.ok(
      TIERS[0].monthly >= 10 && TIERS[0].monthly <= 20,
      "entry tier sits in the $10–20 wedge",
    );
  });

  test("pricing page shows every tier and says nothing is charged during early access", () => {
    const html = htmlOf(pages.find((p) => p.path === "/pricing"));
    for (const t of TIERS) assert.ok(html.includes(`$${t.monthly}`), t.key);
    assert.match(html, /nothing is charged/);
    assert.match(html, /[Pp]roposed/);
  });
});
