#!/usr/bin/env node
// Fails when a built app's public assets directory holds source maps.
//
// Everything under dist/client is uploaded as public static assets, and a Vite source map carries
// `sourcesContent`: the app's original TypeScript, comments included. For this proprietary
// repository that would publish the product's source to anyone who opens devtools. Worker maps
// (dist/<worker>/) are fine: `upload_source_maps` sends them to Cloudflare, not to visitors.
//
// Usage (from an app directory, after `pnpm build`): node ../../scripts/check-no-client-maps.mjs [dist/client]
// Exit 0: none found. Exit 1: maps found (listed). Exit 2: the directory does not exist.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

/** Every *.map file under dir, and any .js/.css file that points at one with sourceMappingURL. */
export function findClientMaps(dir) {
  const found = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".map")) found.push(relative(dir, p));
      else if (/\.(m?js|css)$/.test(name)) {
        const tail = readFileSync(p, "utf8").slice(-512);
        // An inline map (data: URL) embeds the source in the bundle itself.
        if (/[#@] sourceMappingURL=data:/.test(tail))
          found.push(`${relative(dir, p)} (inline map)`);
      }
    }
  };
  walk(dir);
  return found.sort();
}

function main(argv) {
  const dir = argv[0] ?? "dist/client";
  if (!existsSync(dir)) {
    console.error(`check-no-client-maps: ${dir} does not exist (run the build first)`);
    return 2;
  }
  const maps = findClientMaps(dir);
  if (maps.length === 0) {
    console.log(`check-no-client-maps: no source maps in ${dir}`);
    return 0;
  }
  console.error(
    `check-no-client-maps: ${maps.length} source map(s) in ${dir}, which is served publicly:`,
  );
  for (const m of maps.slice(0, 20)) console.error(`  ${m}`);
  console.error(
    "Fix: set `environments: { client: { build: { sourcemap: false } } }` in vite.config.ts (worker maps can stay).",
  );
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  process.exit(main(process.argv.slice(2)));
