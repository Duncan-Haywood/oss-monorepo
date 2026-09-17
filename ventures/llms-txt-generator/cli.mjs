#!/usr/bin/env node
// Zero-dependency CLI: build an llms.txt from a local Markdown docs tree, a
// sitemap.xml (local file or a live URL -- Node's built-in fetch has no CORS
// restriction, unlike the browser page), or a plain URL list; or validate an
// existing llms.txt against the same structural rules the browser page uses.
//
//   node cli.mjs --dir ./docs --title "Example Docs" --base-url https://example.com
//   node cli.mjs --sitemap ./sitemap.xml --title "Example Site" --base-url https://example.com
//   node cli.mjs --sitemap https://example.com/sitemap.xml --title "Example Site"
//   node cli.mjs --urls-file ./urls.txt --title "Example Site"
//   node cli.mjs --check ./llms.txt
//   any build mode + --out llms.txt   (default: prints to stdout)

import fs from "node:fs/promises";
import path from "node:path";
import {
  buildLlmsTxt,
  validateLlmsTxt,
  parseSitemapXml,
  parseSectionedInput,
  resolveBaseUrl,
  extractMarkdownSummary,
} from "./generator.mjs";

const HELP = `Usage:
  node cli.mjs --dir <path> --title "Site Name" [--base-url URL] [--summary "..."] [--out FILE]
  node cli.mjs --sitemap <path-or-URL> --title "Site Name" [--base-url URL] [--summary "..."] [--out FILE]
  node cli.mjs --urls-file <path> --title "Site Name" [--base-url URL] [--summary "..."] [--out FILE]
  node cli.mjs --check <path-to-llms.txt>

--dir walks a local Markdown docs tree (*.md, *.markdown) and extracts each
  file's own "# Heading" and first paragraph. Files are grouped by their
  top-level subdirectory into "## Section" headings (files directly in --dir
  go under "## Docs"). With no --base-url, link URLs are the file's own
  relative path from --dir (e.g. "/guides/migrate.md") -- pass --base-url to
  produce absolute links instead.
--sitemap reads <loc> entries from a sitemap.xml, one URL per link, grouped
  under "## Pages". A URL (http/https) is fetched directly; a local path is
  read from disk.
--urls-file reads the same "## Section" / "url | title | description"
  mini-format the browser page uses.
--check validates an existing llms.txt and exits 1 if it has structural
  errors (0 if only warnings, or none).`;

function parseArgs(argv) {
  const args = { out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dir") args.dir = argv[++i];
    else if (a === "--sitemap") args.sitemap = argv[++i];
    else if (a === "--urls-file") args.urlsFile = argv[++i];
    else if (a === "--check") args.check = argv[++i];
    else if (a === "--title") args.title = argv[++i];
    else if (a === "--summary") args.summary = argv[++i];
    else if (a === "--base-url") args.baseUrl = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
  }
  return args;
}

async function walkMarkdown(dir, readDirImpl, readFileImpl, relBase = "") {
  const entries = await readDirImpl(dir, { withFileTypes: true });
  let files = [];
  for (const entry of entries) {
    const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files = files.concat(await walkMarkdown(path.join(dir, entry.name), readDirImpl, readFileImpl, rel));
    } else if (/\.(md|markdown)$/i.test(entry.name)) {
      const content = await readFileImpl(path.join(dir, entry.name));
      files.push({ relPath: rel.split(path.sep).join("/"), content });
    }
  }
  return files;
}

function sectionsFromMarkdownFiles(files) {
  const byTop = new Map();
  for (const file of files.sort((a, b) => a.relPath.localeCompare(b.relPath))) {
    const parts = file.relPath.split("/");
    const heading = parts.length > 1 ? parts[0].replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Docs";
    if (!byTop.has(heading)) byTop.set(heading, []);
    const { title, description } = extractMarkdownSummary(file.content);
    byTop.get(heading).push({
      url: `/${file.relPath}`,
      title: title || file.relPath,
      note: description || undefined,
    });
  }
  return [...byTop.entries()].map(([heading, links]) => ({ heading, links }));
}

async function readSitemapSource(source, fetchImpl, readFileImpl) {
  if (/^https?:\/\//i.test(source)) {
    const res = await fetchImpl(source);
    if (!res.ok) throw new Error(`Could not fetch ${source}: HTTP ${res.status}`);
    return res.text();
  }
  return readFileImpl(source);
}

export async function run(
  argv,
  {
    readDirImpl = (p, opts) => fs.readdir(p, opts),
    readFileImpl = (p) => fs.readFile(p, "utf8"),
    writeFileImpl = (p, content) => fs.writeFile(p, content, "utf8"),
    fetchImpl = fetch,
  } = {}
) {
  const args = parseArgs(argv);

  if (args.help || (!args.dir && !args.sitemap && !args.urlsFile && !args.check)) {
    return { exitCode: args.help ? 0 : 1, output: HELP };
  }

  if (args.check) {
    const text = await readFileImpl(args.check);
    const report = validateLlmsTxt(text);
    const lines = [`Checking ${args.check}`, ""];
    lines.push(report.valid ? "Structurally valid." : "Has structural errors.");
    lines.push(`${report.linkCount ?? 0} link(s) across ${report.sections?.length ?? 0} section(s).`);
    for (const e of report.errors) lines.push(`  error: ${e}`);
    for (const w of report.warnings) lines.push(`  warning: ${w}`);
    return { exitCode: report.valid ? 0 : 1, output: lines.join("\n") };
  }

  if (!args.title) {
    return { exitCode: 1, output: 'A --title is required when building llms.txt (used as the "# Title").' };
  }

  let sections;
  try {
    if (args.dir) {
      const files = await walkMarkdown(args.dir, readDirImpl, readFileImpl);
      sections = sectionsFromMarkdownFiles(files);
    } else if (args.sitemap) {
      const xml = await readSitemapSource(args.sitemap, fetchImpl, readFileImpl);
      const urls = parseSitemapXml(xml);
      sections = [{ heading: "Pages", links: urls.map((url) => ({ url, title: url })) }];
    } else {
      const text = await readFileImpl(args.urlsFile);
      sections = parseSectionedInput(text);
    }
  } catch (err) {
    return { exitCode: 1, output: `Error: ${err.message}` };
  }

  if (args.baseUrl) sections = resolveBaseUrl(sections, args.baseUrl);

  const totalLinks = sections.reduce((n, s) => n + s.links.length, 0);
  if (totalLinks === 0) {
    return { exitCode: 1, output: "No links found -- nothing to write. Check the source path/URL and its contents." };
  }

  const output = buildLlmsTxt({ title: args.title, summary: args.summary, sections });
  const report = validateLlmsTxt(output);

  if (args.out) {
    await writeFileImpl(args.out, output);
    const lines = [`Wrote ${args.out} (${report.linkCount} link(s) across ${report.sections.length} section(s)).`];
    for (const w of report.warnings) lines.push(`  warning: ${w}`);
    return { exitCode: 0, output: lines.join("\n") };
  }

  return { exitCode: 0, output };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
