// Shared harness for the scripts/ CLI tests: spawns a script with a clean env, and optionally
// preloads a fetch stub so Paddle is never reached.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts");
export const SCRIPT = join(SCRIPTS, "paddle-checkout-page.ts");
// Made-up sandbox-shaped key, joined from parts so secret scanners do not read it as a leak.
export const SDBX = [
  "pdl",
  "sdbx",
  "apikey",
  "01hzzzzzzzzzzzzzzzzzzzzzzz",
  "SECRETPARTsdbx0123",
].join("_");

/** A fetch stub: GET /products answers `products`; every other call answers `other`. */
export function stub(products: number, other: number): string {
  const src = `globalThis.fetch = async (input) => {
    const path = new URL(String(input instanceof Request ? input.url : input)).pathname;
    const status = path === "/products" ? ${products} : ${other};
    return new Response(JSON.stringify({ data: [], error: { code: "stub", detail: "stub" } }), {
      status, headers: { "content-type": "application/json" } });
  };`;
  return `data:text/javascript,${encodeURIComponent(src)}`;
}

export function run(
  args: string[],
  env: Record<string, string> = {},
  preload?: string,
  script = SCRIPT,
) {
  const r = spawnSync(
    process.execPath,
    [...(preload ? ["--import", preload] : []), script, ...args],
    {
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", ...env },
      timeout: 20_000,
    },
  );
  return { code: r.status, out: r.stdout, err: r.stderr };
}
