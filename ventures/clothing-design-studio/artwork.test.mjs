import test from "node:test";
import assert from "node:assert/strict";
import {
  printResolution, resolutionSummary, PPI_GUIDE, aicSearchUrl, aicImageUrl, parseAic, metSearchUrl, metIds,
  parseMetObject, onlyPaintings, searchMuseums, creditLine, saveHandoff, takeHandoff, HANDOFF_KEY,
} from "./artwork.mjs";

test("ppi is pixels over printed inches, worked by hand", () => {
  // 2953 px over 25 cm = 9.8425 in -> 300.0 ppi
  const r = printResolution({ widthPx: 2953, heightPx: 3691, printWidthCm: 25, method: "dtg" });
  assert.equal(r.ppi, 300);
  assert.equal(r.verdict, "sharp");
  assert.equal(r.enlargeBy, 1);
  assert.equal(r.printHeightCm, 31.2); // 25 * 3691/2953
  assert.equal(r.maxSharpCm, 25); // 2953/300*2.54 = 25.002
  assert.equal(r.maxOkCm, 50);
});

test("the studio's old 1400 px downscale is soft at a 25 cm chest print", () => {
  const r = printResolution({ widthPx: 1400, heightPx: 1750, printWidthCm: 25, method: "dtg" });
  assert.equal(r.ppi, 142); // 1400 / 9.8425 = 142.2
  assert.equal(r.verdict, "too-low");
  assert.equal(r.maxOkCm, 23.7); // 1400/150*2.54
  assert.equal(r.enlargeBy, 2.11);
  assert.match(r.notes.join(" "), /at most 23\.7 cm/);
});

test("843 px is acceptable for embroidery at 10 cm, too low for DTG at 25", () => {
  assert.equal(printResolution({ widthPx: 843, heightPx: 1000, printWidthCm: 10, method: "embroidery" }).verdict, "sharp"); // 214 ppi
  assert.equal(printResolution({ widthPx: 843, heightPx: 1000, printWidthCm: 25, method: "dtg" }).verdict, "too-low"); // 86 ppi
  assert.equal(printResolution({ widthPx: 1686, heightPx: 2000, printWidthCm: 25, method: "dtg" }).verdict, "acceptable"); // 171 ppi
});

test("raised inks have a higher floor than flat inkjet", () => {
  const args = { widthPx: 1700, heightPx: 2000, printWidthCm: 25 }; // 172.7 ppi
  assert.equal(printResolution({ ...args, method: "dtg" }).verdict, "acceptable");
  assert.equal(printResolution({ ...args, method: "high-density" }).verdict, "too-low");
  assert.ok(PPI_GUIDE.puff.min > PPI_GUIDE.dtg.min);
});

test("halftone ruling note for screen methods", () => {
  const r = printResolution({ widthPx: 900, heightPx: 900, printWidthCm: 25, method: "screen", lpi: 65 }); // 91 ppi < 97.5
  assert.match(r.notes.join(" "), /65 lpi halftone wants at least 98 ppi/);
  const ok = printResolution({ widthPx: 3000, heightPx: 3000, printWidthCm: 25, method: "screen", lpi: 65 });
  assert.doesNotMatch(ok.notes.join(" "), /lpi/);
  const dtg = printResolution({ widthPx: 900, heightPx: 900, printWidthCm: 25, method: "dtg", lpi: 65 });
  assert.doesNotMatch(dtg.notes.join(" "), /lpi/);
});

test("bad input is refused in plain words", () => {
  assert.throws(() => printResolution({ widthPx: 0, heightPx: 10, printWidthCm: 10 }), /Image width/);
  assert.throws(() => printResolution({ widthPx: 10, heightPx: 10, printWidthCm: -1 }), /Printed width/);
  assert.throws(() => printResolution({ widthPx: 10, heightPx: 10, printWidthCm: 10, method: "laser" }), /laser/);
  assert.match(resolutionSummary(printResolution({ widthPx: 2953, heightPx: 3691, printWidthCm: 25 })), /prints sharp.*300 ppi/);
});

test("Art Institute search URL asks for public-domain works only", () => {
  const u = new URL(aicSearchUrl("  madonna   and child "));
  assert.equal(u.origin + u.pathname, "https://api.artic.edu/api/v1/artworks/search");
  assert.equal(u.searchParams.get("q"), "madonna and child");
  assert.equal(u.searchParams.get("query[term][is_public_domain]"), "true");
  assert.match(u.searchParams.get("fields"), /image_id/);
  assert.throws(() => aicSearchUrl("   "), /Type something/);
  assert.equal(aicImageUrl("https://www.artic.edu/iiif/2/", "ab-12", 843), "https://www.artic.edu/iiif/2/ab-12/full/843,/0/default.jpg");
});

// Shape of the Art Institute API response (api.artic.edu/docs), values invented.
const AIC = {
  config: { iiif_url: "https://www.artic.edu/iiif/2" },
  data: [
    { id: 1, title: "Madonna and Child", artist_display: "Painter A\nItalian, 1400-1450", date_display: "c. 1430", image_id: "img-1", is_public_domain: true, classification_title: "painting", credit_line: "Gift of X", thumbnail: { width: 3000, height: 4000, alt_text: "A seated woman" } },
    { id: 2, title: "In copyright", image_id: "img-2", is_public_domain: false, classification_title: "painting" },
    { id: 3, title: "No image", image_id: null, is_public_domain: true, classification_title: "painting" },
    { id: 4, title: "A print", image_id: "img-4", is_public_domain: true, classification_title: "print", thumbnail: {} },
  ],
};

test("parseAic keeps public-domain works with images and reads the original size", () => {
  const r = parseAic(AIC);
  assert.deepEqual(r.map(x => x.id), ["1", "4"]);
  assert.equal(r[0].artist, "Painter A");
  assert.deepEqual(r[0].originalPx, { w: 3000, h: 4000 });
  assert.equal(r[0].image, "https://www.artic.edu/iiif/2/img-1/full/1686,/0/default.jpg");
  assert.equal(r[0].page, "https://www.artic.edu/artworks/1");
  assert.equal(r[1].originalPx, null);
  assert.deepEqual(onlyPaintings(r).map(x => x.id), ["1"]);
  assert.equal(onlyPaintings(r, false).length, 2);
  assert.deepEqual(parseAic(null), []);
});

const MET_OBJ = { objectID: 437, isPublicDomain: true, title: "The Annunciation", artistDisplayName: "Painter B", objectDate: "1480s", classification: "Paintings", primaryImage: "https://images.metmuseum.org/a.jpg", primaryImageSmall: "https://images.metmuseum.org/a-small.jpg", objectURL: "https://www.metmuseum.org/art/collection/search/437", creditLine: "Bequest of Y" };

test("Met search URL, ids and objects", () => {
  const u = new URL(metSearchUrl("annunciation"));
  assert.equal(u.searchParams.get("isPublicDomain"), "true");
  assert.equal(u.searchParams.get("hasImages"), "true");
  assert.deepEqual(metIds({ objectIDs: [5, "x", 7, -1, 9] }, 2), [5, 7]);
  assert.deepEqual(metIds({ objectIDs: null }), []);
  const r = parseMetObject(MET_OBJ);
  assert.equal(r.image, MET_OBJ.primaryImage);
  assert.equal(r.thumb, MET_OBJ.primaryImageSmall);
  assert.equal(parseMetObject({ ...MET_OBJ, isPublicDomain: false }), null);
  assert.equal(parseMetObject({ ...MET_OBJ, primaryImage: "" }), null);
  assert.equal(creditLine(r), 'Painter B, "The Annunciation", 1480s, The Metropolitan Museum of Art, (Bequest of Y), public domain');
});

test("searchMuseums merges both and survives one museum failing", async () => {
  const calls = [];
  const fake = async url => {
    calls.push(url);
    if (url.startsWith("https://api.artic.edu")) return { ok: true, json: async () => AIC };
    if (url.includes("/search?")) return { ok: true, json: async () => ({ objectIDs: [437, 438] }) };
    if (url.endsWith("/437")) return { ok: true, json: async () => MET_OBJ };
    return { ok: false, status: 404 };
  };
  const { records, errors } = await searchMuseums("annunciation", { fetch: fake });
  assert.deepEqual(records.map(r => r.source + r.id).sort(), ["aic1", "met437"]);
  assert.deepEqual(errors, []);

  const down = async url => url.startsWith("https://api.artic.edu") ? { ok: false, status: 503 } : fake(url);
  const r2 = await searchMuseums("annunciation", { fetch: down });
  assert.deepEqual(r2.records.map(r => r.id), ["437"]);
  assert.deepEqual(r2.errors, ["Art Institute of Chicago: HTTP 503"]);
});

function memStore() { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m }; }

test("hand-off to the studio is read once and refuses stale or foreign data", () => {
  const s = memStore();
  saveHandoff(s, { src: "data:image/jpeg;base64,AAAA", label: "Madonna", credit: "c", widthPx: 1686, heightPx: 2000 });
  const h = takeHandoff(s);
  assert.equal(h.label, "Madonna");
  assert.equal(h.widthPx, 1686);
  assert.equal(takeHandoff(s), null, "cleared after one read");
  assert.throws(() => saveHandoff(s, { src: "https://evil.example/x.jpg" }), /Only an image/);
  s.setItem(HANDOFF_KEY, JSON.stringify({ src: "data:image/png;base64,AA", at: Date.now() - 2 * 864e5 }));
  assert.equal(takeHandoff(s), null, "stale");
  s.setItem(HANDOFF_KEY, JSON.stringify({ src: "javascript:alert(1)", at: Date.now() }));
  assert.equal(takeHandoff(s), null, "not an image");
  s.setItem(HANDOFF_KEY, "{not json");
  assert.equal(takeHandoff(s), null);
});
