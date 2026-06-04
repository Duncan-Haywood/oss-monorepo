/**
 * One-time helper: converts docs/*.html and reports/*.html into TSX modules.
 * Re-run only when importing legacy HTML; canonical sources live in apps/docs/src/reports/.
 */
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "apps/docs/src/reports");

interface LegacySlug {
  slug: string;
  title: string;
  sourcePath: string;
}

function collectHtml(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      found.push(...collectHtml(full));
    } else if (name.endsWith(".html")) {
      found.push(full);
    }
  }
  return found;
}

function slugify(file: string): string {
  return basename(file, ".html")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function legacyIframeSlug(label: string, file: string, sourceRoot: string): string {
  const rel = relative(sourceRoot, file).replace(/\\/g, "/");
  return `${label}/${rel}`.replace(/\.html$/i, "").replace(/\//g, "-");
}

function pascalCase(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

function extractParts(raw: string): { title: string; css: string; html: string } {
  const titleMatch = raw.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch?.[1]?.trim() || "Untitled report";

  const styles: string[] = [];
  for (const m of raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    styles.push(m[1] ?? "");
  }

  const bodyMatch = raw.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  let html = bodyMatch?.[1]?.trim() ?? raw;
  html = html.replace(/<script[\s\S]*?<\/script>/gi, "");

  return { title, css: styles.join("\n"), html };
}

const sources: { dir: string; label: string }[] = [
  { dir: join(root, "docs"), label: "docs" },
  { dir: join(root, "reports"), label: "reports" },
];

mkdirSync(outDir, { recursive: true });

const written: LegacySlug[] = [];

for (const { dir, label } of sources) {
  for (const file of collectHtml(dir)) {
    const raw = readFileSync(file, "utf8");
    const { title, css, html } = extractParts(raw);
    const slug = slugify(file);
    const componentName = `${pascalCase(slug)}Page`;
    const relSource = relative(root, file).replace(/\\/g, "/");
    const legacySlug = legacyIframeSlug(label, file, dir);

    const source = `/** Long-form report — edit in TSX; was \`${relSource}\`. */
import { ReportShell } from "../components/ReportShell";

export const reportMeta = {
  slug: ${JSON.stringify(slug)},
  title: ${JSON.stringify(title)},
  legacySlugs: ${JSON.stringify([legacySlug])},
  sourcePath: ${JSON.stringify(relSource)},
} as const;

const reportCss = ${JSON.stringify(css)};

const reportBodyHtml = ${JSON.stringify(html)};

export function ${componentName}() {
  return (
    <ReportShell css={reportCss}>
      <div dangerouslySetInnerHTML={{ __html: reportBodyHtml }} />
    </ReportShell>
  );
}
`;

    const outPath = join(outDir, `${componentName}.tsx`);
    writeFileSync(outPath, source, "utf8");
    written.push({ slug, title, sourcePath: relSource });
    console.log(`  wrote ${relative(root, outPath)} ← ${relSource}`);
  }
}

console.log(`\n✓ ${written.length} TSX report module(s) in apps/docs/src/reports/`);
