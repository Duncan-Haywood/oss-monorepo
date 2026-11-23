import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readRaw, probeJpeg, captureMillis, groupBursts, sharpness, xmpSidecar, sidecarName,
  zipStored, crc32, isCandidateFile, readRawFile,
} from "./rawpreview.mjs";

// A marker-valid baseline JPEG of w x h (enough for the frame walk; not decodable pixels).
function jpeg(w, h, { sof = 0xc0, exifOrientation = 0 } = {}) {
  const out = [0xff, 0xd8];
  if (exifOrientation) {
    const tiff = tiffBytes([{ tag: 0x112, type: 3, value: exifOrientation }]);
    const len = 2 + 6 + tiff.length;
    out.push(0xff, 0xe1, len >> 8, len & 255, 0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff);
  }
  out.push(0xff, sof, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0);
  out.push(0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0);
  out.push(0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd9);
  return Uint8Array.from(out);
}

// Little-endian TIFF with one IFD of SHORT/LONG/ASCII entries.
function tiffBytes(entries, tail = new Uint8Array(0), magic = 42) {
  const n = entries.length;
  const ifdSize = 2 + n * 12 + 4;
  const extra = [];
  let extraAt = 8 + ifdSize;
  const buf = new Uint8Array(8 + ifdSize + 512 + tail.length);
  const dv = new DataView(buf.buffer);
  buf.set([0x49, 0x49]); dv.setUint16(2, magic, true); dv.setUint32(4, 8, true);
  dv.setUint16(8, n, true);
  entries.forEach((e, i) => {
    const at = 10 + i * 12;
    dv.setUint16(at, e.tag, true); dv.setUint16(at + 2, e.type, true);
    if (e.type === 2) {
      const s = new TextEncoder().encode(e.value + "\0");
      dv.setUint32(at + 4, s.length, true);
      if (s.length <= 4) buf.set(s, at + 8);
      else { dv.setUint32(at + 8, extraAt, true); extra.push([extraAt, s]); extraAt += s.length; }
    } else {
      dv.setUint32(at + 4, 1, true);
      if (e.type === 3) dv.setUint16(at + 8, e.value, true); else dv.setUint32(at + 8, e.value, true);
    }
  });
  for (const [at, s] of extra) buf.set(s, at);
  const tailAt = 8 + ifdSize + 512;
  buf.set(tail, tailAt);
  return buf;
}

test("TIFF raw: JPEGInterchangeFormat preview and IFD0 metadata", () => {
  const j = jpeg(6000, 4000);
  const tailAt = 8 + (2 + 5 * 12 + 4) + 512;
  const b = tiffBytes([
    { tag: 0x10f, type: 2, value: "NIKON CORPORATION" },
    { tag: 0x110, type: 2, value: "NIKON Z 6" },
    { tag: 0x112, type: 3, value: 6 },
    { tag: 0x201, type: 4, value: tailAt },
    { tag: 0x202, type: 4, value: j.length },
  ], j);
  const r = readRaw(b, "DSC_0001.NEF");
  assert.equal(r.format, "NEF");
  assert.equal(r.meta.make, "NIKON CORPORATION");
  assert.equal(r.meta.model, "NIKON Z 6");
  assert.equal(r.meta.orientation, 6);
  assert.deepEqual([r.preview.width, r.preview.height, r.preview.offset, r.preview.length], [6000, 4000, tailAt, j.length]);
});

test("lossless JPEG (raw sensor data) is not offered as a preview", () => {
  const j = jpeg(6000, 4000, { sof: 0xc3 });
  const tailAt = 8 + (2 + 2 * 12 + 4) + 512;
  const b = tiffBytes([{ tag: 0x201, type: 4, value: tailAt }, { tag: 0x202, type: 4, value: j.length }], j);
  assert.equal(readRaw(b, "x.dng").preview, null);
});

test("byte scan finds a preview no pointer names", () => {
  const j = jpeg(1600, 1200);
  const b = tiffBytes([{ tag: 0x10f, type: 2, value: "OLYMPUS" }], j, 0x4f52);
  const r = readRaw(b, "P1.ORF");
  assert.equal(r.format, "ORF");
  assert.equal(r.preview.width, 1600);
  assert.equal(r.preview.source, "scan");
});

test("RAF: preview from the header pointer, orientation from its own EXIF", () => {
  const j = jpeg(1920, 1280, { exifOrientation: 8 });
  const b = new Uint8Array(200 + j.length);
  b.set(new TextEncoder().encode("FUJIFILMCCD-RAW 0201FF383501"));
  new DataView(b.buffer).setUint32(84, 200, false);
  new DataView(b.buffer).setUint32(88, j.length, false);
  b.set(j, 200);
  const r = readRaw(b, "DSCF0001.RAF");
  assert.equal(r.format, "RAF");
  assert.equal(r.preview.width, 1920);
  assert.equal(r.meta.orientation, 8);
  // The browser rotates a JPEG with its own tag, so the page must not.
  assert.equal(r.preview.ownOrientation, 8);
});

function box(type, ...parts) {
  const body = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(8 + body);
  new DataView(out.buffer).setUint32(0, 8 + body);
  out.set(new TextEncoder().encode(type), 4);
  let o = 8;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
const u32be = (...v) => { const a = new Uint8Array(v.length * 4); v.forEach((x, i) => new DataView(a.buffer).setUint32(i * 4, x)); return a; };

test("CR3: the full-size JPEG from the first track's sample table", () => {
  const j = jpeg(6000, 4000);
  const ftyp = box("ftyp", new TextEncoder().encode("crx "), u32be(1));
  // moov > trak > mdia > minf > stbl > {stsz, co64}; offset patched below.
  const build = (off) => {
    const stsz = box("stsz", u32be(0, j.length, 1));
    const co64 = box("co64", u32be(0, 1, 0, off));
    return box("moov", box("trak", box("mdia", box("minf", box("stbl", stsz, co64)))));
  };
  const head = ftyp.length + build(0).length;
  const mdat = box("mdat", j);
  const b = new Uint8Array(head + mdat.length);
  b.set(ftyp); b.set(build(head + 8), ftyp.length); b.set(mdat, head);
  const r = readRaw(b, "IMG_0001.CR3");
  assert.equal(r.format, "CR3");
  assert.equal(r.preview.width, 6000);
  assert.equal(r.preview.source, "CR3 track");
});

test("probeJpeg finds the end of an unbounded JPEG past stuffed bytes", () => {
  const j = jpeg(10, 20);
  const p = probeJpeg(Uint8Array.from([...j, 1, 2, 3]), 0, 0);
  assert.equal(p.length, j.length);
  assert.equal(p.decodable, true);
});

test("a truncated or non-raw file gives no preview and does not throw", () => {
  assert.equal(readRaw(new Uint8Array(368).fill(7), "Issue.rw2").preview, null);
  assert.equal(readRaw(Uint8Array.from([0x49, 0x49, 0x55, 0, 8, 0, 0, 0, 255, 255]), "x.rw2").preview, null);
});

test("captureMillis: subseconds count, an unset clock is null", () => {
  assert.equal(captureMillis({ captured: "2024:05:01 10:00:00", subsec: "25" }) - captureMillis({ captured: "2024:05:01 10:00:00" }), 250);
  assert.equal(captureMillis({ captured: "0000:00:00 00:00:00" }), null);
});

test("groupBursts splits on gaps and on camera bodies", () => {
  const ids = groupBursts([
    { t: 0, body: "A" }, { t: 400, body: "A" }, { t: 5000, body: "A" }, { t: 300, body: "B" }, { t: null, body: "A" },
  ], 1500);
  assert.equal(ids[0], ids[1]);
  assert.notEqual(ids[1], ids[2]);
  assert.notEqual(ids[0], ids[3]);
  assert.equal(new Set(ids).size, 4);
});

test("sharpness ranks a sharp edge over a blurred one", () => {
  const w = 64, h = 64;
  const sharp = new Float32Array(w * h), soft = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    sharp[y * w + x] = (x >> 2) % 2 ? 255 : 0;
    soft[y * w + x] = 127 + 127 * Math.sin((x / 8) * Math.PI);
  }
  assert.ok(sharpness(sharp, w, h).peak > 10 * sharpness(soft, w, h).peak);
});

test("XMP sidecars carry rating, reject and label; names follow the chosen style", () => {
  assert.match(xmpSidecar({ rating: 4, label: "Green" }), /xmp:Rating="4" xmp:Label="Green"/);
  assert.match(xmpSidecar({ rating: 4, rejected: true }), /xmp:Rating="-1"/);
  assert.equal(sidecarName("IMG_0001.CR3"), "IMG_0001.xmp");
  assert.equal(sidecarName("IMG_0001.CR3", "darktable"), "IMG_0001.CR3.xmp");
});

test("stored ZIP: entries and CRCs read back", () => {
  const z = zipStored([{ name: "a.xmp", data: "hello" }, { name: "b.xmp", data: "world!" }]);
  const dv = new DataView(z.buffer);
  const eocd = z.length - 22;
  assert.equal(dv.getUint32(eocd, true), 0x06054b50);
  assert.equal(dv.getUint16(eocd + 10, true), 2);
  assert.equal(dv.getUint32(14, true), crc32(new TextEncoder().encode("hello")));
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("isCandidateFile keeps raws and JPEGs, drops sidecars", () => {
  assert.ok(isCandidateFile("A.CR3") && isCandidateFile("b.nef") && isCandidateFile("c.jpg"));
  assert.ok(!isCandidateFile("A.xmp") && !isCandidateFile("notes.txt"));
});

// A Blob that counts the bytes sliced out of it, standing in for a File.
function countingFile(bytes, name) {
  const blob = new Blob([bytes]);
  const f = { name, size: bytes.length, read: 0, whole: 0 };
  f.slice = (a, z) => { f.read += z - a; return blob.slice(a, z); };
  f.arrayBuffer = () => { f.whole++; f.read += bytes.length; return blob.arrayBuffer(); };
  return f;
}

test("readRawFile: a TIFF raw's preview past 8 MB of sensor data, read sparsely, same as a whole read", async () => {
  const j = jpeg(6000, 4000, { exifOrientation: 8 });
  const sensor = 8 << 20;
  const tailAt = 8 + (2 + 5 * 12 + 4) + 512;
  const head = tiffBytes([
    { tag: 0x10f, type: 2, value: "NIKON CORPORATION" },
    { tag: 0x110, type: 2, value: "NIKON Z 6" },
    { tag: 0x112, type: 3, value: 6 },
    { tag: 0x201, type: 4, value: tailAt + sensor },
    { tag: 0x202, type: 4, value: j.length },
  ]);
  const b = new Uint8Array(tailAt + sensor + j.length);
  b.set(head.subarray(0, tailAt));
  for (let i = tailAt; i < tailAt + sensor; i += 4096) b[i] = 0xff; // noise a scan would trip on
  b.set(j, tailAt + sensor);
  const whole = readRaw(b, "DSC_0001.NEF");
  const f = countingFile(b, "DSC_0001.NEF");
  const r = await readRawFile(f);
  assert.equal(r.sparse, true);
  assert.equal(f.whole, 0);
  assert.deepEqual({ meta: r.meta, preview: r.preview }, { meta: whole.meta, preview: whole.preview });
  assert.equal(r.preview.offset, tailAt + sensor);
  assert.ok(r.bytesRead < b.length / 10, `read ${r.bytesRead} of ${b.length}`);
});

test("readRawFile: a CR3 whose track points into a large mdat", async () => {
  const j = jpeg(6000, 4000);
  const ftyp = box("ftyp", new TextEncoder().encode("crx "), u32be(1));
  const build = (off) => box("moov", box("trak", box("mdia", box("minf", box("stbl",
    box("stsz", u32be(0, j.length, 1)), box("co64", u32be(0, 1, 0, off)))))));
  const pad = new Uint8Array(6 << 20);
  const headLen = ftyp.length + build(0).length;
  const mdat = box("mdat", pad, j);
  const b = new Uint8Array(headLen + mdat.length);
  b.set(ftyp); b.set(build(headLen + 8 + pad.length), ftyp.length); b.set(mdat, headLen);
  const f = countingFile(b, "IMG_0001.CR3");
  const r = await readRawFile(f);
  assert.equal(r.sparse, true);
  assert.equal(r.preview.source, "CR3 track");
  assert.deepEqual(r.preview, readRaw(b, "IMG_0001.CR3").preview);
  assert.ok(r.bytesRead < b.length / 10);
});

test("readRawFile: no pointer preview means a whole read, as readRaw would scan", async () => {
  const b = new Uint8Array(5 << 20);
  b.set(tiffBytes([{ tag: 0x10f, type: 2, value: "OLYMPUS OPTICAL CO.,LTD" }]));
  b.set(jpeg(1600, 1200), 3 << 20);
  const f = countingFile(b, "P0001.ORF");
  const r = await readRawFile(f);
  assert.equal(r.sparse, false);
  assert.equal(f.whole, 1);
  assert.equal(r.preview.source, "scan");
  assert.deepEqual(r.preview, readRaw(b, "P0001.ORF").preview);
});
