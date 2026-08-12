import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { pathToFileURL } from "url";
import { describe, expect, it } from "vitest";
import { classLists, colours } from "./classAudit";

/**
 * The colours the contrast audit measures have to reach a browser.
 *
 * `contrastAudit.test.ts` proves every text colour in this app clears the WCAG
 * AA floor. It reads Tailwind class tokens out of the `.tsx` and resolves them
 * against `node_modules/tailwindcss/theme.css`. Both halves of that are true of
 * the *source*, and neither is a statement about the artifact that gets served.
 *
 * On 2026-08-04, commit 2fdcf837 — "feat: complete stash convergence and clean
 * uncommitted work" — deleted `postcss.config.mjs`, the file whose only content
 * was wiring the `@tailwindcss/postcss` plugin into the build. Nothing else
 * referenced it. `tailwindcss` and `@tailwindcss/postcss` stayed in
 * package.json, `@import "tailwindcss"` stayed at the top of `globals.css`,
 * typecheck, lint, the whole vitest suite and `next build` all stayed green,
 * and `next build` kept emitting a stylesheet and kept linking it from every
 * page. The stylesheet was 1,107 bytes: `globals.css` with its `@variant` and
 * `@theme` directives passed through raw and not one utility class in it.
 *
 * So for four days the app shipped with no Tailwind CSS at all, and the
 * contrast audit went on proving the WCAG compliance of a palette that was
 * never delivered — 1,083 measurements against a stylesheet the browser never
 * received. A control that reads only the source cannot see that; the
 * difference between the two states is invisible everywhere except in the build
 * output.
 *
 * This test therefore asserts on the real pipeline rather than on the manifest:
 * it loads the PostCSS config the build loads, runs the plugins that config
 * declares over the real `globals.css`, and requires the colour utilities the
 * contrast audit measures to come out the other side. A missing config file, an
 * unwired plugin, or a renamed one all fail it, because in each case the
 * utilities stop being emitted.
 */

const ROOT = process.cwd();

/** Every `.tsx` the contrast audit reads, so the two controls cover one set. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (path.endsWith(".tsx") && !path.endsWith(".test.tsx")) out.push(path);
  }
  return out;
}

/** The text and background colour utilities the contrast audit resolves. */
function auditedColourClasses(): Set<string> {
  const wanted = new Set<string>();
  for (const file of [...sourceFiles(join(ROOT, "src")), join(ROOT, "developmentprocess.tsx")]) {
    const rel = relative(ROOT, file);
    for (const list of classLists(rel, readFileSync(file, "utf8"))) {
      const c = colours(list.classes);
      for (const token of [c.text, c.darkText, c.bg, c.darkBg]) {
        // Alpha-modified tokens (`stone-950/20`) compile to a rule whose
        // selector escapes the slash; the base utility is the honest thing to
        // look for and is emitted either way.
        if (token) wanted.add(token.split("/")[0]);
      }
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
  it("emits the colour utilities the contrast audit measures", async () => {
    const css = await compiledStylesheet();
    const wanted = auditedColourClasses();

    // Guards against a vacuous pass if the class reader ever stops finding
    // anything: an empty wanted set would make the loop below assert nothing.
    expect(wanted.size, "colour utilities found in the source").toBeGreaterThan(50);

    // `colours()` yields the bare palette name, so `dark:text-violet-300` and
    // `text-violet-300` both arrive as `violet-300`. A variant compiles to an
    // escaped selector (`.dark\:text-violet-300`), so the utility is looked for
    // by its `text-`/`bg-` stem anywhere in a selector rather than as a whole
    // class — either one is evidence the token was emitted.
    const missing = [...wanted]
      .filter((token) => !css.includes(`text-${token}`) && !css.includes(`bg-${token}`))
      .sort();

    expect(missing, "colour utilities the build never emits").toEqual([]);
  });

  it("compiles Tailwind rather than passing globals.css through raw", async () => {
    const css = await compiledStylesheet();
    const source = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");

    // The failure mode was not an error, it was a pass-through: the directives
    // survived into the output verbatim because nothing consumed them. Their
    // presence in compiled CSS is the signature of a build with no Tailwind in
    // it, and it is what shipped.
    expect(css, "unprocessed @theme directive in compiled output").not.toContain("@theme");
    expect(css, "unprocessed @variant directive in compiled output").not.toContain("@variant");
    expect(css.length, "compiled stylesheet size vs its source").toBeGreaterThan(source.length * 10);
  });
});
