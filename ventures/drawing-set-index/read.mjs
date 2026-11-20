// @ts-check
// Read a PDF file's bytes into the run list engine.mjs works on (Node side).
import { inflateSync, constants as Z } from "node:zlib";
import { extractPdfRuns } from "./pdf-text.mjs";

export const nodeInflate = async (b) => { try { return new Uint8Array(inflateSync(b, { finishFlush: Z.Z_SYNC_FLUSH })); } catch { return null; } };

/** @param {Uint8Array} bytes */
export function readRuns(bytes) { return extractPdfRuns(bytes, nodeInflate); }
