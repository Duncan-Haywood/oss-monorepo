#!/usr/bin/env node
// Usage:
//   node cli.mjs ./public --base https://example.com [--priority /pricing,/guide] [--json]
//   node cli.mjs https://example.com/sitemap.xml [--max 500]
// A folder is read from disk (a static-site build output). A sitemap URL is fetched page by page,
// politely (4 at a time, only URLs the sitemap lists on its own host). Audit sites you own.
import fs from "node:fs";
import path from "node:path";
import { analyze, renderMarkdown } from "./engine.mjs";

export function readDir(dir, base) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.html?$/i.test(e.name)) out.push({ url: new URL(path.relative(dir, p).split(path.sep).map(encodeURIComponent).join("/"), base.replace(/\/?$/, "/")).href, html: fs.readFileSync(p, "utf8") });
    }
  };
  walk(dir);
  return out;
}

export function parseSitemap(xml) {
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  return { urls: locs.filter((u) => !/\.xml(\.gz)?$/i.test(u)), indexes: locs.filter((u) => /\.xml$/i.test(u)) };
}

export async function fetchSite(sitemapUrl, { fetchImpl = fetch, max = 500, concurrency = 4, delayMs = 100 } = {}) {
  const host = new URL(sitemapUrl).host, ua = { "user-agent": "internal-link-planner (+https://github.com/Duncan-Haywood/oss-monorepo)" };
  const get = async (u) => { const r = await fetchImpl(u, { headers: ua, redirect: "follow", signal: AbortSignal.timeout(15_000) }); if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.text(); };
  const queue = [sitemapUrl], urls = [];
  for (let i = 0; i < queue.length && i < 20; i++) { const { urls: u, indexes } = parseSitemap(await get(queue[i])); urls.push(...u); queue.push(...indexes); }
  const todo = [...new Set(urls)].filter((u) => { try { return new URL(u).host === host; } catch { return false; } }).slice(0, max), pages = [], failed = [];
  let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < todo.length) {
      const u = todo[next++];
      try { pages.push({ url: u, html: await get(u) }); } catch (e) { failed.push(e.message); }
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    }
  }));
  return { pages, failed };
}

export async function main(argv, io = { log: console.log, err: console.error }) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a === "--json") args.json = true; else if (a.startsWith("--")) args[a.slice(2)] = argv[++i]; else args._.push(a); }
  const src = args._[0];
  if (!src) { io.err("usage: node cli.mjs <folder | sitemap-url> [--base URL] [--home URL] [--priority /a,/b] [--max N] [--json]"); return 2; }
  let pages;
  if (/^https?:\/\//.test(src)) { const r = await fetchSite(src, { max: Number(args.max) || 500 }); pages = r.pages; if (r.failed.length) io.err(`${r.failed.length} pages could not be fetched`); }
  else {
    if (!args.base) { io.err("--base https://your-site.com is required when reading a folder"); return 2; }
    pages = readDir(src, args.base);
  }
  if (!pages.length) { io.err("no pages found"); return 1; }
  const report = analyze(pages, { home: args.home, priority: args.priority ? args.priority.split(",").map((s) => s.trim()).filter(Boolean) : [] });
  io.log(args.json ? JSON.stringify(report, null, 2) : renderMarkdown(report));
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main(process.argv.slice(2)));
