// rapidocr-worker.mjs and photoocr.mjs's worker side: the message protocol over a fake
// ONNX Runtime, the page's driver over a fake Worker wired to the same handler, the fallback
// to the page's own thread, and RapidOCR reading while tesseract reads. The real worker in a
// real browser is eval/rapidocr-worker.mjs (eval/rapidocr-worker-2026-11-17.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { serveRapid } from "./rapidocr-worker.mjs";
import { loadRapidEngine, loadRapidWorker, readPhotos } from "./photoocr.mjs";
import { charList, RAPID_URLS, RAPID_RECOGNISERS, rapidModelUrls, fetchRapidModels } from "./rapidocr-web.mjs";

const KEYS = "T\nO\nA\nL\n9\n.\n";
// the detector marks dark pixels, the classifier says upright, the recogniser spells "TOTAL 9.99"
function fakeOrt() {
  class Tensor { constructor(type, data, dims) { Object.assign(this, { type, data, dims }); } }
  const make = (name) => ({
    inputNames: ["x"], outputNames: ["y"],
    run: async ({ x }) => {
      const [n, , h, w] = x.dims;
      if (name === "det") {
        const out = new Float32Array(h * w);
        for (let i = 0; i < h * w; i++) out[i] = x.data[i] < 0 ? 0.95 : 0.01;
        return { y: new Tensor("float32", out, [1, 1, h, w]) };
      }
      if (name === "cls") return { y: new Tensor("float32", new Float32Array(n * 2).map((_, i) => (i % 2 ? 0.01 : 0.99)), [n, 2]) };
      const chars = charList(KEYS), word = "TOTAL 9.99", steps = 2 * word.length + 1, classes = chars.length;
      const out = new Float32Array(n * steps * classes);
      for (let b = 0; b < n; b++) for (let t = 0; t < steps; t++) out[(b * steps + t) * classes + (t % 2 ? chars.indexOf(word[(t - 1) / 2]) : 0)] = 0.9;
      return { y: new Tensor("float32", out, [n, steps, classes]) };
    },
    release: async () => {},
  });
  return { Tensor, env: { wasm: {} }, InferenceSession: { create: async (m) => make(m) } };
}
// models are named by URL: det, cls (…_cls_infer) and rec
const modelFetch = async (u) => (u === RAPID_URLS.keys ? new TextEncoder().encode(KEYS) : /_det_/.test(u) ? "det" : /_cls_/.test(u) ? "cls" : "rec");

// a white 300 x 200 RGBA photo with one dark bar of text
function rgbaBar() {
  const w = 300, h = 200, d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = x >= 60 && x < 240 && y >= 90 && y < 110 ? 20 : 250, i = (y * w + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  return { rgba: d, width: w, height: h };
}

test("serveRapid: open sets one thread and the pinned wasm path, then a read returns rapidRows' text", async () => {
  const out = [], ort = fakeOrt();
  const on = serveRapid((m) => out.push(m), { loadOrt: async () => ort, fetchBytes: modelFetch });
  await on({ data: { type: "open" } });
  assert.deepEqual(out.shift(), { type: "ready" });
  assert.equal(ort.env.wasm.numThreads, 1);
  assert.equal(ort.env.wasm.wasmPaths, RAPID_URLS.wasm);
  const { rgba, width, height } = rgbaBar();
  await on({ data: { type: "read", id: 7, width, height, rgba } });
  assert.deepEqual(out.shift(), { type: "rows", id: 7, text: "TOTAL 9.99\n" });
  // a transferred ArrayBuffer (not a typed array) is read the same
  await on({ type: "read", id: 8, width, height, rgba: rgbaBar().rgba.buffer });
  assert.equal(out.shift().text, "TOTAL 9.99\n");
  await on({ type: "close" });
  assert.equal(out.shift().type, "closed");
});

test("serveRapid: a download that fails is an error, and the next open tries again", async () => {
  const out = [];
  let fail = true;
  const on = serveRapid((m) => out.push(m), { loadOrt: async () => fakeOrt(), fetchBytes: async (u) => { if (fail) throw new Error("could not download the RapidOCR reader (503)"); return modelFetch(u); } });
  await on({ type: "open" });
  assert.deepEqual(out.shift(), { type: "error", message: "could not download the RapidOCR reader (503)" });
  fail = false;
  await on({ type: "open" });
  assert.deepEqual(out.shift(), { type: "ready" });
  // a read of pixels that are not there is that photo's error, with its id
  await on({ type: "read", id: 3, width: 10, height: 10, rgba: null });
  const e = out.shift();
  assert.equal(e.type, "error"); assert.equal(e.id, 3);
});

// a Worker whose other side is serveRapid, with postMessage made asynchronous as a real one is
function fakeWorker(opts) {
  const w = { terminated: false, transfers: [] };
  const handle = serveRapid((m) => queueMicrotask(() => w.onmessage?.({ data: m })), opts);
  w.postMessage = (m, transfer) => { if (transfer) w.transfers.push(transfer); queueMicrotask(() => handle({ data: m })); };
  w.terminate = () => { w.terminated = true; };
  return w;
}

test("loadRapidWorker: reads go to the worker by id, the pixels are transferred, and close terminates it", async () => {
  const w = fakeWorker({ loadOrt: async () => fakeOrt(), fetchBytes: modelFetch });
  const eng = await loadRapidWorker(w, { draw: async () => rgbaBar() });
  assert.equal(eng.how, "worker");
  const [a, b] = await Promise.all([eng.read("one"), eng.read("two")]);
  assert.equal(a, "TOTAL 9.99\n"); assert.equal(b, "TOTAL 9.99\n");
  assert.equal(w.transfers.length, 2);
  assert.ok(w.transfers[0][0] instanceof ArrayBuffer);
  await eng.close();
  assert.equal(w.terminated, true);
  await assert.rejects(eng.read("three"), /closed/);
});

test("loadRapidWorker: a worker that dies fails the waiting reads instead of hanging", async () => {
  const w = { postMessage: (m) => { if (m.type === "open") queueMicrotask(() => w.onmessage({ data: { type: "ready" } })); else queueMicrotask(() => w.onerror({ message: "out of memory", preventDefault() {} })); }, terminate() {} };
  const eng = await loadRapidWorker(w, { draw: async () => rgbaBar() });
  await assert.rejects(eng.read("x"), /RapidOCR worker stopped \(out of memory\)/);
  await assert.rejects(eng.read("y"), /out of memory/);
});

// 2026-11-17 red team: a worker that dies while the page is still drawing the photo used to
// leave that read waiting forever (readPhotos then never finished)
test("loadRapidWorker: a worker that dies while a photo is being drawn fails that read", async () => {
  const w = { postMessage: (m) => { if (m.type === "open") queueMicrotask(() => w.onmessage({ data: { type: "ready" } })); }, terminate() {} };
  let drawn;
  const eng = await loadRapidWorker(w, { draw: () => new Promise((r) => { drawn = r; }) });
  const p = eng.read("x");
  await new Promise((r) => setTimeout(r, 0));
  w.onerror({ message: "out of memory", preventDefault() {} });
  drawn(rgbaBar());
  const got = await Promise.race([p.then(() => "resolved", (e) => e.message), new Promise((r) => setTimeout(() => r("still waiting"), 500))]);
  assert.match(got, /RapidOCR worker stopped \(out of memory\)/);
});

test("loadRapidEngine: the worker first; one that cannot start falls back to the page's thread", async () => {
  const ok = await loadRapidEngine({ makeWorker: () => fakeWorker({ loadOrt: async () => fakeOrt(), fetchBytes: modelFetch }), inPage: async () => assert.fail("should not run in the page") });
  assert.equal(ok.how, "worker");
  await ok.close();
  // a module worker the browser cannot load reports an error event
  let killed = false;
  const broken = { postMessage: () => queueMicrotask(() => broken.onerror({})), terminate: () => { killed = true; } };
  const fell = await loadRapidEngine({ makeWorker: () => broken, inPage: async () => ({ how: "page", read: async () => "", close: async () => {} }) });
  assert.equal(fell.how, "page");
  assert.equal(killed, true);
  // no Worker at all (Node here): the page
  assert.equal((await loadRapidEngine({ makeWorker: () => null, inPage: async () => ({ how: "page" }) })).how, "page");
  // a download failure is not retried on the page
  let triedPage = false;
  const noNet = fakeWorker({ loadOrt: async () => fakeOrt(), fetchBytes: async () => { throw new Error("could not download the RapidOCR reader (404)"); } });
  await assert.rejects(loadRapidEngine({ makeWorker: () => noNet, inPage: async () => { triedPage = true; } }), /could not download/);
  assert.equal(triedPage, false);
});

test("readPhotos: RapidOCR reads while tesseract does, and still leads the vote", async () => {
  const log = [];
  let release;
  const gate = new Promise((r) => { release = r; });
  const lead = { how: "worker", read: async () => { log.push("rapid start"); await gate; log.push("rapid done"); return "Cafe\nSubtotal  9.00\nTax  0.99\nTotal  9.99\n"; }, close: async () => {} };
  const tess = async () => ({ recognize: async () => { log.push("tesseract"); release(); return "Cafe\nTotal 6.99"; }, close: async () => {} });
  const r = await readPhotos([{ name: "a.jpg", type: "image/jpeg" }], { passes: ["6"], loadEngine: tess, loadRapid: async () => lead });
  assert.deepEqual(log, ["rapid start", "tesseract", "rapid done"]);
  assert.equal(r.rapid, 1);
  assert.equal(r.rapidHow, "worker");
  assert.match(r.text, /Total\s+9\.99/);
  // a RapidOCR read that fails leaves tesseract's reading
  const s = await readPhotos([{ name: "b.jpg", type: "image/jpeg" }], { passes: ["6"], loadEngine: tess, loadRapid: async () => ({ read: async () => { throw new Error("boom"); }, close: async () => {} }) });
  assert.equal(s.rapid, 0);
  assert.match(s.text, /Total 6\.99/);
});

test("readPhotos: tesseract failing to load closes the RapidOCR reader it loaded alongside", async () => {
  let closed = false;
  await assert.rejects(readPhotos([{ name: "a.jpg", type: "image/jpeg" }], { loadEngine: async () => { throw new Error("offline"); }, loadRapid: async () => ({ read: async () => "", close: async () => { closed = true; } }) }), /offline/);
  assert.equal(closed, true);
});

// ---- the Cyrillic recogniser (2026-11-19): Russian slips read with the East Slavic model

test("rapidModelUrls: cyrillic swaps only the recogniser and keys, pinned to a Hugging Face revision with hashes", () => {
  const l = rapidModelUrls(), c = rapidModelUrls("cyrillic");
  assert.equal(l.rec, RAPID_URLS.rec); assert.deepEqual(l.sha256, {});
  assert.equal(c.det, RAPID_URLS.det); assert.equal(c.cls, RAPID_URLS.cls);
  assert.match(c.rec, /^https:\/\/huggingface\.co\/monkt\/paddleocr-onnx\/resolve\/[0-9a-f]{40}\/languages\/eslav\/rec\.onnx$/);
  assert.match(c.keys, /\/eslav\/dict\.txt$/);
  assert.match(c.sha256.rec, /^[0-9a-f]{64}$/); assert.match(c.sha256.keys, /^[0-9a-f]{64}$/);
  assert.throws(() => rapidModelUrls("greek"), /no RapidOCR recogniser for "greek"/);
});

test("fetchRapidModels: a pinned file whose bytes do not hash right is refused, the right bytes are used", async () => {
  const body = new TextEncoder().encode("А\nБ\nВ\n");
  const hex = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", body)), (x) => x.toString(16).padStart(2, "0")).join("");
  RAPID_RECOGNISERS.__test = { rec: "u:rec", keys: "u:keys", sha256: { keys: hex } };
  try {
    const got = await fetchRapidModels(async (u) => (u === "u:keys" ? body : u), "__test");
    assert.equal(got.keys, "А\nБ\nВ\n"); assert.equal(got.rec, "u:rec");
    await assert.rejects(fetchRapidModels(async (u) => (u === "u:keys" ? new TextEncoder().encode("A\nB\n") : u), "__test"), /__test RapidOCR character list did not match its pinned hash/);
  } finally { delete RAPID_RECOGNISERS.__test; }
});

test("serveRapid and loadRapidWorker: open with script cyrillic downloads the East Slavic files, and a wrong one is an error", async () => {
  const asked = [];
  const w = fakeWorker({ loadOrt: async () => fakeOrt(), fetchBytes: async (u) => { asked.push(u); return modelFetch(u); } });
  // the fake files do not hash to the pinned values, so the open must fail, naming the hash
  await assert.rejects(loadRapidWorker(w, { draw: async () => rgbaBar(), script: "cyrillic" }), /cyrillic RapidOCR (model|character list) did not match its pinned hash/);
  assert.ok(asked.includes(RAPID_RECOGNISERS.cyrillic.rec)); assert.ok(asked.includes(RAPID_RECOGNISERS.cyrillic.keys));
  assert.ok(!asked.includes(RAPID_URLS.rec));
  // the hash failure is not retried on the page's own thread (it would fail the same way)
  let inPage = false;
  await assert.rejects(loadRapidEngine({ script: "cyrillic", makeWorker: () => fakeWorker({ loadOrt: async () => fakeOrt(), fetchBytes: modelFetch }), inPage: async () => { inPage = true; } }), /pinned hash/);
  assert.equal(inPage, false);
});

test("readPhotos: rapidScript reaches the RapidOCR loader", async () => {
  let script = null;
  const photo = { name: "чек.jpg", type: "image/jpeg" };
  const tesseract = { recognize: async () => "ИТОГ  100.00", close: async () => {} };
  const r = await readPhotos([photo], { passes: ["6"], rapidScript: "cyrillic", loadEngine: async () => tesseract, loadRapid: async (o) => { script = o.script; return { read: async () => "ООО \"ЛЕНТА\"\nИТОГ  100.00\n", close: async () => {} }; } });
  assert.equal(script, "cyrillic");
  assert.equal(r.rapid, 1);
  assert.match(r.text, /ЛЕНТА/);
});
