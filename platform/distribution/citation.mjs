/**
 * Citation channel: makes the research portfolio citable and archivable.
 *
 *   node platform/distribution/citation.mjs            # dry run: prints counts and a sample
 *   node platform/distribution/citation.mjs --write    # writes CITATION.cff and research/CITATIONS.bib
 *   node platform/distribution/citation.mjs --check    # exit 1 if the committed files are stale
 *
 * Needs no account or secret. The owner step is switching this repository on at
 * zenodo.org (GitHub integration); every GitHub release (releases.mjs makes one
 * weekly) is then archived with a DOI, and GitHub shows a "Cite this repository"
 * box from CITATION.cff. Authors are the project, never a named person.
 * See portfolio/distribution/README.md.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
export const REPO_URL = 'https://github.com/Duncan-Haywood/oss-monorepo';
export const YEAR = 2026;

/** Title of a project: its README's first H1, with the "slug: " prefix dropped. */
export function titleOf(slug, readme) {
  const h1 = /^#\s+(.+?)\s*$/m.exec(readme || '');
  let t = h1 ? h1[1] : slug;
  t = t.replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim();
  return t.length > 200 ? `${t.slice(0, 197)}...` : t;
}

const BIB_SPECIAL = { '\\': '\\textbackslash{}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}' };
const bibEscape = (s) => s.replace(/[\\~^]|[&%$#_{}]/g, (c) => BIB_SPECIAL[c] || `\\${c}`);

export function bibEntry(slug, title) {
  return `@misc{oss-research-${slug},
  title = {${bibEscape(title)}},
  author = {{oss-monorepo research contributors}},
  year = {${YEAR}},
  howpublished = {\\url{${REPO_URL}/tree/main/research/${slug}}},
  note = {Open research with AI assistance, MIT licensed. Stylised unless the project states otherwise.}
}
`;
}

export function citationCff() {
  return `cff-version: 1.2.0
message: "If you use this software or its research results, please cite them as below."
title: "oss-monorepo: open-source products and open research"
type: software
authors:
  - name: "oss-monorepo contributors"
repository-code: "${REPO_URL}"
url: "https://duncan-haywood.github.io/oss-monorepo/"
license: MIT
abstract: >-
  A monorepo of MIT-licensed free tools (ventures/) and open research (research/),
  produced with AI assistance. The tools are browser calculators, quoting and
  pricing tools, CSV import checkers, CI checks and self-hostable business apps
  for small businesses, freelancers and developers. The research covers mechanism
  design for verifying decentralised ML training, chip design, robotics, digital
  twins and more. Research results are mostly stylised or simulated; each
  project's README states its limits. Per-project BibTeX is in research/CITATIONS.bib.
keywords:
  - open source
  - open research
  - AI-assisted
  - small business tools
  - calculators
  - self-hosted
  - reproducible research
  - mechanism design
`;
}

export async function projects(root = REPO_ROOT) {
  const dir = path.join(root, 'research');
  const out = [];
  for (const e of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!e.isDirectory() || e.name.startsWith('_') || e.name.startsWith('.')) continue;
    const readme = await fs.readFile(path.join(dir, e.name, 'README.md'), 'utf8').catch(() => null);
    if (readme === null) continue;
    out.push({ slug: e.name, title: titleOf(e.name, readme) });
  }
  return out;
}

export async function build(root = REPO_ROOT) {
  const ps = await projects(root);
  return { cff: citationCff(), bib: ps.map((p) => bibEntry(p.slug, p.title)).join('\n'), count: ps.length };
}

export async function run({ root = REPO_ROOT, write = false, check = false, log = console.log } = {}) {
  const { cff, bib, count } = await build(root);
  const files = { 'CITATION.cff': cff, 'research/CITATIONS.bib': bib };
  if (write) {
    for (const [f, c] of Object.entries(files)) await fs.writeFile(path.join(root, f), c);
    log(`wrote CITATION.cff and research/CITATIONS.bib (${count} projects)`);
    return { stale: [] };
  }
  const stale = [];
  for (const [f, c] of Object.entries(files)) {
    if ((await fs.readFile(path.join(root, f), 'utf8').catch(() => null)) !== c) stale.push(f);
  }
  if (check) {
    log(stale.length ? `stale: ${stale.join(', ')} (run with --write)` : 'citation files are current');
    return { stale };
  }
  log(`DRY RUN: ${count} research projects. Stale on disk: ${stale.join(', ') || 'none'}. Sample:\n${bib.split('\n\n')[0]}`);
  return { stale };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const r = await run({ write: a.includes('--write'), check: a.includes('--check') });
  if (a.includes('--check') && r.stale.length) process.exit(1);
}
