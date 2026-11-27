// End-to-end check of the WebCodecs HEIC path (src/shared/heif.ts, src/client/lib/heic-webcodecs.ts)
// in Chromium, against libheif's own decode of the same file.
//
// Playwright's Chromium has no HEVC decoder (VideoDecoder.isConfigSupported says no for every hvc1
// codec on Linux without one), so the one stand-in is the decoder itself: our parser runs in the page
// and hands back each tile's bytes and the hvcC record; ffmpeg's HEVC decoder decodes exactly those
// bytes (converted to Annex B); a stub VideoDecoder in the page checks that every chunk it is given
// is that tile's bytes and outputs ffmpeg's picture as a real VideoFrame. Everything else (the
// parser, the codec string, the canvas drawing, crop, rotation and mirror, the JPEG) is the real code.
// The JPEG is then compared with pillow-heif's decode (libheif + libde265, transforms applied).
//
// Needs: node with playwright (NODE_PATH=$(npm root -g)), ffmpeg, python3 with pillow and pillow-heif.
// Run from apps/payapps: NODE_PATH=$(npm root -g) node test/fixtures/pdf-sources/heic-webcodecs-check.cjs
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");

const app = path.resolve(__dirname, "../../..");
const fixtures = path.join(app, "test/fixtures");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "heic-check-"));
const python = process.env.PYTHON || "python3";

function esbuildBin() {
  const store = path.join(app, "../../node_modules/.pnpm");
  const dir = fs
    .readdirSync(store)
    .filter((d) => d.startsWith("esbuild@"))
    .sort()
    .pop();
  return path.join(store, dir, "node_modules/esbuild/bin/esbuild");
}

const bundle = execFileSync(
  esbuildBin(),
  [
    "--bundle",
    "--format=iife",
    `--alias:@shared=${path.join(app, "src/shared")}`,
    "--loader:.ts=ts",
  ],
  {
    input:
      'import { parseHeic } from "@shared/heif"; import { webCodecsHeic } from "./src/client/lib/heic-webcodecs";' +
      " window.parseHeic = parseHeic; window.webCodecsHeic = webCodecsHeic;",
    cwd: app,
  },
).toString();

/** hvcC + length-prefixed NAL units -> an Annex B stream ffmpeg reads. */
function annexB(hvcc, data) {
  const sc = Buffer.from([0, 0, 0, 1]);
  const parts = [];
  const lengthSize = (hvcc[21] & 3) + 1;
  let p = 23;
  for (let a = 0, n = hvcc[22]; a < n; a++) {
    const count = hvcc.readUInt16BE(p + 1);
    p += 3;
    for (let k = 0; k < count; k++) {
      const len = hvcc.readUInt16BE(p);
      parts.push(sc, hvcc.subarray(p + 2, p + 2 + len));
      p += 2 + len;
    }
  }
  for (let q = 0; q < data.length; ) {
    let len = 0;
    for (let i = 0; i < lengthSize; i++) len = len * 256 + data[q + i];
    parts.push(sc, data.subarray(q + lengthSize, q + lengthSize + len));
    q += lengthSize + len;
  }
  return Buffer.concat(parts);
}

const REFERENCE = `
import sys, numpy, pillow_heif
from PIL import Image
pillow_heif.register_heif_opener()
ref = Image.open(sys.argv[1]).convert("RGB")
def psnr(a, b):
    if a.size != b.size: return -1.0
    d = numpy.asarray(a, dtype=float) - numpy.asarray(b, dtype=float)
    m = (d * d).mean()
    return 99.0 if m == 0 else 10 * numpy.log10(255 * 255 / m)
for other in sys.argv[2:]:
    o = Image.open(other).convert("RGB")
    r = ref if o.size == ref.size else ref.resize(o.size, Image.LANCZOS)
    print(ref.size[0], ref.size[1], "%.2f" % psnr(r, o))
`;

(async () => {
  const server = http
    .createServer((_, res) => res.end("<!doctype html><title>check</title>"))
    .listen(0);
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}/`);
  await page.addScriptTag({ content: bundle });
  const supported = await page.evaluate(() =>
    VideoDecoder.isConfigSupported({ codec: "hvc1.1.6.L93.B0" }).then((r) => r.supported),
  );
  console.log(`this Chromium decodes HEVC itself: ${supported}`);
  const names = fs
    .readdirSync(fixtures)
    .filter((f) => f.endsWith(".heic"))
    .sort();
  let failures = 0;
  const outputs = {};
  for (const name of names) {
    const b64 = fs.readFileSync(path.join(fixtures, name)).toString("base64");
    const parsed = await page.evaluate((b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const img = window.parseHeic(bytes);
      if (!img) return null;
      const hex = (u) => Array.from(u, (v) => v.toString(16).padStart(2, "0")).join("");
      return {
        codec: img.codec,
        description: hex(img.description),
        tiles: img.tiles.map((t) => hex(t.data)),
      };
    }, b64);
    if (!parsed) {
      console.log(`${name}: not parsed`);
      failures++;
      continue;
    }
    const hvcc = Buffer.from(parsed.description, "hex");
    const pngs = parsed.tiles.map((hex, i) => {
      const h265 = path.join(work, `${name}-${i}.h265`);
      const png = path.join(work, `${name}-${i}.png`);
      fs.writeFileSync(h265, annexB(hvcc, Buffer.from(hex, "hex")));
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-y",
        "-f",
        "hevc",
        "-i",
        h265,
        "-frames:v",
        "1",
        "-pix_fmt",
        "rgb24",
        png,
      ]);
      return fs.readFileSync(png).toString("base64");
    });
    const result = await page.evaluate(
      async ({ b64, pngs, tiles }) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const hex = (u) => Array.from(u, (v) => v.toString(16).padStart(2, "0")).join("");
        const seen = [];
        class StubDecoder {
          constructor({ output, error }) {
            this.output = output;
            this.error = error;
            this.state = "unconfigured";
            this.pending = [];
          }
          static async isConfigSupported(config) {
            return {
              supported: config.codec.startsWith("hvc1.") && config.description.length > 0,
              config,
            };
          }
          configure() {
            this.state = "configured";
          }
          decode(chunk) {
            const data = new Uint8Array(chunk.byteLength);
            chunk.copyTo(data);
            const i = chunk.timestamp;
            if (chunk.type !== "key" || hex(data) !== tiles[i])
              throw new Error(`chunk ${i} is not tile ${i}'s bytes`);
            seen.push(i);
            this.pending.push(
              (async () => {
                const png = Uint8Array.from(atob(pngs[i]), (c) => c.charCodeAt(0));
                const bmp = await createImageBitmap(new Blob([png], { type: "image/png" }));
                this.output(new VideoFrame(bmp, { timestamp: i }));
                bmp.close();
              })(),
            );
          }
          async flush() {
            await Promise.all(this.pending);
          }
          close() {
            this.state = "closed";
          }
        }
        const env = {
          VideoDecoder: StubDecoder,
          EncodedVideoChunk,
          createCanvas: (w, h) => {
            const c = document.createElement("canvas");
            c.width = w;
            c.height = h;
            return c;
          },
        };
        const decoded = await window.webCodecsHeic(new Blob([bytes]), env);
        if (!decoded) return null;
        const b64of = async (blob) => {
          const buf = new Uint8Array(await blob.arrayBuffer());
          let s = "";
          for (const v of buf) s += String.fromCharCode(v);
          return btoa(s);
        };
        const jpeg = await b64of(await decoded.toJpeg(decoded.width, decoded.height, 0.95));
        // Scaled, as a large photo is drawn: tiles land at rounded edges on the smaller canvas.
        const sw = Math.round(decoded.width * 0.37);
        const sh = Math.round(decoded.height * 0.37);
        const small = await b64of(await decoded.toJpeg(sw, sh, 0.95));
        return {
          width: decoded.width,
          height: decoded.height,
          seen: seen.length,
          jpeg,
          small,
          sw,
          sh,
        };
      },
      { b64, pngs, tiles: parsed.tiles },
    );
    if (!result) {
      console.log(`${name}: webCodecsHeic returned null`);
      failures++;
      continue;
    }
    const out = path.join(work, `${name}.jpg`);
    fs.writeFileSync(out, Buffer.from(result.jpeg, "base64"));
    outputs[name] = out;
    const small = path.join(work, `${name}-small.jpg`);
    fs.writeFileSync(small, Buffer.from(result.small, "base64"));
    const [line, smallLine] = execFileSync(python, [
      "-c",
      REFERENCE,
      path.join(fixtures, name),
      out,
      small,
    ])
      .toString()
      .trim()
      .split("\n");
    const [w, h, psnr] = line.split(" ");
    const smallPsnr = smallLine.split(" ")[2];
    const ok =
      Number(w) === result.width &&
      Number(h) === result.height &&
      Number(psnr) >= 30 &&
      Number(smallPsnr) >= 28;
    if (!ok) failures++;
    console.log(
      `${name}: ${parsed.codec}, ${parsed.tiles.length} tile(s) fed and decoded; ours ${result.width} x ${result.height}, libheif ${w} x ${h}; PSNR ${psnr} dB; at ${result.sw} x ${result.sh} against libheif's resized ${smallPsnr} dB ${ok ? "ok" : "FAIL"}`,
    );
  }
  // The check can fail: a picture compared with the other orientation of the same size scores low.
  const rot = outputs["heic-grid-rot-libheif.heic"];
  const tr = outputs["heic-grid-transpose-libheif.heic"];
  if (rot && tr) {
    const cross = execFileSync(python, [
      "-c",
      REFERENCE,
      path.join(fixtures, "heic-grid-rot-libheif.heic"),
      tr,
    ])
      .toString()
      .trim()
      .split(" ")[2];
    console.log(
      `control: our transpose output against libheif's rotate-only picture: PSNR ${cross} dB (should be low)`,
    );
    if (Number(cross) >= 30) failures++;
  }
  await browser.close();
  server.close();
  console.log(failures === 0 ? "all ok" : `${failures} failure(s)`);
  process.exit(failures === 0 ? 0 : 1);
})();
