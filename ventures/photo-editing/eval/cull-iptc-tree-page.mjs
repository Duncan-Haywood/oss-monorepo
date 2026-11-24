// The cull page's keyword tree and code replacements, in headless Chromium,
// read back by ExifTool. Loads two NEFs from DIR (metadata-extractor-images)
// and a Lightroom-style sidecar for the D810 that already has a keyword tree
// (lr:hierarchicalSubject "Events|Wedding"), loads a code list file, fills
// the template with a path keyword and codes, adds a path keyword with a
// code to the D300 with K, rates both and writes the zip's sidecars to
// WORK/out for ExifTool.
//   python3 -m http.server 8765 -d site &
//   node eval/cull-iptc-tree-page.mjs http://localhost:8765/cull.html DIR WORK
//   exiftool -j -G1 -XMP-dc:Subject -XMP-lr:HierarchicalSubject -XMP-dc:Description -XMP-photoshop:Headline -XMP-xmp:Rating -XMP-crs:Exposure2012 WORK/out/*.xmp
import { loadPlaywright } from "../../../platform/pages/load-playwright.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const [url, dir, work] = process.argv.slice(2);
mkdirSync(join(work, "out"), { recursive: true });
const raws = ["nef/Nikon D810.nef", "nef/Nikon D300.nef"].map((r) => join(dir, r));
const lr = `<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 7.0">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:lr="http://ns.adobe.com/lightroom/1.0/"
   xmp:Rating="2"
   crs:Exposure2012="+0.35">
   <dc:subject><rdf:Bag><rdf:li>Events</rdf:li><rdf:li>Wedding</rdf:li></rdf:Bag></dc:subject>
   <lr:hierarchicalSubject><rdf:Bag><rdf:li>Events|Wedding</rdf:li></rdf:Bag></lr:hierarchicalSubject>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
`;
const sc = join(work, "Nikon D810.xmp");
writeFileSync(sc, lr);
// A roster as a Photo Mechanic-style tab-separated code list (with a BOM, as Excel saves it).
const codes = join(work, "roster.txt");
writeFileSync(codes, "\uFEFF# home team\n23\tJane Roe\n7\tJohn Doe\nlds\tLeeds Rhinos\n");

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage({ acceptDownloads: true });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept("People > Players > \\7\\, \\lds\\"));
await page.goto(url);
await page.setInputFiles("#pickFiles", [...raws, sc]);
await page.waitForFunction(() => /files/.test(document.getElementById("status").textContent) && document.getElementById("prog").hidden, null, { timeout: 60000 });
const tiles = await page.$$eval("#grid > *", (els) => els.map((e) => e.textContent.trim().replace(/\s+/g, " ")));
await page.click("#iptcBox summary");
await page.setInputFiles("#ipCodes", codes);
const loaded = await page.textContent("#ipPreview");
await page.fill("#ip_headline", "\\23\\ scores for \\LDS\\");
await page.fill("#ip_caption", "\\23\\ of \\lds\\ on {monthname} {day}, {year}; \\99\\ is not a code.");
await page.fill("#ip_keywords", "Sport > Rugby league, People|Players|\\23\\, {year}");
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
const z = readFileSync(zipPath);
const names = [];
for (let p = 0; z.readUInt32LE(p) === 0x04034b50;) {
  const n = z.readUInt16LE(p + 26), len = z.readUInt32LE(p + 18);
  const name = z.subarray(p + 30, p + 30 + n).toString();
  writeFileSync(join(work, "out", name), z.subarray(p + 30 + n, p + 30 + n + len));
  names.push(name);
  p += 30 + n + len;
}
// Load the D810's written sidecar back as a template: its paths come back as paths, the code list is kept.
await page.setInputFiles("#ipLoad", join(work, "out", "Nikon D810.xmp"));
const fromXmp = { keywords: await page.inputValue("#ip_keywords"), codes: (await page.inputValue("#ip_codes")).split("\n").length, msg: await page.textContent("#ipPreview") };
// Reload: the code list comes back from this browser's storage.
await page.reload();
const codesKept = await page.inputValue("#ip_codes");
await browser.close();
console.log(JSON.stringify({ tiles, loaded, state, preview, after, zip: names, codesKeptAfterReload: codesKept.split("\n").length, fromXmp, errors }, null, 1));
