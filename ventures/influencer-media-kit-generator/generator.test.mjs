import test from "node:test";
import assert from "node:assert/strict";
import {
  escapeHtml, parsePipeList, parsePlatforms, parseAudience, parseCollabs, parseTestimonials, parseRates,
  validateMediaKit, buildMediaKitHtml, buildOneSheetText,
} from "./generator.mjs";

test("escapeHtml neutralises every HTML-special character", () => {
  assert.equal(escapeHtml(`<script>alert("x")</script> & 'y'`),
    "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;");
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
});

test("parsePipeList skips blank lines and comments, trims fields", () => {
  const rows = parsePipeList(`
    # a comment

    Instagram | 42000 | 4.2% | https://instagram.com/x
    TikTok|118000|6.1%|https://tiktok.com/@x
  `, ["platform", "followers", "engagement", "url"]);
  assert.deepEqual(rows, [
    { platform: "Instagram", followers: "42000", engagement: "4.2%", url: "https://instagram.com/x" },
    { platform: "TikTok", followers: "118000", engagement: "6.1%", url: "https://tiktok.com/@x" },
  ]);
});

test("parsePipeList tolerates a short row, leaving later fields absent", () => {
  const rows = parsePipeList("Just a platform with nothing else", ["platform", "followers"]);
  assert.deepEqual(rows, [{ platform: "Just a platform with nothing else" }]);
});

test("parsePipeList drops a row with no usable first field", () => {
  assert.deepEqual(parsePipeList("| 42000", ["platform", "followers"]), []);
  assert.deepEqual(parsePipeList("", ["platform", "followers"]), []);
});

test("parsePlatforms / parseAudience / parseCollabs / parseTestimonials / parseRates map positionally", () => {
  assert.deepEqual(parsePlatforms("Instagram | 42000 | 4.2% | https://instagram.com/x"),
    [{ platform: "Instagram", followers: "42000", engagement: "4.2%", url: "https://instagram.com/x" }]);
  assert.deepEqual(parseAudience("Age 18-24 | 41%"), [{ label: "Age 18-24", value: "41%" }]);
  assert.deepEqual(
    parseCollabs("Acme Outdoors | Spring gear haul | https://example.com/post"),
    [{ brand: "Acme Outdoors", campaign: "Spring gear haul", url: "https://example.com/post" }],
  );
  assert.deepEqual(parseCollabs("Acme Outdoors | Spring gear haul"),
    [{ brand: "Acme Outdoors", campaign: "Spring gear haul" }]);
  assert.deepEqual(
    parseTestimonials("Easiest creator we've worked with. | Acme Outdoors"),
    [{ quote: "Easiest creator we've worked with.", source: "Acme Outdoors" }],
  );
  assert.deepEqual(parseRates("Instagram feed post | $450"), [{ service: "Instagram feed post", price: "$450" }]);
});

test("validateMediaKit requires a name and a bio, nothing else", () => {
  const empty = validateMediaKit({});
  assert.equal(empty.valid, false);
  assert.deepEqual(empty.errors, [
    "Creator or channel name is required.",
    "A bio is required — it's the one thing every media kit needs.",
  ]);

  const minimal = validateMediaKit({ creatorName: "Test Creator", bio: "I make things." });
  assert.equal(minimal.valid, true);
  assert.equal(minimal.errors.length, 0);
});

test("validateMediaKit warns on missing contact, platforms, rates, and photo without blocking", () => {
  const { valid, warnings } = validateMediaKit({ creatorName: "Test Creator", bio: "I make things." });
  assert.equal(valid, true);
  assert.ok(warnings.some((w) => /contact/i.test(w)));
  assert.ok(warnings.some((w) => /platforms/i.test(w)));
  assert.ok(warnings.some((w) => /rate card/i.test(w)));
  assert.ok(warnings.some((w) => /photo/i.test(w)));
});

test("validateMediaKit clears the platform warning when at least one is present", () => {
  const { warnings } = validateMediaKit({
    creatorName: "Test Creator", bio: "x",
    platformsRaw: "Instagram | 42000 | 4.2% | https://instagram.com/x",
  });
  assert.ok(!warnings.some((w) => /platforms/i.test(w)));
});

test("validateMediaKit clears the rate-card warning when at least one line item is present", () => {
  const { warnings } = validateMediaKit({
    creatorName: "Test Creator", bio: "x",
    ratesRaw: "Instagram feed post | $450",
  });
  assert.ok(!warnings.some((w) => /rate card/i.test(w)));
});

const FULL_DATA = {
  creatorName: "Jamie Rivers",
  tagline: "Travel and food, on a real budget",
  niche: "Travel, Food",
  location: "Portland, OR",
  bio: "Jamie Rivers has covered budget travel and street food since 2021.\n\nFeatured in two regional travel newsletters.",
  photoUrl: "https://example.com/photo.jpg",
  photoAlt: "Jamie Rivers on location",
  contactName: "Jamie Rivers",
  contactEmail: "partnerships@example.com",
  contactPhone: "555-0100",
  websiteUrl: "https://jamierivers.example",
  platformsRaw: "Instagram | 42000 | 4.2% | https://instagram.com/jamierivers\nTikTok | 118000 | 6.1% | https://tiktok.com/@jamierivers",
  audienceRaw: "Age 18-24 | 41%\nWomen | 68%\nUnited States | 57%",
  collabsRaw: "Acme Outdoors | Spring gear haul | https://example.com/post\nTrailhead Foods | Trail snack review",
  testimonialsRaw: "Easiest creator we've worked with, and the content converted. | Acme Outdoors",
  ratesRaw: "Instagram feed post | $450\nInstagram Story (3-frame) | $150\nTikTok video | $600",
  generatedOn: new Date("2026-09-11T00:00:00Z"),
};

test("buildMediaKitHtml renders a complete, well-formed document with every section", () => {
  const html = buildMediaKitHtml(FULL_DATA);
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /<title>Jamie Rivers — Media Kit/);
  assert.match(html, /<h1>Jamie Rivers<\/h1>/);
  assert.match(html, /Travel and food, on a real budget/);
  assert.match(html, /Featured in two regional travel newsletters\./);
  assert.match(html, /instagram\.com\/jamierivers/);
  assert.match(html, /118000/);
  assert.match(html, /6\.1% engagement/);
  assert.match(html, /41%/);
  assert.match(html, /Acme Outdoors/);
  assert.match(html, /Easiest creator we&#39;ve worked with/);
  assert.match(html, /Instagram feed post/);
  assert.match(html, /\$450/);
  assert.match(html, /partnerships@example\.com/);
  assert.match(html, /generated 2026-09-11/);
  assert.match(html, /@media print/);
});

test("buildMediaKitHtml escapes hostile input rather than injecting it", () => {
  const html = buildMediaKitHtml({
    creatorName: `<img src=x onerror=alert(1)>`,
    bio: `<script>alert('bio')</script>`,
  });
  assert.ok(!html.includes("<img src=x onerror"));
  assert.ok(!html.includes("<script>alert('bio')</script>"));
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test("buildMediaKitHtml omits empty optional sections cleanly", () => {
  const html = buildMediaKitHtml({ creatorName: "Solo Creator", bio: "Just one person and a camera." });
  assert.doesNotMatch(html, /<header>\s*<img/);
  assert.doesNotMatch(html, /Rate card/);
  assert.doesNotMatch(html, /Past partnerships/);
});

test("buildOneSheetText renders every section as plain text with no markup", () => {
  const text = buildOneSheetText(FULL_DATA);
  assert.ok(!text.includes("<"));
  assert.match(text, /^Jamie Rivers$/m);
  assert.match(text, /^ABOUT$/m);
  assert.match(text, /^REACH$/m);
  assert.match(text, /Instagram: 42000, 4\.2% engagement \(https:\/\/instagram\.com\/jamierivers\)/);
  assert.match(text, /^AUDIENCE$/m);
  assert.match(text, /^PAST PARTNERSHIPS$/m);
  assert.match(text, /Acme Outdoors — Spring gear haul/);
  assert.match(text, /^WHAT BRANDS SAY$/m);
  assert.match(text, /"Easiest creator we've worked with, and the content converted\." — Acme Outdoors/);
  assert.match(text, /^RATE CARD$/m);
  assert.match(text, /Instagram feed post: \$450/);
  assert.match(text, /^CONTACT$/m);
  assert.match(text, /partnerships@example\.com/);
});

test("buildOneSheetText degrades gracefully with only the required fields", () => {
  const text = buildOneSheetText({ creatorName: "Solo Creator", bio: "Just one person and a camera." });
  assert.match(text, /^Solo Creator$/m);
  assert.match(text, /Just one person and a camera\./);
  assert.ok(!text.includes("CONTACT"));
  assert.ok(!text.includes("undefined"));
});
