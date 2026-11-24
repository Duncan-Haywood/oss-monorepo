// The cull page's keyword list (a Lightroom Classic / Photo Mechanic export),
// in headless Chromium, read back by ExifTool. Loads two NEFs from DIR
// (metadata-extractor-images), a keyword list in Lightroom's export layout
// (tabs, [People] not exported, {synonyms}, a "Final" under two parents),
// a template keyword typed as a synonym ("hockey"), and per-frame keywords
// typed with K: a name, a synonym, an ambiguous name, a path to choose, and a
// keyword the list lacks. Rates both, downloads the zip and the "keywords
// used" list, reloads to check the list is kept.
//   python3 -m http.server 8765 -d site &
//   node eval/cull-keyword-list-page.mjs http://localhost:8765/cull.html DIR WORK
//   exiftool -j -G1 -XMP-dc:Subject -XMP-lr:HierarchicalSubject WORK/out/*.xmp
import { loadPlaywright } from "../../../platform/pages/load-playwright.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const [url, dir, work] = process.argv.slice(2);
mkdirSync(join(work, "out"), { recursive: true });
const raws = ["nef/Nikon D810.nef", "nef/Nikon D300.nef"].map((r) => join(dir, r));
const list = join(work, "lightroom-keywords.txt");
writeFileSync(list, "﻿" + ["[People]", "\tJane Roe", "\t\t{Jane}", "Places", "\tYorkshire", "\t\tLeeds", "\t\t\t{Leodis}", "Sport", "\tIce hockey", "\t\t{hockey}", "\t\tFinal", "\tFootball", "\t\tFinal", ""].join("\r\n"));

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage({ acceptDownloads: true });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const answers = ["Jane Roe, Leodis, Final, Gretzky", "Football > Final"];
page.on("dialog", (d) => d.accept(answers.shift()));
await page.goto(url);
await page.setInputFiles("#pickFiles", raws);
await page.waitForFunction(() => /files/.test(document.getElementById("status").textContent) && document.getElementById("prog").hidden, null, { timeout: 60000 });
const tiles = await page.$$eval("#grid > *", (els) => els.map((e) => e.textContent.trim().replace(/\s+/g, " ")));
await page.click("#iptcBox summary");
await page.setInputFiles("#kwListFile", list);
const listState = await page.textContent("#kwListState");
await page.fill("#ip_keywords", "hockey");
await page.focus("#grid");
const at = (name) => tiles.findIndex((t) => t.startsWith(name));
const go = async (i) => { await page.keyboard.press("Home"); for (let k = 0; k < 10; k++) await page.keyboard.press("ArrowLeft"); for (let k = 0; k < i; k++) await page.keyboard.press("ArrowRight"); };
await go(at("Nikon D300")); await page.keyboard.press("k"); await page.keyboard.press("4");
await go(at("Nikon D810")); await page.keyboard.press("k"); await page.keyboard.press("5");
const preview = await page.textContent("#ipPreview");
const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#dlXmp")]);
const zipPath = join(work, "sidecars.zip");
await dl.saveAs(zipPath);
const after = await page.textContent("#status");
const [kdl] = await Promise.all([page.waitForEvent("download"), page.click("#kwListSave")]);
await kdl.saveAs(join(work, "out", "shootflow-keywords.txt"));
const used = readFileSync(join(work, "out", "shootflow-keywords.txt"), "utf8");
await page.reload();
const listAfterReload = await page.textContent("#kwListState");
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
console.log(JSON.stringify({ tiles, listState, preview, after, zip: names, keywordsUsed: used.split("\n"), listAfterReload, errors }, null, 1));
