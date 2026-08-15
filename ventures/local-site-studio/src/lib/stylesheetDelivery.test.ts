import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { describe, expect, it } from "vitest";

/**
 * The design has to survive the build.
 *
 * On 2026-08-04, commit 2fdcf837 — "feat: complete stash convergence and clean
 * uncommitted work" — deleted `postcss.config.mjs` from this venture. That
 * file's only content was wiring the `@tailwindcss/postcss` plugin into the
 * build, and nothing else referenced it.
 *
 * Nothing went red. `tailwindcss` and `@tailwindcss/postcss` stayed in
 * package.json, `@import "tailwindcss"` stayed at the top of `globals.css`,
 * and typecheck, lint, the whole vitest suite and `next build` all passed.
 * `next build` even kept emitting a stylesheet and linking it from every page.
 * That stylesheet was 524 bytes: `globals.css` with its `@theme` directive
 * passed through raw and not one utility class in it, against the 50,576 bytes
 * and 110 colour utilities a wired build emits. Every `bg-*` and `text-*` in
 * 54 `.tsx` files resolved to nothing.
 *
 * The failure mode is a pass-through, not an error, so no control that reads
 * the manifest or the source can see it — in the broken state and the healthy
 * state the manifest, the markup and the exit codes are identical. This test
 * therefore asserts on the real pipeline: it loads the PostCSS config the build
 * loads, runs the plugins that config declares over the real `globals.css`, and
 * requires the utilities the markup actually uses to come out the other side. A
 * missing config file, an unwired plugin, or a renamed one all fail it.
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
  expect(declared.length, "plugins declared in postcss.config.mjs").toBeGreaterThan(0);

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

describe("stylesheet delivery", () => {
  it("emits the colour utilities the markup uses", async () => {
    const css = await compiledStylesheet();
    const wanted = usedColourUtilities();

    // Guards against a vacuous pass if the class reader ever stops finding
    // anything: an empty wanted set would make the filter below assert nothing.
    expect(wanted.size, "colour utilities found in the markup").toBeGreaterThan(50);

    // A variant compiles to an escaped selector (`.dark\:text-slate-300`), so
    // the utility is looked for as a substring of the output rather than as a
    // whole class — either form is evidence the token was emitted.
    const missing = [...wanted].filter((token) => !css.includes(token)).sort();

    expect(missing, "colour utilities the build never emits").toEqual([]);
  });

  it("compiles Tailwind rather than passing globals.css through raw", async () => {
    const css = await compiledStylesheet();
    const source = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");

    // The failure mode was not an error, it was a pass-through: the directives
    // survived into the output verbatim because nothing consumed them. Their
    // presence in compiled CSS is the signature of a build with no Tailwind in
    // it, and it is what shipped for four days.
    expect(css, "unprocessed @theme directive in compiled output").not.toContain("@theme");
    expect(css, "unprocessed @variant directive in compiled output").not.toContain("@variant");
    expect(css.length, "compiled stylesheet size vs its source").toBeGreaterThan(source.length * 10);
  });
});
