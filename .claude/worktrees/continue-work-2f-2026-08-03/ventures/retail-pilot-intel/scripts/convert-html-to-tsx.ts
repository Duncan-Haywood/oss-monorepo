/**
 * One-time / repeatable converter: HTML reports under docs/ and reports/
 * → TSX pages in apps/docs/src/pages/commercial-viability/
 *
 * Run: pnpm exec tsx scripts/convert-html-to-tsx.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "apps/docs/src/pages/commercial-viability");

interface SourceSpec {
  file: string;
  exportName: string;
  routeSlug: string;
}

const sources: SourceSpec[] = [
  {
    file: "docs/commercial-viability-report.html",
    exportName: "CommercialViabilityReportPage",
    routeSlug: "report",
  },
  {
    file: "reports/commercial-viability-assessment.html",
    exportName: "CommercialViabilityAssessmentPage",
    routeSlug: "assessment",
  },
  {
    file: "reports/commercial-viability-deep-assessment.html",
    exportName: "CommercialViabilityDeepAssessmentPage",
    routeSlug: "deep-assessment",
  },
  {
    file: "reports/commercial-viability-deep-dive-2026.html",
    exportName: "CommercialViabilityDeepDive2026Page",
    routeSlug: "deep-dive-2026",
  },
  {
    file: "reports/commercial-viability-deep-dive.html",
    exportName: "CommercialViabilityDeepDivePage",
    routeSlug: "deep-dive",
  },
];

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m?.[1]?.replace(/\s*[—–-]\s*Retail Pilot Intel\s*$/i, "").trim() ?? "Report";
}

function extractMeta(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (!bodyMatch) return "";
  const metaMatch = bodyMatch[1].match(
    /<header[\s\S]*?<p class="meta"[^>]*>([\s\S]*?)<\/p>/i,
  );
  if (!metaMatch) return "";
  return metaMatch[1]
    .replace(/<br\s*\/?>/gi, " · ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractBodyContent(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (!bodyMatch) throw new Error("No body found");
  let content = bodyMatch[1];

  // Drop outer wrap header (h1 + meta) — DocLayout provides title/subtitle
  content = content.replace(
    /<div class="wrap">\s*<header>[\s\S]*?<\/header>/i,
    '<div class="doc-prose">',
  );
  content = content.replace(/<\/div>\s*<\/body>/i, "</div>");

  // Remove scripts
  content = content.replace(/<script[\s\S]*?<\/script>/gi, "");
  // Remove HTML comments
  content = content.replace(/<!--[\s\S]*?-->/g, "");

  return content.trim();
}

function parseInlineStyle(style: string): string {
  const entries = style
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf(":");
      if (idx === -1) return null;
      const key = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      const camel = key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      return `${camel}: ${JSON.stringify(val)}`;
    })
    .filter(Boolean);
  return `{ ${entries.join(", ")} }`;
}

function htmlToJsx(html: string): string {
  let s = html;

  // Escape JSX curlies in text — temporarily protect tags
  s = s.replace(/\sclass="/g, ' className="');
  s = s.replace(/\sfor="/g, ' htmlFor="');
  s = s.replace(/\scolspan="/g, ' colSpan="');
  s = s.replace(/\srowspan="/g, ' rowSpan="');
  s = s.replace(/\stabindex="/g, ' tabIndex="');

  // Inline styles
  s = s.replace(/\sstyle="([^"]*)"/g, (_, style: string) => {
    return ` style={${parseInlineStyle(style)}}`;
  });

  // Self-closing tags
  s = s.replace(/<br\s*>/gi, "<br />");
  s = s.replace(/<br\s*\/>/gi, "<br />");
  s = s.replace(/<hr\s*>/gi, "<hr />");
  s = s.replace(/<hr\s*\/>/gi, "<hr />");

  // Non-standard HTML tags → span
  s = s.replace(/<citation(\s[^>]*)?>/gi, '<span className="citation">');
  s = s.replace(/<\/citation>/gi, "</span>");

  // class on divs that conflict with Card component — keep as className
  return s;
}

function componentNameToFile(exportName: string): string {
  return exportName.replace(/Page$/, "Page.tsx");
}

function generatePage(spec: SourceSpec): void {
  const filePath = join(root, spec.file);
  const raw = readFileSync(filePath, "utf8");
  const title = extractTitle(raw);
  const subtitle = extractMeta(raw);
  const body = extractBodyContent(raw);
  const jsxBody = htmlToJsx(body);

  const tsx = `/** Converted from ${spec.file} — edit here; re-run convert-html-to-tsx.ts to refresh from HTML. */
import { Link } from "react-router-dom";
import { DocLayout } from "../../components/DocLayout";
import { CommercialViabilitySubnav } from "../../components/CommercialViabilitySubnav";

export function ${spec.exportName}() {
  return (
    <DocLayout
      title={${JSON.stringify(title)}}
      subtitle={${JSON.stringify(subtitle)}}
      footer={
        <>
          <Link to="/commercial-viability">← Commercial viability hub</Link>
          {" · "}
          <Link to="/business-plan">Business plan</Link>
          {" · "}
          <Link to="/roi">ROI</Link>
        </>
      }
    >
      <CommercialViabilitySubnav />
      ${jsxBody}
    </DocLayout>
  );
}
`;

  const outPath = join(outDir, componentNameToFile(spec.exportName));
  writeFileSync(outPath, tsx, "utf8");
  console.log(`✓ ${spec.file} → ${outPath}`);
}

function generateIndex(manifest: Array<{ exportName: string; routeSlug: string; title: string }>): void {
  const imports = manifest
    .map((m) => `import { ${m.exportName} } from "./${m.exportName.replace(/Page$/, "Page")}";`)
    .join("\n");

  const exports = manifest.map((m) => `  ${m.exportName},`).join("\n");

  const indexTs = `${imports}

export {
${exports}
};

export const commercialViabilityPages = ${JSON.stringify(
    manifest.map((m) => ({
      slug: m.routeSlug,
      title: m.title,
      exportName: m.exportName,
    })),
    null,
    2,
  )} as const;
`;

  writeFileSync(join(outDir, "index.ts"), indexTs, "utf8");
  console.log(`✓ index.ts (${manifest.length} pages)`);
}

mkdirSync(outDir, { recursive: true });

const manifest: Array<{ exportName: string; routeSlug: string; title: string }> = [];

for (const spec of sources) {
  const raw = readFileSync(join(root, spec.file), "utf8");
  generatePage(spec);
  manifest.push({
    exportName: spec.exportName,
    routeSlug: spec.routeSlug,
    title: extractTitle(raw),
  });
}

generateIndex(manifest);
console.log("\nDone. Wire routes in App.tsx and remove HTML sync when ready.");
