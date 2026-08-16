import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * The design has to survive the build.
 *
 * On 2026-08-04, commit 2fdcf837 — "feat: complete stash convergence and clean
 * uncommitted work" — deleted `postcss.config.mjs` from four ventures at once.
 * Three of them (local-site-studio, ai-first-markets, quick-pick-survey) were
 * restored on 2026-08-16 and each got a `stylesheetDelivery` control at the
 * same time. This venture was in the same deletion and in none of the restore:
 * it had no config and no detector, so the gap that was closed elsewhere stayed
 * open here.
 *
 * Nothing went red. `tailwindcss` and `autoprefixer` stayed in package.json,
 * `tailwind.config.ts` stayed, `@tailwind base/components/utilities` stayed at
 * the top of `globals.css`, and typecheck, lint, the whole node:test suite and
 * `next build` all passed. The failure mode is a pass-through, not an error:
 * with nothing consuming them the three directives survive into the emitted
 * stylesheet verbatim, so the manifest, the markup and the exit codes are
 * identical in the broken and the healthy state. No control that reads the
 * source or the build output can tell them apart.
 *
 * This test therefore asserts on the real pipeline: it loads the PostCSS config
 * the build loads, runs the plugins that config declares over the real
 * `globals.css`, and requires the utilities the markup actually uses to come
 * out the other side. A missing config file, an unwired plugin, or a renamed
 * one all fail it.
 *
 * Note this venture is on Tailwind v3 (`tailwindcss ^3.4.3`, `@tailwind`
 * directives), not the v4 the other three were restored to. The v4 form
 * (`@tailwindcss/postcss`) is not interchangeable here — hence a control that
 * reads this venture's own config rather than assuming a shared one.
 */

const ROOT = process.cwd();

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (path.endsWith(".tsx") && !path.endsWith(".test.tsx")) out.push(path);
  }
  return out;
}

/**
 * The palette utilities the markup actually asks for.
 *
 * Read from the `.tsx` rather than hard-coded, so the set tracks the app: a
 * hard-coded list would keep passing over markup that had moved on.
 */
function usedColourUtilities(): Set<string> {
  const wanted = new Set<string>();
  for (const file of sourceFiles(join(ROOT, "src"))) {
    for (const match of readFileSync(file, "utf8").matchAll(/\b((?:text|bg)-[a-z]+-\d{2,3})\b/g)) {
      wanted.add(match[1]);
    }
  }
  return wanted;
}

/** Compile `globals.css` exactly as the build does, through its own config. */
async function compiledStylesheet(): Promise<string> {
  const config = (await import(pathToFileURL(join(ROOT, "postcss.config.mjs")).href)).default;

  const declared = Object.entries(config?.plugins ?? {});
  assert.ok(declared.length > 0, "postcss.config.mjs declares no plugins");

  const plugins = [];
  for (const [name, options] of declared) {
    const loaded = (await import(name)).default;
    plugins.push(typeof loaded === "function" ? loaded(options) : loaded);
  }

  const { default: postcss } = await import("postcss");
  const from = join(ROOT, "src/app/globals.css");
  const result = await postcss(plugins).process(readFileSync(from, "utf8"), { from });
  return result.css;
}

test("emits the colour utilities the markup uses", async () => {
  const css = await compiledStylesheet();
  const wanted = usedColourUtilities();

  // Guards against a vacuous pass if the class reader ever stops finding
  // anything: an empty wanted set would make the filter below assert nothing.
  assert.ok(
    wanted.size > 50,
    `expected the markup to use more than 50 colour utilities, found ${wanted.size}`,
  );

  // A variant compiles to an escaped selector (`.dark\:text-slate-300`), so the
  // utility is looked for as a substring of the output rather than as a whole
  // class — either form is evidence the token was emitted.
  const missing = [...wanted].filter((token) => !css.includes(token)).sort();

  assert.deepEqual(missing, [], "colour utilities the build never emits");
});

test("compiles Tailwind rather than passing globals.css through raw", async () => {
  const css = await compiledStylesheet();
  const source = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");

  // The failure mode was not an error, it was a pass-through: the directives
  // survived into the output verbatim because nothing consumed them. Their
  // presence in compiled CSS is the signature of a build with no Tailwind in
  // it, and it is what this venture has shipped since 2026-08-04.
  for (const directive of ["@tailwind base", "@tailwind components", "@tailwind utilities"]) {
    assert.ok(
      !css.includes(directive),
      `unprocessed \`${directive}\` directive in compiled output`,
    );
  }

  assert.ok(
    css.length > source.length * 10,
    `compiled stylesheet (${css.length} bytes) is not meaningfully larger than its source (${source.length} bytes)`,
  );
});
