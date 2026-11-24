// The cull page in Chromium on Nikon Z8 NEFs shot in HLG tone mode, whose
// previews are HEVC. Two runs:
//   native: the page as is. Reports whether this Chromium has an HEVC decoder
//           (VideoDecoder.isConfigSupported) and what the page shows.
//   shim:   WebCodecs' VideoDecoder replaced by one that hands the chunk to
//           ffmpeg (outside the page) and returns the picture as an
//           ImageBitmap, standing in for Safari's or a hardware decoder, so
//           the page's path after decoding (grid, detail score, large view,
//           CSV) runs on the real 1620 x 1080 pictures.
// Both print bytes read, preview sizes per file, the large view's caption
// and page errors, and save grid and large-view screenshots.
//   node eval/cull-hevc-previews.mjs DIR OUT        (needs ffmpeg for the shim run)
import { createRequire } from "node:module";
import { readFileSync, readdirSync, mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)("playwright");
const [dir, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const site = join(dirname(fileURLToPath(import.meta.url)), "..", "site");
const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".webp": "image/webp" };
const files = readdirSync(dir).filter((n) => /\.nef$/i.test(n)).sort().map((n) => join(dir, n));
const work = mkdtempSync(join(tmpdir(), "hevc-"));

const SHIM = () => {
  class VideoDecoder {
    static async isConfigSupported(c) { return { supported: /^hev1\./.test(c.codec), config: c }; }
    constructor({ output, error }) { this.output = output; this.error = error; this.jobs = []; }
    configure(c) { this.config = c; }
    decode(chunk) {
      const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b);
      let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
      this.jobs.push(window.__ffmpegDecode(btoa(s)).then(async (png64) => {
        const bin = atob(png64), u = new Uint8Array(bin.length);
        for (let i = 0; i < u.length; i++) u[i] = bin.charCodeAt(i);
        const bmp = await createImageBitmap(new Blob([u], { type: "image/png" }));
        // An ImageBitmap with VideoFrame's size fields: drawImage takes either.
        Object.defineProperties(bmp, { displayWidth: { value: bmp.width }, displayHeight: { value: bmp.height } });
        this.output(bmp);
      }));
    }
    async flush() { await Promise.all(this.jobs); }
    close() {}
  }
  window.VideoDecoder = VideoDecoder;
};

async function run(mode) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 900 } });
  await ctx.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.hostname !== "site.local") return route.abort();
    const f = join(site, u.pathname === "/" ? "cull.html" : u.pathname.slice(1));
    route.fulfill({ body: readFileSync(f), contentType: types[extname(f)] || "application/octet-stream" });
  });
  let n = 0;
  if (mode === "shim") {
    await ctx.exposeFunction("__ffmpegDecode", (b64) => {
      const src = join(work, `${++n}.hevc`), png = join(work, `${n}.png`);
      writeFileSync(src, Buffer.from(b64, "base64"));
      execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "hevc", "-i", src, "-frames:v", "1", png]);
      return readFileSync(png).toString("base64");
    });
    await ctx.addInitScript(SHIM);
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("https://site.local/cull.html");
  const native = await page.evaluate(async () => typeof VideoDecoder === "function"
    ? (await VideoDecoder.isConfigSupported({ codec: "hev1.2.4.L120.B0.10" })).supported : "no WebCodecs");
  const t0 = Date.now();
  await page.setInputFiles("#pickFiles", files);
  await page.waitForFunction(() => /^\d+ files/.test(document.querySelector("#status")?.textContent || ""), null, { timeout: 600000 });
  const secs = (Date.now() - t0) / 1000;
  const status = await page.textContent("#status");
  await page.screenshot({ path: join(out, `grid-${mode}.png`) });
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.click("#dlCsv", { timeout: 30000 })]);
  const csv = readFileSync(await dl.path(), "utf8").trim().split("\n");
  const head = csv[0].split(",");
  const col = (r, name) => r.split(",")[head.indexOf(name)];
  const rows = csv.slice(1).map((r) => ({ file: col(r, "file"), preview: `${col(r, "preview_w")}x${col(r, "preview_h")}`, detail: col(r, "detail"), af_detail: col(r, "af_detail") }));
  await page.locator("#grid > *").first().dblclick();
  await page.waitForTimeout(1500);
  const caption = await page.evaluate(() => [...document.querySelectorAll("#loupe *, .loupe *")].map((e) => e.textContent).find((t) => /preview \d+×\d+/.test(t || "")) || "");
  await page.screenshot({ path: join(out, `loupe-${mode}.png`) });
  await browser.close();
  return { mode, chromium_hevc_supported: native, files: files.length, seconds: secs, status, decoded_by_ffmpeg: n, rows, caption: (caption.match(/preview \d+×\d+[^·|]*?(\)|$)/) || [caption.slice(0, 200)])[0], errors };
}

const runs = [];
for (const mode of ["native", "shim"]) runs.push(await run(mode));
console.log(JSON.stringify(runs, null, 1));
