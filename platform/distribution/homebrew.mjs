/**
 * Homebrew tap generator: for each venture CLI already published to npm by
 * npm.mjs, writes a `Formula/<slug>.rb` so `brew install <tap>/<slug>` works.
 * Off by default. See portfolio/distribution/README.md.
 *
 *   node platform/distribution/homebrew.mjs                 # dry run: lists the formulas it would write
 *   DISTRIBUTE_HOMEBREW=true node platform/distribution/homebrew.mjs --write <tapCheckout>
 *
 * The formula installs the npm tarball (so it depends on npm-cli-packages
 * being live, and covers only npm's allow-list, at versions.json's version);
 * a package that is not on the registry yet is skipped. The
 * sha256 is computed from the tarball the registry serves, never guessed.
 * Stateless: a formula file that already exists in the tap is left alone, and
 * at most MAX_PER_RUN new formulas are written per run.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { plan, packageName, VERSION } from './npm.mjs';
import { toolUrl } from './bluesky.mjs';
import { tagUrl } from './attribution.mjs';
import { allowed, loadAllowlist, loadVersions } from './versions.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
export const MAX_PER_RUN = 10;

/** Homebrew class name for a formula name: `a-b-c` -> `ABC`; null if it cannot start a Ruby constant. */
export function className(slug) {
  if (!/^[a-z][a-z0-9-]*$/.test(slug)) return null;
  return slug.split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
}

export const tarballUrl = (name, version = VERSION) => `https://registry.npmjs.org/${name}/-/${name.split('/').pop()}-${version}.tgz`;

const rubyString = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/#\{/g, '\\#{');

/** Ruby source of one formula, or null when the slug cannot be a formula. */
export function formula({ slug, description, sha256, name = slug, version = VERSION }) {
  const cls = className(slug);
  if (!cls || !/^[0-9a-f]{64}$/.test(sha256)) return null;
  const desc = rubyString(description.replace(/\.$/, '')).slice(0, 80);
  return `class ${cls} < Formula
  desc "${desc}"
  homepage "${tagUrl(toolUrl(slug), 'homebrew')}"
  url "${tarballUrl(name, version)}"
  sha256 "${sha256}"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_predicate bin/"${slug}", :exist?
  end
end
`;
}

export const sha256Of = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** Fetch a tarball; null when the registry does not have it (404). */
async function tarball(fetchImpl, url) {
  const res = await fetchImpl(url);
  if (res.status === 404) return null;
  if (res.status !== 200) throw new Error(`npm registry: HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function run({ env = process.env, fetchImpl = fetch, log = console.log, root = REPO_ROOT, outDir = null, allow, versions } = {}) {
  const live = env.DISTRIBUTE_HOMEBREW === 'true' && !!outDir;
  const scope = env.NPM_SCOPE || '';
  allow ??= await loadAllowlist(root);
  versions ??= await loadVersions(root);
  const slugs = [...allowed(allow, 'npm')].sort();
  const { ok } = await plan({ root, scope, slugs, versions });
  log(`${ok.length} of ${slugs.length} npm-allow-listed CLIs qualify`);
  const todo = [];
  for (const p of ok) {
    if (todo.length >= MAX_PER_RUN) break;
    const slug = p.slug;
    if (!className(slug)) continue;
    const file = outDir ? path.join(outDir, 'Formula', `${slug}.rb`) : null;
    if (file && await fs.stat(file).then(() => true, () => false)) continue;
    const yaml = await fs.readFile(path.join(root, 'ventures', slug, 'VENTURE.yaml'), 'utf8').catch(() => '');
    const description = JSON.parse(p.files['package.json']).description || yaml;
    const buf = await tarball(fetchImpl, tarballUrl(packageName(slug, scope), p.version));
    if (buf === null) continue; // not on npm yet
    todo.push({ slug, description, sha256: sha256Of(buf), name: packageName(slug, scope), version: p.version, file });
  }
  if (!live) {
    log(`DRY RUN (set DISTRIBUTE_HOMEBREW=true and pass --write <tap checkout> to write). Would write up to ${MAX_PER_RUN} new formulas:`);
    for (const t of todo) log(`  Formula/${t.slug}.rb  ${t.sha256.slice(0, 12)}…`);
    return { written: 0, planned: todo.length };
  }
  let written = 0;
  for (const t of todo) {
    const text = formula(t);
    if (!text) continue;
    await fs.mkdir(path.dirname(t.file), { recursive: true });
    await fs.writeFile(t.file, text);
    written += 1;
    log(`wrote Formula/${t.slug}.rb`);
  }
  return { written, planned: todo.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--write');
  run({ outDir: i > -1 ? process.argv[i + 1] : null }).catch((e) => { console.error(e.message); process.exit(1); });
}
