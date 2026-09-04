// Renders the constitution's markdown source into a static, styled HTML
// site. Markdown stays the edited source of truth (see docs/00-overview.md
// for why) — this script is a one-way render step, not a two-way sync.
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  existsSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import {
  TOOLS_DIR,
  SITE_FAVICON,
  extractToolMetadata,
  rewriteToolPage,
  renderToolsHub,
  renderSitemap,
  renderRobots,
} from "./tools.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIST = join(__dirname, "dist");

// Absolute URLs (sitemap, canonical links) are only correct once the site
// has a home. Set SITE_BASE_URL at deploy time; unset, the build simply
// omits them rather than baking in a hostname that doesn't serve the site.
const BASE_URL = process.env.SITE_BASE_URL || "";

marked.use({ gfm: true, breaks: false });

const pages = [
  { src: "PROJECT_BRIEF.md", out: "brief.html", nav: "Project Brief" },
  { src: "docs/00-overview.md", out: "index.html", nav: "Overview" },
  { src: "docs/01-philosophy-and-vision.md", out: "01-philosophy-and-vision.html", nav: "1. Philosophy & Vision" },
  { src: "docs/02-learning-science-and-ai-mentor.md", out: "02-learning-science-and-ai-mentor.html", nav: "2. Learning Science & AI Mentor" },
  { src: "docs/03-curriculum-and-assessment.md", out: "03-curriculum-and-assessment.html", nav: "3. Curriculum & Assessment" },
  { src: "docs/04-technical-architecture.md", out: "04-technical-architecture.html", nav: "4. Technical Architecture" },
  { src: "docs/05-business-and-strategy.md", out: "05-business-and-strategy.html", nav: "5. Business & Strategy" },
  { src: "docs/06-market-and-roadmap.md", out: "06-market-and-roadmap.html", nav: "6. Market & Roadmap" },
];

// Maps every known markdown basename to its rendered output filename, so
// links between docs (e.g. "01-philosophy-and-vision.md") resolve inside
// the built site instead of pointing at a raw .md file.
const linkMap = new Map(
  pages.map((p) => [p.src.split("/").pop(), p.out])
);

function rewriteMdLinks(html) {
  return html.replace(
    /href="([^"]+?\/)?([^"/]+\.md)(#[^"]*)?"/g,
    (whole, _prefix, basename, anchor = "") => {
      const target = linkMap.get(basename);
      return target ? `href="${target}${anchor}"` : whole;
    }
  );
}

function extractTitle(markdown) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "AI Engineering Academy";
}

// Nav destinations that aren't rendered from markdown. The calculators are
// the only part of this venture a stranger can actually use today, so they
// get a permanent slot in the sidebar rather than living unlinked in dist/.
const navExtras = [{ href: `${TOOLS_DIR}/`, nav: "Free Calculators" }];

function renderNav(activeOut) {
  const items = [
    ...pages.map((p) => ({ href: p.out, nav: p.nav, active: p.out === activeOut })),
    ...navExtras.map((e) => ({ ...e, active: false })),
  ]
    .map(({ href, nav, active }) => {
      const cls = active ? ' class="active"' : "";
      return `<li><a href="${href}"${cls}>${nav}</a></li>`;
    })
    .join("\n      ");
  return `<ul>\n      ${items}\n    </ul>`;
}

/**
 * Copies each standalone tool into the built site and generates the hub
 * page that lists them. Tool sources are never modified — the site chrome
 * is injected into the dist copies only, so every calculator keeps working
 * when opened straight off disk.
 */
function buildTools() {
  const toolsRoot = join(ROOT, TOOLS_DIR);
  if (!existsSync(toolsRoot)) return [];

  const slugs = readdirSync(toolsRoot)
    .filter((name) => statSync(join(toolsRoot, name)).isDirectory())
    .filter((name) => existsSync(join(toolsRoot, name, "index.html")))
    .sort();

  const tools = slugs.map((slug) =>
    extractToolMetadata(
      readFileSync(join(toolsRoot, slug, "index.html"), "utf8"),
      slug
    )
  );

  for (const slug of slugs) {
    const srcDir = join(toolsRoot, slug);
    const outDir = join(DIST, TOOLS_DIR, slug);
    mkdirSync(outDir, { recursive: true });

    for (const entry of readdirSync(srcDir)) {
      const srcPath = join(srcDir, entry);
      if (!statSync(srcPath).isFile()) continue;
      // Tests never ship: they double the payload a visitor downloads and
      // describe the tool's internals rather than helping anyone use it.
      if (entry.endsWith(".test.mjs")) continue;
      // Each tool carries its own robots.txt for the case where it is
      // served alone. Nested under the site it is dead weight — crawlers
      // only read the one at the origin root, which the build emits.
      if (entry === "robots.txt") continue;

      if (entry === "index.html") {
        const html = readFileSync(srcPath, "utf8");
        writeFileSync(join(outDir, entry), rewriteToolPage(html, tools, slug), "utf8");
      } else {
        copyFileSync(srcPath, join(outDir, entry));
      }
    }
    console.log(`built ${TOOLS_DIR}/${slug}/`);
  }

  mkdirSync(join(DIST, TOOLS_DIR), { recursive: true });
  writeFileSync(join(DIST, TOOLS_DIR, "index.html"), renderToolsHub(tools), "utf8");
  console.log(`built ${TOOLS_DIR}/index.html (${tools.length} calculator(s))`);

  return tools;
}

function template({ title, activeOut, bodyHtml, sourcePath }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — AI Engineering Academy</title>
<link rel="icon" href="${SITE_FAVICON}">
<link rel="stylesheet" href="style.css">
</head>
<body>
<input type="checkbox" id="nav-toggle" class="nav-toggle">
<label for="nav-toggle" class="nav-toggle-label">☰ Menu</label>
<nav class="sidebar">
  <div class="sidebar-title">AI Engineering Academy</div>
  <div class="sidebar-subtitle">Constitution</div>
  ${renderNav(activeOut)}
</nav>
<main>
  <article>
    ${bodyHtml}
  </article>
  <footer>
    <p>Rendered from <code>${sourcePath}</code>. Markdown is the edited
    source — edit it there, then run <code>npm run build</code> in
    <code>site/</code> to regenerate this page.</p>
  </footer>
</main>
</body>
</html>
`;
}

mkdirSync(DIST, { recursive: true });

for (const page of pages) {
  const srcPath = join(ROOT, page.src);
  const markdown = readFileSync(srcPath, "utf8");
  const title = extractTitle(markdown);
  let bodyHtml = marked.parse(markdown);
  bodyHtml = rewriteMdLinks(bodyHtml);

  const html = template({
    title,
    activeOut: page.out,
    bodyHtml,
    sourcePath: page.src,
  });

  writeFileSync(join(DIST, page.out), html, "utf8");
  console.log(`built ${page.out}`);
}

copyFileSync(join(__dirname, "style.css"), join(DIST, "style.css"));

const tools = buildTools();

writeFileSync(join(DIST, "robots.txt"), renderRobots(BASE_URL), "utf8");
console.log("built robots.txt");

const sitemap = renderSitemap(
  [
    "",
    ...pages.filter((p) => p.out !== "index.html").map((p) => p.out),
    `${TOOLS_DIR}/`,
    ...tools.map((t) => `${TOOLS_DIR}/${t.slug}/`),
  ],
  BASE_URL
);
if (sitemap) {
  writeFileSync(join(DIST, "sitemap.xml"), sitemap, "utf8");
  console.log("built sitemap.xml");
} else {
  console.log("skipped sitemap.xml (set SITE_BASE_URL to generate it)");
}

console.log(`\nDone. Open ${join(DIST, "index.html")}`);
console.log(`Calculators: ${join(DIST, TOOLS_DIR, "index.html")}`);
