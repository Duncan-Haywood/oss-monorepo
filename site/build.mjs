// Renders the constitution's markdown source into a static, styled HTML
// site. Markdown stays the edited source of truth (see docs/00-overview.md
// for why) — this script is a one-way render step, not a two-way sync.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIST = join(__dirname, "dist");

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

function renderNav(activeOut) {
  const items = pages
    .map((p) => {
      const cls = p.out === activeOut ? ' class="active"' : "";
      return `<li><a href="${p.out}"${cls}>${p.nav}</a></li>`;
    })
    .join("\n      ");
  return `<ul>\n      ${items}\n    </ul>`;
}

function template({ title, activeOut, bodyHtml, sourcePath }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — AI Engineering Academy</title>
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
console.log(`\nDone. Open ${join(DIST, "index.html")}`);
