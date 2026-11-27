// @ts-check
// The app's own files (the workspace page, the legal texts, fonts, plain rule sets), read by path
// relative to the app folder. On a Node host they come from disk; a Cloudflare Worker has no disk,
// so its entry (worker/index.mjs) hands in the files the build embedded (worker/build.mjs) before
// the first request. Proprietary (see ../LICENSE).
import { readFileSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);

/** @type {Map<string, Uint8Array | string> | null} */
let provided = null;

/**
 * Serve files from memory instead of disk, keyed by their path in the app folder
 * (`pro/web/index.html`, `plain/en16931-ubl.json`). A path not in the map reads as missing.
 * @param {Map<string, Uint8Array | string> | null} files text or bytes; null goes back to the disk
 */
export function provideAppFiles(files) {
  provided = files;
}

/** @param {string} rel */
function checkPath(rel) {
  if (!/^[\w.-]+(\/[\w.-]+)*$/.test(rel) || rel.split("/").some((part) => part === ".." || part === ".")) throw new Error(`bad app file path: ${rel}`);
}

/** True when the files come from memory (a Worker), false on a Node host. */
export const filesInMemory = () => provided !== null;

/**
 * The bytes of one app file, or null when it does not exist.
 * @param {string} rel a path inside the app folder, forward slashes, no `..`
 * @returns {Uint8Array | null}
 */
export function readAppFile(rel) {
  checkPath(rel);
  if (provided) {
    const v = provided.get(rel);
    return v === undefined ? null : typeof v === "string" ? new TextEncoder().encode(v) : v;
  }
  try {
    return readFileSync(new URL(rel, ROOT));
  } catch (e) {
    if (/** @type {NodeJS.ErrnoException} */ (e).code === "ENOENT") return null;
    throw e;
  }
}

/** @param {string} rel @returns {string | null} */
export function readAppText(rel) {
  checkPath(rel);
  const v = provided?.get(rel);
  if (typeof v === "string") return v;
  const bytes = readAppFile(rel);
  return bytes === null ? null : new TextDecoder().decode(bytes);
}
