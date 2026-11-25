// Bundles each Lambda into dist/<name>/ (index.mjs + any data files) for the OpenTofu modules
// to zip. Usage:
//   node build.mjs platform                       -> dist/paddle-webhook, dist/entitlement-consumer, dist/db-admin
//   node build.mjs product <name> <app.mjs> [migrations_dir]  -> dist/app-<name>
//   node build.mjs site <name> <built_site_dir>              -> dist/app-<name> (src/site.mjs + the files in ./site)
// CI runs `npm ci && node build.mjs platform && node build.mjs product ...` before `tofu plan`.
import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const common = {
  bundle: true, platform: "node", target: "node22", format: "esm", minify: false, sourcemap: false,
  // ESM bundles need a require() shim for pg's CommonJS internals.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  external: ["pg-native"], legalComments: "eof",
};

async function one(name, entry, extra = {}) {
  const out = join(here, "dist", name);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await build({ ...common, entryPoints: [entry], outfile: join(out, "index.mjs"), ...extra });
  return out;
}

const [mode, ...args] = process.argv.slice(2);
if (mode === "platform") {
  await one("paddle-webhook", join(here, "src/webhook.mjs"));
  await one("entitlement-consumer", join(here, "src/consumer.mjs"));
  const out = await one("db-admin", join(here, "src/db-admin.mjs"));
  await cp(join(here, "sql"), join(out, "sql"), { recursive: true });
  console.log("built platform lambdas");
} else if (mode === "product") {
  const [name, app, migrations] = args;
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(name || "") || !app) throw new Error("usage: node build.mjs product <name> <app.mjs> [migrations_dir]");
  const out = await one(`app-${name}`, join(here, "src/app-entry.mjs"), { alias: { "product-app": resolve(app) } });
  if (migrations) await cp(resolve(migrations), join(out, "migrations"), { recursive: true });
  console.log(`built dist/app-${name}`);
} else if (mode === "site") {
  // A static site (src/site.mjs): the built files go to ./site beside the bundle, the gate's migration to ./migrations.
  const [name, dir] = args;
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(name || "") || !dir) throw new Error("usage: node build.mjs site <name> <built_site_dir>");
  const out = await one(`app-${name}`, join(here, "src/app-entry.mjs"), { alias: { "product-app": join(here, "src/site.mjs") } });
  await cp(resolve(dir), join(out, "site"), { recursive: true });
  await cp(join(here, "site-migrations"), join(out, "migrations"), { recursive: true });
  console.log(`built dist/app-${name} (static site from ${dir})`);
} else {
  throw new Error("usage: node build.mjs platform | product <name> <app.mjs> [migrations_dir] | site <name> <built_site_dir>");
}
