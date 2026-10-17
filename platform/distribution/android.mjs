/**
 * Android packager: turns a published venture page into a Bubblewrap project
 * input for a Trusted Web Activity (a Play Store app that is the PWA, full
 * screen, no browser chrome). Off by default; this builds the inputs only.
 * Creating the Play developer account, the signing key and the upload is the
 * owner's step (one-time fee, identity checks, the Play Developer terms).
 * See portfolio/distribution/README.md.
 *
 *   node platform/distribution/android.mjs                         # dry run: how many tools qualify
 *   node platform/distribution/android.mjs --build <slug> <outDir> # writes <outDir>/<slug>/
 *
 * Writes twa-manifest.json (read by `bubblewrap init --manifest`/`build`),
 * a 512 px icon, assetlinks.template.json (the Digital Asset Links file that
 * proves the app and the site belong together), store-listing.md and BUILD.md.
 * The tool must already be served over https with an MIT LICENSE; the app
 * collects nothing and asks for no Android permissions beyond the network.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMeta, toolUrl, BASE_URL } from './bluesky.mjs';
import { extensionName } from './webext.mjs';
import { renderIcon, THEME_COLOR } from '../pages/offline.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const REPO_URL = 'https://github.com/duncan-haywood/oss-monorepo';
export const VERSION_CODE = 1;
export const VERSION_NAME = '1.0.0';
const BACKGROUND_COLOR = '#eef2f7';

/** Play shows the app name in 30 characters. */
export function appName(title) {
  const n = extensionName(title);
  return n.length <= 30 ? n : `${n.slice(0, 29).trimEnd()}…`;
}

/** Reverse-DNS package id from the host owner and slug: com.github.<owner>.<slug as words>. */
export function packageId(slug, baseUrl = BASE_URL) {
  const owner = new URL(baseUrl).hostname.split('.')[0].replace(/[^a-z0-9]/gi, '').toLowerCase();
  const part = slug.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
    .map((w) => (/^\d/.test(w) ? `n${w}` : w)).join('');
  return `io.github.${owner}.${part}`;
}

/** Play short description is limited to 80 characters; the full one to 4000. */
export function shortDescription(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= 80 ? t : `${t.slice(0, 79).trimEnd()}…`;
}

/** One Android package as { name, packageId, files } or { skip }. */
export async function buildAndroid({ slug, dir, baseUrl = BASE_URL }) {
  const html = await fs.readFile(path.join(dir, 'index.html'), 'utf8').catch(() => null);
  if (html === null) return { skip: 'no index.html' };
  const meta = readMeta(html);
  if (!meta) return { skip: 'no title or description' };
  const license = await fs.readFile(path.join(dir, 'LICENSE'), 'utf8').catch(() => null);
  if (license === null || !/MIT License/i.test(license)) return { skip: 'no MIT LICENSE' };
  if (/(?:src|href)\s*=\s*["'](?:https?:)?\/\//i.test(html.replace(/<a\b[^>]*>/gi, ''))) return { skip: 'loads a file from another origin' };
  const name = appName(meta.title);
  const id = packageId(slug, baseUrl);
  const host = new URL(baseUrl).host;
  const startUrl = `${new URL(baseUrl).pathname}${slug}/`;
  const twa = {
    packageId: id,
    host,
    name,
    launcherName: name.length <= 12 ? name : name.slice(0, 12).trimEnd(),
    display: 'standalone',
    themeColor: THEME_COLOR,
    themeColorDark: THEME_COLOR,
    navigationColor: THEME_COLOR,
    navigationColorDark: THEME_COLOR,
    navigationDividerColor: THEME_COLOR,
    navigationDividerColorDark: THEME_COLOR,
    backgroundColor: BACKGROUND_COLOR,
    enableNotifications: false,
    startUrl,
    iconUrl: `${toolUrl(slug)}icon-512.png`,
    maskableIconUrl: `${toolUrl(slug)}icon-512.png`,
    webManifestUrl: `${baseUrl}manifest.webmanifest`,
    appVersionCode: VERSION_CODE,
    appVersionName: VERSION_NAME,
    signingKey: { path: './android.keystore', alias: 'android' },
    orientation: 'default',
    fallbackType: 'customtabs',
    enableSiteSettingsShortcut: false,
    isChromeOSOnly: false,
    isMetaQuest: false,
    fullScopeUrl: `https://${host}${new URL(baseUrl).pathname}`,
    minSdkVersion: 21,
  };
  const files = {
    'twa-manifest.json': `${JSON.stringify(twa, null, 2)}\n`,
    'icon-512.png': renderIcon({ size: 512 }),
    'assetlinks.template.json': `${JSON.stringify([{
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: id, sha256_cert_fingerprints: ['REPLACE_WITH_SHA256_OF_YOUR_SIGNING_CERT'] },
    }], null, 2)}\n`,
    LICENSE: license,
  };
  files['store-listing.md'] = `# ${name}\n\n**Short description (${shortDescription(meta.description).length}/80):** ${shortDescription(meta.description)}\n\n## Full description\n\n${meta.description}\n\nFree and open source (MIT). It runs on your device: it asks for no permissions beyond the network, has no account, no ads and no tracking, and collects nothing.\n\nAn aid, not legal, tax, financial or professional advice. No warranty.\n\n## Data safety form\n\n- Collects or shares user data: **No**\n- Data encrypted in transit: Yes (https)\n- Account or data deletion: not applicable, there is no account\n\n## Links\n\n- Web version: ${toolUrl(slug)}\n- Source: ${REPO_URL}/tree/main/ventures/${slug}\n- Privacy: nothing is collected, so there is nothing to disclose; point the Play privacy-policy field at ${toolUrl(slug)}\n\n## Category\n\nTools (or Business / Finance, whichever fits the tool). Content rating questionnaire: no violence, no user-generated content, no ads.\n`;
  files['BUILD.md'] = `# Build ${name} for Google Play\n\nThis folder is the input to [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap), Google's open-source Trusted Web Activity builder. Nothing here is signed or uploaded; those steps belong to the account holder.\n\n1. Install JDK 17 and \`npm i -g @bubblewrap/cli\` (it fetches the Android SDK on first run).\n2. Publish \`icon-512.png\` next to the tool page so \`iconUrl\` resolves, or edit \`iconUrl\` in \`twa-manifest.json\` to a hosted copy.\n3. \`bubblewrap build\` in this folder. It creates \`android.keystore\` on first run: **keep it and its password private and backed up; losing it means you cannot update the app.**\n4. Take the SHA-256 fingerprint it prints (\`bubblewrap fingerprint\`) and put it in \`assetlinks.template.json\`.\n5. Serve that file as \`https://${host}/.well-known/assetlinks.json\`. The file must be at the **origin root**. A project page such as \`${BASE_URL}\` is on a subpath, so this needs a user site (\`<owner>.github.io\` repository) or a custom domain; without it the app opens with a browser address bar instead of full screen.\n6. Upload \`app-release-bundle.aab\` in the Play Console, using \`store-listing.md\` for the listing.\n\nPlay requires a developer account (one-time registration fee, identity verification) and, for new personal accounts, a closed test before production. Read the current Play Developer Program Policies, in particular the minimum-functionality and spam rules: publish a few tools people return to, not a hundred near-identical listings.\n\nThe iOS route is node platform/distribution/ios.mjs --build <slug> <outDir>, an Xcode project input that bundles the page for a Mac with a paid developer account (or the page added to the Home Screen).\n`;
  return { name, packageId: id, files };
}

export async function discover(root = REPO_ROOT) {
  const dir = path.join(root, 'ventures');
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory() && await fs.stat(path.join(dir, e.name, 'index.html')).then(() => true, () => false)) out.push(e.name);
  }
  return out.sort();
}

export async function plan({ root = REPO_ROOT, slugs } = {}) {
  const ok = [];
  const skipped = [];
  for (const slug of slugs ?? await discover(root)) {
    const r = await buildAndroid({ slug, dir: path.join(root, 'ventures', slug) });
    if (r.skip) skipped.push({ slug, reason: r.skip }); else ok.push({ slug, name: r.name, packageId: r.packageId });
  }
  return { ok, skipped };
}

export async function writeAndroid(slug, pkg, outDir) {
  const base = path.join(outDir, slug);
  for (const [rel, body] of Object.entries(pkg.files)) {
    await fs.mkdir(path.dirname(path.join(base, rel)), { recursive: true });
    await fs.writeFile(path.join(base, rel), body);
  }
  return base;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === '--build') {
    const [, slug, outDir] = args;
    if (!slug || !outDir) { console.error('usage: android.mjs --build <slug> <outDir>'); process.exit(2); }
    const pkg = await buildAndroid({ slug, dir: path.join(REPO_ROOT, 'ventures', slug) });
    if (pkg.skip) { console.error(`${slug}: skipped (${pkg.skip})`); process.exit(1); }
    console.log(`wrote ${await writeAndroid(slug, pkg, outDir)} (${Object.keys(pkg.files).length} files, ${pkg.packageId})`);
  } else {
    const { ok, skipped } = await plan();
    const ids = new Set(ok.map((o) => o.packageId));
    console.log(`${ok.length} of ${ok.length + skipped.length} ventures qualify as Android (TWA) packages${ids.size === ok.length ? '' : `; WARNING: ${ok.length - ids.size} duplicate package ids`}`);
    const reasons = {};
    for (const s of skipped) reasons[s.reason] = (reasons[s.reason] ?? 0) + 1;
    for (const [r, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`  skipped ${n}: ${r}`);
  }
}
