import test from "node:test";
import assert from "node:assert/strict";
import {
  escapeHtml, parsePipeList, parseLinkList, parseTourDates, parsePressQuotes,
  validateEpk, buildEpkHtml, buildOneSheetText,
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

    Spotify | https://open.spotify.com/artist/x
    Bandcamp|https://x.bandcamp.com
  `, ["label", "url"]);
  assert.deepEqual(rows, [
    { label: "Spotify", url: "https://open.spotify.com/artist/x" },
    { label: "Bandcamp", url: "https://x.bandcamp.com" },
  ]);
});

test("parsePipeList tolerates a short row, leaving later fields absent", () => {
  const rows = parsePipeList("Just a label with no url", ["label", "url"]);
  assert.deepEqual(rows, [{ label: "Just a label with no url" }]);
});

test("parsePipeList drops a row with no usable first field", () => {
  assert.deepEqual(parsePipeList("| https://example.com", ["label", "url"]), []);
  assert.deepEqual(parsePipeList("", ["label", "url"]), []);
});

test("parseLinkList / parseTourDates / parsePressQuotes map positionally", () => {
  assert.deepEqual(parseLinkList("Instagram | https://instagram.com/x"),
    [{ label: "Instagram", url: "https://instagram.com/x" }]);
  assert.deepEqual(
    parseTourDates("2026-10-04 | The Bell | Austin, TX | https://tix.example/1"),
    [{ date: "2026-10-04", venue: "The Bell", city: "Austin, TX", url: "https://tix.example/1" }],
  );
  assert.deepEqual(parseTourDates("2026-11-01 | The Loft"),
    [{ date: "2026-11-01", venue: "The Loft" }]);
  assert.deepEqual(
    parsePressQuotes("A tight, urgent set. | Local Weekly"),
    [{ quote: "A tight, urgent set.", source: "Local Weekly" }],
  );
});

test("validateEpk requires a name and a bio, nothing else", () => {
  const empty = validateEpk({});
  assert.equal(empty.valid, false);
  assert.deepEqual(empty.errors, [
    "Artist or band name is required.",
    "A bio is required — it's the one thing every press kit needs.",
  ]);

  const minimal = validateEpk({ artistName: "Test Band", bio: "We play music." });
  assert.equal(minimal.valid, true);
  assert.equal(minimal.errors.length, 0);
});

test("validateEpk warns on a missing contact, links, and photo without blocking", () => {
  const { valid, warnings } = validateEpk({ artistName: "Test Band", bio: "We play music." });
  assert.equal(valid, true);
  assert.ok(warnings.some((w) => /contact/i.test(w)));
  assert.ok(warnings.some((w) => /streaming or social/i.test(w)));
  assert.ok(warnings.some((w) => /photo/i.test(w)));
});

test("validateEpk clears the link warning when either streaming or social is present", () => {
  const { warnings } = validateEpk({
    artistName: "Test Band", bio: "x",
    streamingLinksRaw: "Spotify | https://open.spotify.com/artist/x",
  });
  assert.ok(!warnings.some((w) => /streaming or social/i.test(w)));
});

const FULL_DATA = {
  artistName: "Nova & The Static",
  tagline: "Fuzzed-out indie rock from the desert",
  location: "Tucson, AZ",
  genre: "Indie rock",
  bio: "Nova & The Static formed in 2023.\n\nThey have released two EPs.",
  photoUrl: "https://example.com/photo.jpg",
  photoAlt: "Nova & The Static performing live",
  contactName: "Jess Rivera",
  contactEmail: "booking@example.com",
  contactPhone: "555-0100",
  websiteUrl: "https://novaandthestatic.example",
  techRiderUrl: "https://example.com/rider.pdf",
  streamingLinksRaw: "Spotify | https://open.spotify.com/artist/x\nBandcamp | https://novaandthestatic.bandcamp.com",
  socialLinksRaw: "Instagram | https://instagram.com/novaandthestatic",
  tourDatesRaw: "2026-10-04 | The Bell | Austin, TX | https://tix.example/1\n2026-11-01 | The Loft | Denver, CO",
  pressQuotesRaw: "A tight, urgent set that earns its noise. | Local Weekly",
  generatedOn: new Date("2026-09-11T00:00:00Z"),
};

test("buildEpkHtml renders a complete, well-formed document with every section", () => {
  const html = buildEpkHtml(FULL_DATA);
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /<title>Nova &amp; The Static — Electronic Press Kit/);
  assert.match(html, /<h1>Nova &amp; The Static<\/h1>/);
  assert.match(html, /Fuzzed-out indie rock from the desert/);
  assert.match(html, /They have released two EPs\./);
  assert.match(html, /open\.spotify\.com\/artist\/x/);
  assert.match(html, /instagram\.com\/novaandthestatic/);
  assert.match(html, /The Bell/);
  assert.match(html, /Austin, TX/);
  assert.match(html, /A tight, urgent set/);
  assert.match(html, /booking@example\.com/);
  assert.match(html, /rider\.pdf/);
  assert.match(html, /generated 2026-09-11/);
  assert.match(html, /@media print/);
});

test("buildEpkHtml escapes hostile input rather than injecting it", () => {
  const html = buildEpkHtml({
    artistName: `<img src=x onerror=alert(1)>`,
    bio: `<script>alert('bio')</script>`,
  });
  assert.ok(!html.includes("<img src=x onerror"));
  assert.ok(!html.includes("<script>alert('bio')</script>"));
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test("buildEpkHtml omits empty optional sections cleanly", () => {
  const html = buildEpkHtml({ artistName: "Solo Act", bio: "Just one person and a guitar." });
  assert.doesNotMatch(html, /<header>\s*<img/);
  assert.doesNotMatch(html, /Tech rider/);
});

test("buildOneSheetText renders every section as plain text with no markup", () => {
  const text = buildOneSheetText(FULL_DATA);
  assert.ok(!text.includes("<"));
  assert.match(text, /^Nova & The Static$/m);
  assert.match(text, /^BIO$/m);
  assert.match(text, /^LISTEN$/m);
  assert.match(text, /Spotify: https:\/\/open\.spotify\.com\/artist\/x/);
  assert.match(text, /^UPCOMING SHOWS$/m);
  assert.match(text, /The Bell, Austin, TX/);
  assert.match(text, /^PRESS$/m);
  assert.match(text, /"A tight, urgent set that earns its noise\." — Local Weekly/);
  assert.match(text, /^CONTACT$/m);
  assert.match(text, /booking@example\.com/);
  assert.match(text, /Tech rider: https:\/\/example\.com\/rider\.pdf/);
});

test("buildOneSheetText degrades gracefully with only the required fields", () => {
  const text = buildOneSheetText({ artistName: "Solo Act", bio: "Just one person and a guitar." });
  assert.match(text, /^Solo Act$/m);
  assert.match(text, /Just one person and a guitar\./);
  assert.ok(!text.includes("CONTACT"));
  assert.ok(!text.includes("undefined"));
});
