// Runs PurgeCSS over every HTML page under a directory, one page at a time,
// and prints one JSON line per page with the selectors it would remove.
//
//   node purgecss_pages.mjs <purgecss module dir> <root>
//
// Each page is prepared exactly as `csshound --pages --json` prepares it
// (src/page.rs): the CSS is the page's <style> blocks plus the local
// stylesheets it links (a <style> inside a comment or script is text), and
// the content is the page with those <style>
// blocks cut out plus the local scripts it loads. PurgeCSS then runs with its
// defaults and `rejected: true`. The comparison is compare_rejected.py.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative, resolve, sep } from "node:path";
import { createRequire } from "node:module";

const [modDir, root] = process.argv.slice(2);
const { PurgeCSS } = createRequire(join(resolve(modDir), "x.js"))("purgecss");

const SKIP = new Set(["node_modules", ".git", "target"]);
function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (name.endsWith(".html")) out.push(p);
  }
  return out;
}

function localPath(pageDir, ref) {
  if (/^([a-z][a-z0-9+.-]*:|\/)/i.test(ref)) return null;
  const clean = ref.split(/[?#]/)[0];
  if (!clean) return null;
  const p = resolve(pageDir, clean);
  return existsSync(p) && statSync(p).isFile() ? p : null;
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
}

export function preparePage(file) {
  const html = readFileSync(file, "utf8");
  const dir = dirname(file);
  const css = [];
  // A `<style>` inside a comment or a script is text, not a style element.
  // Repeat until stable so removing one <style> cannot splice a new one together.
  let content = html;
  for (let prev; prev !== content;) {
    prev = content;
    content = content.replace(
      /<!--[\s\S]*?--!?>|<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>|<style\b[^>]*>([\s\S]*?)<\/style\b[^>]*>/gi,
      (m, body) => {
        if (body === undefined) return m;
        css.push(body);
        return "";
      },
    );
  }
  const extra = [];
  for (const tag of content.match(/<link\b[^>]*>/gi) || []) {
    const rel = attr(tag, "rel");
    const href = attr(tag, "href");
    if (!rel || !href || !rel.toLowerCase().split(/\s+/).includes("stylesheet")) continue;
    const p = localPath(dir, href);
    if (p) css.push(readFileSync(p, "utf8"));
  }
  for (const tag of content.match(/<script\b[^>]*>/gi) || []) {
    const src = attr(tag, "src");
    if (!src) continue;
    const p = localPath(dir, src);
    if (p) extra.push(readFileSync(p, "utf8"));
  }
  return { css: css.join("\n"), content: [content, ...extra].join("\n") };
}

const absRoot = resolve(root);
const pages = walk(absRoot, []).sort();
for (const file of pages) {
  const { css, content } = preparePage(file);
  if (!css.trim()) continue;
  const rel = relative(absRoot, file).split(sep).join("/");
  try {
    const [res] = await new PurgeCSS().purge({
      content: [{ raw: content, extension: "html" }],
      css: [{ raw: css }],
      rejected: true,
    });
    process.stdout.write(JSON.stringify({ page: rel, rejected: [...new Set(res.rejected)].sort() }) + "\n");
  } catch (e) {
    process.stdout.write(JSON.stringify({ page: rel, error: String(e.message).slice(0, 200) }) + "\n");
  }
}
