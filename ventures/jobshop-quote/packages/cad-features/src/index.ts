// @jobshop-quote/cad-features: measure a part drawing for costing. DXF (2D flat parts), STEP
// (AP203/AP214/AP242 B-rep solids), STL (triangle meshes, binary or ASCII) and IGES (trimmed surfaces, B-rep faces, wireframe). Pure TypeScript, no dependencies, no Node APIs: runs in a
// Cloudflare Worker, a browser or Node.

import { extractDxf } from "./dxf.ts";
import { extractIges, looksLikeIges } from "./iges.ts";
import { extractStep } from "./step.ts";
import { extractStl, isBinaryStl, looksLikeAsciiStl } from "./stl.ts";
import type { ExtractOptions, PartFeatures } from "./types.ts";

export { extractDxf } from "./dxf.ts";
export { extractIges, IgesError, looksLikeIges, MAX_IGES_ENTITIES } from "./iges.ts";
export { extractStep } from "./step.ts";
export { parseStep } from "./step-parse.ts";
export { extractStl, isBinaryStl, MAX_STL_TRIANGLES, readStl, StlError } from "./stl.ts";
export * from "./types.ts";

export type CadFormat = "dxf" | "step" | "stl" | "iges";

/** Guess the format from the file name, then from the content (an ASCII STL; a binary one is found by size in `extractFeatures`). Null when it is none. */
export function detectFormat(text: string, fileName = ""): CadFormat | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "dxf") return "dxf";
  if (ext === "step" || ext === "stp" || ext === "p21") return "step";
  if (ext === "stl") return "stl";
  if (ext === "iges" || ext === "igs") return "iges";
  const head = text.slice(0, 2048);
  if (/^\s*ISO-10303-21\s*;/.test(head)) return "step";
  if (head.startsWith("AutoCAD Binary DXF") || /^\s*0\s*\r?\n\s*SECTION\s*\r?\n/.test(head)) {
    return "dxf";
  }
  if (/^\s*999\s*\r?\n/.test(head)) return "dxf";
  if (looksLikeAsciiStl(text)) return "stl";
  if (looksLikeIges(text)) return "iges";
  return null;
}

/**
 * Measure a CAD file. Accepts text or raw bytes (decoded as UTF-8, falling back to Latin-1 for
 * old DXFs). Throws only when the format cannot be recognised.
 */
export function extractFeatures(
  input: string | ArrayBuffer | Uint8Array,
  fileName = "",
  opts: ExtractOptions = {},
): PartFeatures {
  // A binary STL is bytes, not text: recognised by its size before anything is decoded.
  const bytes =
    typeof input === "string" ? null : input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes && isBinaryStl(bytes)) return extractStl(bytes, opts);
  const text = typeof input === "string" ? input : decode(input);
  const format = detectFormat(text, fileName);
  if (format === "stl") return extractStl(bytes ?? text, opts);
  if (format === "dxf") return extractDxf(text, opts);
  if (format === "step") return extractStep(text, opts);
  if (format === "iges") return extractIges(text, opts);
  throw new Error(
    "Unrecognised file: expected an ASCII DXF, a STEP (ISO 10303-21), an STL or an ASCII IGES file.",
  );
}

function decode(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("latin1").decode(bytes);
  }
}
