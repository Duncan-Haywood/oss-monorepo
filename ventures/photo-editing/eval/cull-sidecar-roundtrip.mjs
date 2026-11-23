// The cull page with existing sidecars, in headless Chromium: loads three raws
// from DIR (one rated in the camera) and a Lightroom-style sidecar for another,
// checks each frame's starting marks, re-rates, downloads the zip and reads
// every sidecar back.
//   python3 -m http.server 8765 -d site &
//   node eval/cull-sidecar-roundtrip.mjs http://localhost:8765/cull.html DIR WORK
import { loadPlaywright } from "../../../platform/pages/load-playwright.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { readXmp } from "../site/rawpreview.mjs";

const [url, dir, work] = process.argv.slice(2);
mkdirSync(work, { recursive: true });
const raws = ["dng/Pentax QS1.dng", "nef/Nikon D810.nef", "cr3/IMG_0036.CR3"].map((r) => join(dir, r));
const lr = `<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 7.0">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
   xmp:MetadataDate="2026-01-02T03:04:05-08:00"
   xmp:Rating="2"
   xmp:Label="Purple"
   crs:Exposure2012="+0.35"
   crs:CropTop="0.05"/>
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
await page.goto(url);
await page.setInputFiles("#pickFiles", [...raws, sc]);
await page.waitForFunction(() => /files/.test(document.getElementById("status").textContent) && document.getElementById("prog").hidden, null, { timeout: 60000 });
const status = await page.textContent("#status");
const tiles = await page.$$eval("#grid > *", (els) => els.map((e) => e.textContent.trim().replace(/\s+/g, " ")));
// Re-rate the sidecar's frame from the keyboard: 5 stars, Green (key 8).
await page.focus("#grid");
const d810 = tiles.findIndex((t) => t.startsWith("Nikon D810"));
for (let i = 0; i < d810; i++) await page.keyboard.press("ArrowRight");
await page.keyboard.press("5");
await page.keyboard.press("8");
const before = status;
// Download with the defaults (only marked frames).
const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#dlXmp")]);
const zipPath = join(work, "sidecars.zip");
await dl.saveAs(zipPath);
const after = await page.textContent("#status");
await browser.close();

// Read the stored zip back (no compression, so entries are contiguous).
const z = readFileSync(zipPath);
const out = [];
for (let p = 0; z.readUInt32LE(p) === 0x04034b50;) {
  const n = z.readUInt16LE(p + 26), len = z.readUInt32LE(p + 18);
  const name = z.subarray(p + 30, p + 30 + n).toString();
  const text = z.subarray(p + 30 + n, p + 30 + n + len).toString();
  out.push({ name, marks: readXmp(text), keptCrs: /crs:Exposure2012="\+0\.35"/.test(text) && /crs:CropTop="0\.05"/.test(text), metadataDate: (/xmp:MetadataDate="([^"]*)"/.exec(text) || [])[1] || null });
  p += 30 + n + len;
}
console.log(JSON.stringify({ status: before, tiles, rerated: "Nikon D810 to 5 stars, Green", after, zip: out, errors }, null, 1));
