import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readRaw, probeJpeg, captureMillis, groupBursts, sharpness, xmpSidecar, sidecarName,
  zipStored, crc32, isCandidateFile, readRawFile, readXmp, mergeXmpSidecar, sidecarTarget,
  orientPoint, detailAt, burstBest,
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
    if (e.type === 2 || e.type === 7) {
      const s = e.type === 7 ? new TextEncoder().encode(e.value) : new TextEncoder().encode(e.value + "\0");
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

// ------------------------------------------------ existing sidecars and in-camera ratings

const LR_SIDECAR = `<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        ">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
    xmlns:dc="http://purl.org/dc/elements/1.1/"
   xmp:MetadataDate="2026-01-02T03:04:05-08:00"
   xmp:Rating="2"
   xmp:Label="Purple"
   crs:Exposure2012="+0.35"
   crs:Temperature="5600">
   <dc:subject>
    <rdf:Bag>
     <rdf:li>wedding &amp; rings</rdf:li>
    </rdf:Bag>
   </dc:subject>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
`;

test("readXmp: attribute and element forms, any prefix, rejects and fractions", () => {
  assert.deepEqual(readXmp(LR_SIDECAR), { rating: 2, label: "Purple" });
  assert.deepEqual(readXmp(xmpSidecar({ rejected: true })), { rating: -1, label: null });
  const elem = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description xmlns:xap="http://ns.adobe.com/xap/1.0/"><xap:Rating>3.0</xap:Rating><xap:Label>Red &amp; done</xap:Label></rdf:Description></rdf:RDF></x:xmpmeta>`;
  assert.deepEqual(readXmp(elem), { rating: 3, label: "Red & done" });
  assert.deepEqual(readXmp(elem.replace("3.0", "9")), { rating: null, label: "Red & done" });
  assert.equal(readXmp("not xml at all"), null);
});

test("mergeXmpSidecar keeps develop settings and keywords, sets rating and label", () => {
  const out = mergeXmpSidecar(LR_SIDECAR, { rating: 5, label: "Green" }, new Date(Date.UTC(2026, 10, 23, 14, 5, 9)));
  assert.deepEqual(readXmp(out), { rating: 5, label: "Green" });
  assert.match(out, /crs:Exposure2012="\+0\.35"/);
  assert.match(out, /crs:Temperature="5600"/);
  assert.match(out, /<rdf:li>wedding &amp; rings<\/rdf:li>/);
  assert.match(out, /xmp:MetadataDate="2026-11-23T14:05:09\+00:00"/);
  // Only the three properties changed: the rest is byte for byte.
  const strip = (t) => t.replace(/ xmp:(Rating|Label|MetadataDate)="[^"]*"/g, "");
  assert.equal(strip(out), strip(LR_SIDECAR));
  // Rejected, label cleared.
  const rej = mergeXmpSidecar(LR_SIDECAR, { rejected: true, label: "" });
  assert.deepEqual(readXmp(rej), { rating: -1, label: null });
  assert.doesNotMatch(rej, /xmp:Label/);
});

test("mergeXmpSidecar adds xmp to a sidecar that has none, and edits element forms", () => {
  const dt = `<?xml version="1.0" encoding="UTF-8"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:darktable="http://darktable.sf.net/" darktable:xmp_version="5"/>
 </rdf:RDF>
</x:xmpmeta>`;
  const out = mergeXmpSidecar(dt, { rating: 3, label: "Blue" });
  assert.deepEqual(readXmp(out), { rating: 3, label: "Blue" });
  assert.match(out, /darktable:xmp_version="5"/);
  const elem = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description xmlns:xap="http://ns.adobe.com/xap/1.0/"><xap:Rating>1</xap:Rating></rdf:Description></rdf:RDF></x:xmpmeta>`;
  const e2 = mergeXmpSidecar(elem, { rating: 4, label: "Red" });
  assert.match(e2, /<xap:Rating>4<\/xap:Rating>/);
  assert.deepEqual(readXmp(e2), { rating: 4, label: "Red" });
  assert.equal(mergeXmpSidecar("hello", { rating: 1 }), null);
});

test("sidecarTarget pairs both naming styles and refuses an ambiguous stem", () => {
  const names = ["IMG_1.CR3", "IMG_2.CR3", "IMG_2.JPG", "DSC_9.nef"];
  assert.equal(sidecarTarget("IMG_1.xmp", names), "IMG_1.CR3");
  assert.equal(sidecarTarget("img_1.cr3.XMP", names), "IMG_1.CR3");
  assert.equal(sidecarTarget("DSC_9.xmp", names), "DSC_9.nef");
  assert.equal(sidecarTarget("IMG_2.xmp", names), null);
  assert.equal(sidecarTarget("IMG_2.JPG.xmp", names), "IMG_2.JPG");
  assert.equal(sidecarTarget("IMG_3.xmp", names), null);
});

test("in-camera rating: an XMP packet in tag 700 wins over the Rating tag", () => {
  const j = jpeg(6000, 4000);
  const packet = xmpSidecar({ rating: 4, label: "Yellow" });
  const mk = (entries) => {
    const n = entries.length + 2;
    const tailAt = 8 + (2 + n * 12 + 4) + 512;
    return readRaw(tiffBytes([...entries, { tag: 0x201, type: 4, value: tailAt }, { tag: 0x202, type: 4, value: j.length }], j), "DSC_1.NEF");
  };
  const both = mk([{ tag: 0x10f, type: 2, value: "NIKON" }, { tag: 0x2bc, type: 7, value: packet }, { tag: 0x4746, type: 3, value: 2 }]);
  assert.equal(both.meta.cameraRating, 4);
  assert.equal(both.meta.cameraLabel, "Yellow");
  assert.equal(both.meta.xmpAt, undefined);
  const tagOnly = mk([{ tag: 0x10f, type: 2, value: "Canon" }, { tag: 0x4746, type: 3, value: 3 }]);
  assert.equal(tagOnly.meta.cameraRating, 3);
  // Nikon's default packet says Rating 0: no rating, so the tag is the fallback.
  const zero = mk([{ tag: 0x2bc, type: 7, value: xmpSidecar({ rating: 0 }) }, { tag: 0x4746, type: 3, value: 1 }]);
  assert.equal(zero.meta.cameraRating, 1);
  const none = mk([{ tag: 0x10f, type: 2, value: "NIKON" }]);
  assert.equal(none.meta.cameraRating, undefined);
});

test("in-camera rating: a CR3's XMP box", () => {
  const j = jpeg(6000, 4000);
  const ftyp = box("ftyp", new TextEncoder().encode("crx "), u32be(1));
  const uuid = Uint8Array.from("be7acfcb97a942e89c71999491e3afac".match(/../g).map((h) => parseInt(h, 16)));
  const xmpBox = box("uuid", uuid, new TextEncoder().encode(xmpSidecar({ rating: 5 })));
  const build = (off) => {
    const stsz = box("stsz", u32be(0, j.length, 1));
    const co64 = box("co64", u32be(0, 1, 0, off));
    return box("moov", box("trak", box("mdia", box("minf", box("stbl", stsz, co64)))));
  };
  const head = ftyp.length + build(0).length + xmpBox.length;
  const mdat = box("mdat", j);
  const b = new Uint8Array(head + mdat.length);
  b.set(ftyp); b.set(build(head + 8), ftyp.length); b.set(xmpBox, ftyp.length + build(0).length); b.set(mdat, head);
  const r = readRaw(b, "IMG_0001.CR3");
  assert.equal(r.preview.width, 6000);
  assert.equal(r.meta.cameraRating, 5);
});

// ---------------------------------------------------------------- AF point

// Writes an IFD at `at` in `buf` (DataView `dv`, little-endian unless told),
// value data straight after it; stored offsets are relative to `rel`.
// Entries: { tag, type, values: number[] | string | Uint8Array }.
function writeIfd(buf, at, rel, entries, little = true) {
  const dv = new DataView(buf.buffer);
  const size = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 8: 2, 10: 8 };
  let data = at + 2 + entries.length * 12 + 4;
  dv.setUint16(at, entries.length, little);
  entries.forEach((e, i) => {
    const p = at + 2 + i * 12;
    let bytes;
    if (e.values instanceof Uint8Array) bytes = e.values;
    else if (typeof e.values === "string") bytes = new TextEncoder().encode(e.values + "\0");
    else {
      bytes = new Uint8Array(e.values.length * size[e.type]);
      const bv = new DataView(bytes.buffer);
      e.values.forEach((v, k) => {
        if (e.type === 3) bv.setUint16(k * 2, v & 0xffff, little);
        else if (e.type === 8) bv.setInt16(k * 2, v, little);
        else if (e.type === 4) bv.setUint32(k * 4, v >>> 0, little);
        else if (e.type === 5) { bv.setUint32(k * 8, v[0] >>> 0, little); bv.setUint32(k * 8 + 4, v[1] >>> 0, little); }
        else bytes[k] = v;
      });
    }
    const count = e.values instanceof Uint8Array || typeof e.values === "string" ? bytes.length : e.values.length;
    dv.setUint16(p, e.tag, little); dv.setUint16(p + 2, e.type, little); dv.setUint32(p + 4, count, little);
    if (bytes.length <= 4) buf.set(bytes, p + 8);
    else { dv.setUint32(p + 8, data - rel, little); buf.set(bytes, data); data += bytes.length + (bytes.length & 1); }
  });
  return data;
}

// The note's own offsets depend on where it ends up, so the tests build the
// note at its final position: the EXIF IFD's data area starts at
// 200 + 2 + n*12 + 4, which the helpers below compute.
const noteAt = (nExif) => 200 + 2 + nExif * 12 + 4;
function raw(make, buildNote, opts = {}) {
  const nExif = 1 + (opts.exif || []).length;
  const at = noteAt(nExif);
  const scratch = new Uint8Array(1 << 16);
  const end = buildNote(scratch, at);
  const noteBytes = scratch.slice(at, end);
  const buf = new Uint8Array(1 << 16);
  buf.set([0x49, 0x49, 42, 0, 8, 0, 0, 0]);
  writeIfd(buf, 8, 0, [
    { tag: 0x10f, type: 2, values: make },
    { tag: 0x112, type: 3, values: [opts.orientation || 1] },
    { tag: 0x8769, type: 4, values: [200] },
  ]);
  writeIfd(buf, 200, 0, [{ tag: 0x927c, type: 7, values: noteBytes }, ...(opts.exif || [])]);
  return buf;
}

test("AF point: Sony FocusLocation (width, height, x, y) as fractions", () => {
  const b = raw("SONY", (buf, at) => {
    buf.set(new TextEncoder().encode("SONY DSC \0\0\0"), at);
    return writeIfd(buf, at + 12, 0, [{ tag: 0x2027, type: 3, values: [6000, 4000, 2156, 2000] }]);
  });
  const af = readRaw(b, "a.arw").meta.af;
  assert.equal(af.source, "Sony FocusLocation");
  assert.ok(Math.abs(af.x - 2156 / 6000) < 1e-9 && af.y === 0.5);
});

test("AF point: Fujifilm FocusPixel in the frame of the EXIF that holds it", () => {
  const b = raw("FUJIFILM", (buf, at) => {
    buf.set(new TextEncoder().encode("FUJIFILM"), at);
    new DataView(buf.buffer).setUint32(at + 8, 12, true);
    return writeIfd(buf, at + 12, at, [{ tag: 0x1023, type: 3, values: [480, 960] }]);
  }, { exif: [{ tag: 0xa002, type: 4, values: [1920] }, { tag: 0xa003, type: 4, values: [1280] }] });
  const af = readRaw(b, "a.raf.tif").meta.af;
  assert.equal(af.source, "Fujifilm FocusPixel");
  assert.deepEqual([af.x, af.y], [0.25, 0.75]);
});

test("AF point: Panasonic AFPointPosition; 0xffffffff/256 means none", () => {
  const mk = (num) => raw("Panasonic", (buf, at) => {
    buf.set(new TextEncoder().encode("Panasonic\0\0\0"), at);
    return writeIfd(buf, at + 12, 0, [{ tag: 0x4d, type: 5, values: [[num, 256], [64, 256]] }]);
  });
  const af = readRaw(mk(192), "a.tif").meta.af;
  assert.deepEqual([af.x, af.y], [0.75, 0.25]);
  assert.equal(readRaw(mk(0xffffffff), "a.tif").meta.af, undefined);
});

test("AF point: Canon AFInfo2, Y up, in-focus bits pick the point", () => {
  // 3 points across a 6000 x 4000 AF image: left, centre, top-right; the
  // camera reports point 2 (top right) in focus.
  const a = [0, 2, 3, 3, 6000, 4000, 6000, 4000, 200, 200, 200, 200, 200, 200, -1500, 0, 1500, 0, 0, 1000, 0b100, 0];
  const b = raw("Canon", (buf, at) => writeIfd(buf, at, 0, [{ tag: 0x26, type: 3, values: a }]));
  const af = readRaw(b, "a.cr2").meta.af;
  assert.equal(af.source, "Canon AFInfo2");
  assert.equal(af.points.length, 3);
  assert.deepEqual(af.points.map((p) => p.inFocus), [false, false, true]);
  assert.deepEqual([af.x, af.y], [0.75, 0.25]); // 1500 right of centre, 1000 above
});

test("AF point: Olympus CameraSettings AFAreas boxes in 255ths", () => {
  const b = raw("OLYMPUS IMAGING CORP.", (buf, at) => {
    buf.set(new TextEncoder().encode("OLYMPUS\0II\x03\0"), at);
    const csAt = writeIfd(buf, at + 12, at, [{ tag: 0x2020, type: 13, values: [0] }]);
    // Point the 0x2020 entry (IFD type, a LONG offset) at the sub-IFD.
    new DataView(buf.buffer).setUint32(at + 12 + 2 + 8, csAt - at, true);
    return writeIfd(buf, csAt, at, [{ tag: 0x304, type: 4, values: [((88 << 24) | (118 << 16) | (102 << 8) | 137) >>> 0, 0] }]);
  });
  const af = readRaw(b, "a.orf.tif").meta.af;
  assert.equal(af.source, "Olympus AFAreas");
  assert.ok(Math.abs(af.x - 190 / 510) < 1e-9 && Math.abs(af.y - 255 / 510) < 1e-9);
});

test("AF point: a garbled maker note gives none and does not throw", () => {
  const b = raw("Canon", (buf, at) => { buf.fill(0xff, at, at + 64); return at + 64; });
  assert.equal(readRaw(b, "a.cr2").meta.af, undefined);
});

test("orientPoint turns a sensor-frame point upright", () => {
  assert.deepEqual(orientPoint(0.2, 0.1, 1), [0.2, 0.1]);
  assert.deepEqual(orientPoint(0.2, 0.1, 3), [0.8, 0.9]);
  assert.deepEqual(orientPoint(0.2, 0.1, 6), [0.9, 0.2]); // rotate 90 CW: top-left goes top-right
  assert.deepEqual(orientPoint(0.2, 0.1, 8), [0.1, 0.8]);
});

test("detailAt and burstBest: the AF point decides when every frame has one", () => {
  const w = 64, h = 64;
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < 32; x++) g[y * w + x] = (x + y) % 2 ? 255 : 0; // texture on the left only
  assert.ok(detailAt(g, w, h, 0.25, 0.5, 16) > 1000);
  assert.equal(detailAt(g, w, h, 0.75, 0.5, 16), 0);
  // Frame 0 is busier overall, frame 1 sharper where the camera focused.
  assert.deepEqual(burstBest([{ detail: 900, afDetail: 10 }, { detail: 500, afDetail: 80 }]), { index: 1, basis: "af" });
  assert.deepEqual(burstBest([{ detail: 900, afDetail: 10 }, { detail: 500 }]), { index: 0, basis: "frame" });
});
