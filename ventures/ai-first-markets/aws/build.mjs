#!/usr/bin/env node
// Builds AI-First Markets as a static site for the AWS starter (platform/aws/stacks/ai-first-markets): every page is
// static data (src/data), so `next build` with `output: "export"` writes plain files, and the starter's site app
// (runtime/src/site.mjs) serves them behind its own sign-in gate. That gate replaces the parts static export cannot
// run, which this script leaves out of a temporary copy: src/middleware.ts, src/app/api (Google OAuth, session) and the
// /login and /unauthorized pages. The Cloudflare build (npm run deploy) is unchanged until cutover.
//   node aws/build.mjs           -> aws/out/   (then: node build.mjs site ai_first_markets <that dir> in the runtime)
import { cpSync, rmSync, mkdirSync, symlinkSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const app = fileURLToPath(new URL("..", import.meta.url));
const out = fileURLToPath(new URL("./out", import.meta.url));
// Inside the app folder (git-ignored), so Turbopack's root can hold both the copy and the node_modules it links to.
const work = fileURLToPath(new URL("./.work", import.meta.url));
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const SKIP = new Set(["node_modules", ".next", ".open-next", "out", "aws", ".wrangler"]);
try {
  for (const e of readdirSync(app)) if (!SKIP.has(e)) cpSync(join(app, e), join(work, e), { recursive: true });
  symlinkSync(join(app, "node_modules"), join(work, "node_modules"), "dir");
  for (const p of ["src/middleware.ts", "src/app/api", "src/app/login", "src/app/unauthorized"]) rmSync(join(work, p), { recursive: true, force: true });
  writeFileSync(join(work, "next.config.ts"), `import type { NextConfig } from "next";
// Written by aws/build.mjs: a static export for the AWS starter's site app.
const nextConfig: NextConfig = { reactStrictMode: true, output: "export", trailingSlash: true, images: { unoptimized: true }, turbopack: { root: ${JSON.stringify(app)} } };
export default nextConfig;
`);
  execFileSync(process.execPath, [join(app, "node_modules/next/dist/bin/next"), "build"], { cwd: work, stdio: "inherit", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });
  if (!existsSync(join(work, "out/index.html"))) throw new Error("no out/index.html");
  rmSync(out, { recursive: true, force: true });
  cpSync(join(work, "out"), out, { recursive: true });
  console.log(`static export in ${out}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
