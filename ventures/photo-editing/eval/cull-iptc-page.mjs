// The cull page's IPTC template, in headless Chromium, read back by ExifTool.
// Loads three NEFs from DIR (metadata-extractor-images) and a Lightroom-style
// sidecar (develop settings, a keyword, a French title) for one of them, fills
// the template with variables, adds keywords to one frame with K, rates two
// frames, downloads the zip and writes each sidecar to WORK/out for ExifTool.
//   python3 -m http.server 8765 -d site &
//   node eval/cull-iptc-page.mjs http://localhost:8765/cull.html DIR WORK
//   exiftool -j -G1 -XMP-dc:all -XMP-photoshop:all -XMP-iptcCore:all -XMP-xmp:Rating -XMP-xmp:Label -XMP-crs:Exposure2012 WORK/out/*.xmp
import { loadPlaywright } from "../../../platform/pages/load-playwright.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const [url, dir, work] = process.argv.slice(2);
mkdirSync(join(work, "out"), { recursive: true });
const raws = ["nef/Nikon D810.nef", "nef/Nikon D300.nef", "nef/Nikon D5100.nef"].map((r) => join(dir, r));
const lr = `<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 7.0">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
    xmlns:dc="http://purl.org/dc/elements/1.1/"
   xmp:MetadataDate="2026-01-02T03:04:05-08:00"
   xmp:Rating="2"
   crs:Exposure2012="+0.35"
   crs:CropTop="0.05">
   <dc:subject><rdf:Bag><rdf:li>landscape</rdf:li></rdf:Bag></dc:subject>
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">Old</rdf:li><rdf:li xml:lang="fr-FR">Vieux</rdf:li></rdf:Alt></dc:title>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
`;
const sc = join(work, "Nikon D810.xmp");
writeFileSync(sc, lr);

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage({ acceptDownloads: true });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept("Ice hockey, final; Ice hockey"));
await page.goto(url);
await page.setInputFiles("#pickFiles", [...raws, sc]);
await page.waitForFunction(() => /files/.test(document.getElementById("status").textContent) && document.getElementById("prog").hidden, null, { timeout: 60000 });
const tiles = await page.$$eval("#grid > *", (els) => els.map((e) => e.textContent.trim().replace(/\s+/g, " ")));
await page.click("#iptcBox summary");
await page.fill("#ip_creator", "Jane Doe");
await page.fill("#ip_copyright", "© {year} Jane Doe");
await page.fill("#ip_caption", "Shot on {camera} at {aperture}, {monthname} {day}, {year} ({stem}).");
await page.fill("#ip_keywords", "sample, {year}");
await page.fill("#ip_city", "Leeds");
await page.fill("#ip_country", "United Kingdom");
await page.fill("#ip_title", "New title");
const state = await page.textContent("#iptcState");
const preview = await page.textContent("#ipPreview");
await page.focus("#grid");
const at = (name) => tiles.findIndex((t) => t.startsWith(name));
const go = async (i) => { await page.keyboard.press("Home"); for (let k = 0; k < 10; k++) await page.keyboard.press("ArrowLeft"); for (let k = 0; k < i; k++) await page.keyboard.press("ArrowRight"); };
await go(at("Nikon D300")); await page.keyboard.press("k"); await page.keyboard.press("4");
await go(at("Nikon D810")); await page.keyboard.press("5");
const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#dlXmp")]);
const zipPath = join(work, "sidecars.zip");
await dl.saveAs(zipPath);
const after = await page.textContent("#status");
// Reload: the template and the frame's keywords come back from this browser's storage.
await page.reload();
const kept = await page.inputValue("#ip_copyright");
await browser.close();

const z = readFileSync(zipPath);
const names = [];
for (let p = 0; z.readUInt32LE(p) === 0x04034b50;) {
  const n = z.readUInt16LE(p + 26), len = z.readUInt32LE(p + 18);
  const name = z.subarray(p + 30, p + 30 + n).toString();
  writeFileSync(join(work, "out", name), z.subarray(p + 30 + n, p + 30 + n + len));
  names.push(name);
  p += 30 + n + len;
}
console.log(JSON.stringify({ tiles, state, preview, after, zip: names, templateAfterReload: kept, errors }, null, 1));
