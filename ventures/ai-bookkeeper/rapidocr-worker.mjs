// RapidOCR off the page's main thread. photoocr.mjs starts this file as a module Web Worker
// (loadRapidWorker); the worker downloads ONNX Runtime Web and the three models itself, and
// for each photo receives the pixels the page drew (RGBA, transferred, not copied) and sends
// back rapidRows' text. Detection, the crops, the classifier, the recogniser and CTC decoding
// all run here, so the tab keeps responding while a photo is read
// (eval/rapidocr-worker-2026-11-17.md). The pipeline is rapidocr-web.mjs unchanged, so the
// text is the same as when it ran on the main thread.
//
// Messages in:  { type: "open", script? ("latin" | "cyrillic"; the recogniser, rapidocr-web.mjs RAPID_RECOGNISERS) } | { type: "read", id, width, height, rgba } | { type: "close" }
// Messages out: { type: "ready" } | { type: "rows", id, text } | { type: "error", id?, message }
import { RAPID_URLS, createRapidOcr, rapidRows, bgrFromRgba, fetchRapidModels } from "./rapidocr-web.mjs";

// The message handler, separate from the worker global so tests can drive it in Node with a
// fake runtime. `loadOrt` returns the onnxruntime-web module; `fetchBytes` a model's bytes.
export function serveRapid(post, { loadOrt = defaultLoadOrt, fetchBytes = defaultFetchBytes, threads = 1 } = {}) {
  let engine = null, opening = null, script = "latin";
  const open = () => (opening ??= (async () => {
    const ort = await loadOrt();
    ort.env.wasm.wasmPaths = RAPID_URLS.wasm;
    ort.env.wasm.numThreads = threads;
    const { det, cls, rec, keys } = await fetchRapidModels(fetchBytes, script);
    engine = createRapidOcr({ ort, models: { det, cls, rec }, keys });
    await engine.open();
    return engine;
  })());
  const why = (e) => String(e?.message ?? e).replace(/^Error: /, "");
  // one message at a time, in order: ONNX Runtime's sessions are not re-entrant
  let queue = Promise.resolve();
  return (msg) => (queue = queue.then(async () => {
    const m = msg?.data ?? msg;
    if (m?.type === "open") {
      // a different script after an open reader starts a new one
      if (m.script && m.script !== script) { await engine?.close?.(); engine = null; opening = null; script = m.script; }
      try { await open(); post({ type: "ready" }); }
      catch (e) { opening = null; post({ type: "error", message: why(e) }); }
    } else if (m?.type === "read") {
      try {
        const e = await open();
        const rgba = m.rgba instanceof Uint8ClampedArray || m.rgba instanceof Uint8Array ? m.rgba : new Uint8Array(m.rgba ?? 0);
        if (!(m.width > 0 && m.height > 0) || rgba.length < m.width * m.height * 4) throw new Error("the photo's pixels did not arrive");
        post({ type: "rows", id: m.id, text: rapidRows(await e.read(bgrFromRgba(rgba, m.width, m.height))) });
      } catch (e) { post({ type: "error", id: m.id, message: why(e) }); }
    } else if (m?.type === "close") {
      await engine?.close?.(); engine = null; opening = null;
      post({ type: "closed" });
    }
  }));
}

// ort.min.mjs is the ES-module build of the ort.min.js the page itself loads (same version,
// same WebAssembly file); a module worker cannot use importScripts
async function defaultLoadOrt() {
  const mod = await import(RAPID_URLS.ortModule);
  return mod.default?.InferenceSession ? mod.default : mod;
}

async function defaultFetchBytes(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`could not download the RapidOCR reader (${r.status})`);
  return new Uint8Array(await r.arrayBuffer());
}

// started as a worker (not imported by a test or the page)
if (typeof WorkerGlobalScope !== "undefined" && globalThis instanceof WorkerGlobalScope) {
  globalThis.onmessage = serveRapid((m) => globalThis.postMessage(m), {
    threads: globalThis.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1,
  });
}
