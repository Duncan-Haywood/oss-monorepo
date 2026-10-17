import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJsonLd, flattenEntities, validate, build, reportCsv, SUPPORTED_TYPES } from "./calc.mjs";

const wrap = (o) => `<html><head><script type="application/ld+json">${JSON.stringify(o)}</script></head></html>`;
const paths = (r, level) => r.entities.flatMap((e) => e.findings.filter((f) => !level || f.level === level).map((f) => f.path));

test("extracts several blocks from HTML and reports a broken one by position", () => {
  const html = `<script type="application/ld+json">{"@type":"Thing"}</script><script type='application/ld+json'>{bad,}</script>`;
  const { blocks, problems } = extractJsonLd(html);
  assert.equal(blocks.length, 1);
  assert.equal(problems.length, 1);
  assert.match(problems[0].path, /block 2/);
  assert.match(problems[0].message, /Invalid JSON/);
});

test("raw JSON, empty input and no-script input are explained", () => {
  assert.equal(extractJsonLd('{"a":1}').blocks.length, 1);
  assert.match(extractJsonLd("").problems[0].message, /Nothing to check/);
  assert.match(extractJsonLd("<html></html>").problems[0].message, /No <script/);
  assert.match(extractJsonLd("{oops").problems[0].message, /Invalid JSON/);
});

test("@graph is flattened and inherits @context", () => {
  const out = flattenEntities([{ "@context": "https://schema.org", "@graph": [{ "@type": "Organization" }, { "@type": "WebSite" }] }]);
  assert.equal(out.length, 2);
  assert.equal(out[0].context, "https://schema.org");
});

test("Product without name/offers/review is an error; complete product is eligible", () => {
  const bad = validate(wrap({ "@context": "https://schema.org", "@type": "Product" }));
  assert.ok(bad.errors >= 2);
  assert.ok(paths(bad, "error").includes("name"));
  assert.ok(paths(bad, "error").includes("offers"));
  const good = validate(wrap({ "@context": "https://schema.org", "@type": "Product", name: "Mug", image: "https://x.com/a.jpg", description: "d", brand: { name: "B" }, sku: "1",
    offers: { "@type": "Offer", price: "12.50", priceCurrency: "USD", availability: "https://schema.org/InStock" } }));
  assert.equal(good.errors, 0);
  assert.equal(good.warnings, 0);
  assert.equal(good.entities[0].eligible, true);
});

test("offer price with a currency symbol or comma is an error", () => {
  for (const price of ["$12.50", "1,200", "12 USD"]) {
    const r = validate(wrap({ "@context": "https://schema.org", "@type": "Product", name: "M", offers: { price, priceCurrency: "USD" } }));
    assert.ok(paths(r, "error").includes("offers.price"), price);
  }
  const free = validate(wrap({ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "App", offers: { price: 0, priceCurrency: "USD" } }));
  assert.equal(free.errors, 0);
});

test("lowercase currency and unknown availability warn", () => {
  const r = validate(wrap({ "@context": "https://schema.org", "@type": "Product", name: "M", offers: { price: "1", priceCurrency: "usd", availability: "in stock" } }));
  assert.ok(paths(r, "warning").includes("offers.priceCurrency"));
  assert.ok(paths(r, "warning").includes("offers.availability"));
});

test("missing @context and http context are distinguished", () => {
  assert.ok(paths(validate(wrap({ "@type": "Organization", name: "A" })), "error").includes("@context"));
  assert.ok(paths(validate(wrap({ "@context": "http://schema.org", "@type": "Organization", name: "A" })), "info").includes("@context"));
  assert.ok(paths(validate(wrap({ "@context": "https://example.com", "@type": "Organization" })), "error").includes("@context"));
});

test("FAQPage: question and answer text required, with the 2023 note", () => {
  const r = validate(wrap({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "Q?" }, { "@type": "Thing" }] }));
  assert.ok(paths(r, "error").includes("mainEntity[0].acceptedAnswer.text"));
  assert.ok(paths(r, "error").includes("mainEntity[1]"));
  assert.ok(r.entities[0].findings.some((f) => f.level === "info" && /August 2023/.test(f.message)));
  assert.ok(validate(wrap({ "@context": "https://schema.org", "@type": "FAQPage" })).errors >= 1);
});

test("LocalBusiness subtypes use the LocalBusiness rules", () => {
  const r = validate(wrap({ "@context": "https://schema.org", "@type": "Plumber", name: "Joe" }));
  assert.ok(paths(r, "error").includes("address"));
  const str = validate(wrap({ "@context": "https://schema.org", "@type": "Plumber", name: "Joe", address: "1 Main St" }));
  assert.ok(paths(str, "warning").includes("address"));
});

test("Article: string author, long headline and bad date warn", () => {
  const r = validate(wrap({ "@context": "https://schema.org", "@type": "BlogPosting", headline: "x".repeat(120), author: "Ann", datePublished: "March 1 2026" }));
  const w = paths(r, "warning");
  assert.ok(w.includes("author"));
  assert.ok(w.filter((p) => p === "headline").length >= 1);
  assert.ok(w.includes("datePublished"));
  assert.equal(validate(wrap({ "@context": "https://schema.org", "@type": "Article", headline: "H", image: "i", datePublished: "2026-03-01T09:00:00-05:00", dateModified: "2026-03-02", author: { "@type": "Person", name: "A" } })).errors, 0);
});

test("Recipe durations, Event location and JobPosting remote rules", () => {
  const rec = validate(wrap({ "@context": "https://schema.org", "@type": "Recipe", name: "Soup", image: "i", cookTime: "30 minutes" }));
  assert.ok(paths(rec, "warning").includes("cookTime"));
  const ev = validate(wrap({ "@context": "https://schema.org", "@type": "Event", name: "Gig", startDate: "2026-05-01", location: { "@type": "Place" } }));
  assert.ok(paths(ev, "error").includes("location.name"));
  assert.ok(paths(ev, "error").includes("location.address"));
  const job = validate(wrap({ "@context": "https://schema.org", "@type": "JobPosting", title: "Dev", description: "d", datePosted: "2026-01-01", hiringOrganization: { name: "A" }, jobLocationType: "TELECOMMUTE" }));
  assert.ok(paths(job, "error").includes("applicantLocationRequirements"));
  assert.ok(!paths(job, "error").includes("jobLocation"));
});

test("BreadcrumbList: order, missing item URL and missing name", () => {
  const r = validate(wrap({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home" }, { "@type": "ListItem", position: 3, name: "B" }] }));
  assert.ok(paths(r, "error").includes("itemListElement[0].item"));
  assert.ok(paths(r, "warning").includes("itemListElement[1].position"));
});

test("unknown types are informational, not errors", () => {
  const r = validate(wrap({ "@context": "https://schema.org", "@type": "WebSite", name: "x" }));
  assert.equal(r.errors, 0);
  assert.equal(r.entities[0].eligible, false);
  assert.ok(paths(r, "info").includes("@type"));
});

test("entity with no @type is an error and counts propagate", () => {
  const r = validate(wrap({ "@context": "https://schema.org", name: "x" }));
  assert.equal(r.errors, 1);
});

test("builders produce markup that validates with zero errors", () => {
  const cases = {
    FAQPage: { qa: "What is it?|A thing.\nCost?|Free | really" },
    Product: { name: "Mug", image: "https://x.com/m.jpg", description: "A mug", brand: "Acme", sku: "M1", price: "9.99", currency: "usd", url: "https://x.com/m" },
    LocalBusiness: { subtype: "Plumber", name: "Joe", url: "https://joe.example", phone: "+1-555-0100", image: "https://joe.example/a.jpg", street: "1 Main", city: "Austin", region: "TX", postal: "78701", country: "US", hours: "Mo-Fr 08:00-17:00" },
    Article: { headline: "H", image: "https://x.com/i.jpg", published: "2026-03-01", author: "Ann", publisher: "Pub", url: "https://x.com/a" },
    BreadcrumbList: { trail: "Home|https://x.com/\nShoes|https://x.com/shoes\nRed shoe" },
  };
  for (const [type, fields] of Object.entries(cases)) {
    const b = build(type, fields);
    assert.equal(b.check.errors, 0, `${type}: ${JSON.stringify(b.check.entities[0]?.findings)}`);
    assert.match(b.script, /^<script type="application\/ld\+json">/);
  }
  assert.equal(build("FAQPage", cases.FAQPage).json.mainEntity[1].acceptedAnswer.text, "Free | really");
  assert.equal(build("Product", cases.Product).json.offers.priceCurrency, "USD");
  assert.equal(build("BreadcrumbList", cases.BreadcrumbList).json.itemListElement[2].item, undefined);
});

test("builder output escapes < so a field cannot close the script tag", () => {
  const b = build("Article", { headline: "</script><img src=x onerror=alert(1)>" });
  assert.doesNotMatch(b.script.slice(b.script.indexOf("\n"), b.script.lastIndexOf("</script>")), /<\/script>/);
  assert.match(b.script, /\\u003c/);
  assert.equal(JSON.parse(b.script.replace(/^<script[^>]*>|<\/script>$/g, "")).headline, "</script><img src=x onerror=alert(1)>");
});

test("empty builder fields yield a check that explains what is missing", () => {
  const b = build("Product", {});
  assert.ok(b.check.errors >= 1);
  assert.deepEqual(build("Nope", {}).error, "No builder for Nope.");
});

test("csv escapes quotes and SUPPORTED_TYPES is stable", () => {
  const csv = reportCsv(validate(wrap({ "@context": "https://schema.org", "@type": "Product", name: 'The "Big" Mug' })));
  assert.match(csv, /^"entity","level","path","message"/);
  assert.match(csv, /Product The ""Big"" Mug/);
  assert.ok(SUPPORTED_TYPES.includes("JobPosting"));
});
