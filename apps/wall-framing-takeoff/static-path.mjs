// @ts-check
// The file a local eval server (eval-*-click.mjs) may serve for a request URL:
// resolved inside `root` and refused when it would land outside it (`..`,
// an encoded `%2e%2e`, an absolute path), so a request cannot read files
// elsewhere on the machine.
import { resolve, sep } from "node:path";

/**
 * @param {string} root directory the server serves
 * @param {string | undefined} url request URL (path and optional query)
 * @param {string} [index] file to serve for "/" (none when omitted)
 * @returns {string | null} absolute path inside root, or null to answer 404
 */
export function confinedPath(root, url, index) {
  const base = resolve(root);
  let rel = String(url ?? "").split("?")[0];
  if (index && rel === "/") rel = `/${index}`;
  try {
    rel = decodeURIComponent(rel);
  } catch {
    return null;
  }
  if (rel.includes("\0")) return null;
  const p = resolve(base, rel.replace(/^[/\\]+/, ""));
  if (!p.startsWith(base + sep)) return null;
  return p;
}
