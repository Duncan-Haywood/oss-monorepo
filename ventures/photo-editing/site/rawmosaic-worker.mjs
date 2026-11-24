// Develops a DNG or ORF with no usable embedded JPEG into a JPEG preview off the page's main
// thread (site/rawmosaic.mjs does the work). Message in: { id, file };
// out: { id, blob, width, height, source, notes } or { id, error }.
import { developMosaic } from "./rawmosaic.mjs";

self.onmessage = async (e) => {
  const { id, file } = e.data;
  try {
    const p = developMosaic(new Uint8Array(await file.arrayBuffer()));
    const c = new OffscreenCanvas(p.width, p.height);
    c.getContext("2d").putImageData(new ImageData(p.rgba, p.width, p.height), 0, 0);
    const blob = await c.convertToBlob({ type: "image/jpeg", quality: 0.92 });
    self.postMessage({ id, blob, width: p.width, height: p.height, source: p.source, notes: p.notes });
  } catch (err) {
    self.postMessage({ id, error: err.message || String(err) });
  }
};
