/**
 * Desktop packager: turns a venture's static page, or a catalogue suite of
 * them, into a Tauri v2 project that builds an offline macOS (.dmg), Windows
 * (.msi, .exe) and Linux (.AppImage, .deb) app. The page and the files it
 * imports ship inside the app; nothing is fetched at run time. Off by default;
 * this writes inputs only. `.github/workflows/distribute-desktop.yml` builds
 * unsigned installers when the owner sets `DISTRIBUTE_DESKTOP=true` and runs
 * it by hand. Code signing, notarisation and store or winget submission are
 * the owner's steps. See portfolio/distribution/README.md.
 *
 *   node platform/distribution/desktop.mjs                                  # dry run: tools and suites that qualify
 *   node platform/distribution/desktop.mjs --suites                         # suite ids and how many tools each bundles
 *   node platform/distribution/desktop.mjs --build <slug|suite> <outDir>    # writes <outDir>/<slug|suite>/
 *   node platform/distribution/desktop.mjs --winget <slug|suite> <installerUrl> <sha256> <outDir>
 *
 * A suite is a catalogue section (`ALL_CATEGORIES` in platform/pages/build.mjs,
 * e.g. `ci` or `learning`): one app with a launcher page that lists its tools.
 * The folder holds the web files under dist/, a Rust shell under src-tauri/
 * (Cargo.toml, main.rs, tauri.conf.json, icons including .ico and .icns),
 * package.json pinning the Tauri CLI, winget manifest templates and BUILD.md.
 * Tauri serves dist/ with a Content-Security-Policy whose connect-src is
 * 'none', the window refuses to navigate anywhere but the bundle (links open
 * in the system browser), and no Tauri capability is granted, so the page can
 * call no native command. A page the browser-extension packager would skip
 * (network calls, remote files, inline handlers) is skipped here.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMeta, toolUrl, BASE_URL } from './bluesky.mjs';
import { tagUrl } from './attribution.mjs';
import { buildExtension, extensionName } from './webext.mjs';
import { packageId, shortDescription } from './android.mjs';
import { renderIcon } from '../pages/offline.mjs';
import * as catalogue from '../pages/build.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const REPO_URL = 'https://github.com/duncan-haywood/oss-monorepo';
export const VERSION = '1.0.0';
/** The Tauri CLI the generated package.json and the workflow run. Crates follow `2` in Cargo.toml. */
export const TAURI_CLI = '2.12.3';

/** Files buildExtension adds that the desktop bundle does not want. */
const EXTENSION_ONLY = new Set(['background.js', 'manifest.json', 'README.md', 'LICENSE']);

export const CSP = "default-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'";

/** A name safe in every installer's file name: ASCII, no `&`, `/` or `:`, at most 40 characters. */
export function productName(title) {
  const n = extensionName(title).replace(/\s*&\s*/g, ' and ').replace(/[^A-Za-z0-9 .,()+'-]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return n.length <= 40 ? n : n.slice(0, 40).replace(/[\s.,(+'-]+\S*$/, '').trim();
}

/** Cargo package (and executable) name: lowercase, dashes, not starting with a digit. */
export function crateName(id) {
  const n = id.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return /^[a-z]/.test(n) ? n : `app-${n}`;
}

/** Catalogue sections as suites: { id: { title, url, slugs? } }. */
export function suites() {
  const out = {};
  for (const c of catalogue.ALL_CATEGORIES) out[c.id] = { title: c.title, url: `${BASE_URL}${catalogue.categoryPagePath(c.id)}`, test: (slug) => catalogue.categoryFor(slug).id === c.id };
  // The research-algorithms list is a catalogue section today; keep it a suite if it ever stops being one.
  if (Array.isArray(catalogue.RESEARCH_ALGORITHM_SLUGS) && !out['research-algorithms']) {
    const set = new Set(catalogue.RESEARCH_ALGORITHM_SLUGS);
    out['research-algorithms'] = { title: 'Research algorithms and ML', url: BASE_URL, test: (slug) => set.has(slug) };
  }
  return out;
}

// --- icons -------------------------------------------------------------------

/** A Windows .ico holding PNG images (Vista and later read PNG entries). */
export function icoFromPngs(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ size, png }, i) => {
    const e = 6 + 16 * i;
    head[e] = size >= 256 ? 0 : size; head[e + 1] = size >= 256 ? 0 : size;
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(png.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.png)]);
}

/** A macOS .icns holding PNG images (ic07 128, ic08 256, ic09 512, ic10 1024). */
export function icnsFromPngs(pngs) {
  const TYPES = { 128: 'ic07', 256: 'ic08', 512: 'ic09', 1024: 'ic10' };
  const parts = pngs.map(({ size, png }) => {
    const h = Buffer.alloc(8);
    h.write(TYPES[size], 0, 'ascii'); h.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([h, png]);
  });
  const body = Buffer.concat(parts);
  const h = Buffer.alloc(8);
  h.write('icns', 0, 'ascii'); h.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([h, body]);
}

function iconFiles() {
  const png = (size) => renderIcon({ size });
  return {
    'src-tauri/icons/32x32.png': png(32),
    'src-tauri/icons/128x128.png': png(128),
    'src-tauri/icons/128x128@2x.png': png(256),
    'src-tauri/icons/icon.png': png(512),
    'src-tauri/icons/icon.ico': icoFromPngs([16, 32, 48, 256].map((size) => ({ size, png: png(size) }))),
    'src-tauri/icons/icon.icns': icnsFromPngs([128, 256, 512, 1024].map((size) => ({ size, png: png(size) }))),
  };
}

// --- the Rust shell ------------------------------------------------------------

/**
 * main.rs for one app. `start` is the first page (a path under dist/), `pages`
 * the bundled pages as site paths ending in "/", and `site` where the same
 * paths are served on the web: an in-app link to a page that is not bundled
 * opens there, in the system browser, instead of a blank window.
 */
export function mainRs({ title, start = 'index.html', pages = ['/'], site = BASE_URL }) {
  return `// Generated by platform/distribution/desktop.mjs. Opens the bundled pages in
// one window; nothing else is loaded.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::webview::DownloadEvent;
use tauri::{Manager, Url, WebviewUrl, WebviewWindowBuilder};

/// Pages inside the bundle, as paths ending in "/". dist/ mirrors the site's layout.
const PAGES: &[&str] = &[${pages.map((p) => JSON.stringify(p)).join(', ')}];
/// Where the same paths are served on the web.
const SITE: &str = ${JSON.stringify(site)};

/// The path of a URL Tauri serves from the bundle: tauri://localhost (macOS,
/// Linux) or http://tauri.localhost (Windows). None for anything else.
fn bundle_path(url: &Url) -> Option<&str> {
    let local = match url.scheme() {
        "tauri" => url.host_str() == Some("localhost"),
        "http" | "https" => url.host_str() == Some("tauri.localhost"),
        _ => false,
    };
    local.then(|| url.path())
}

fn is_bundled_page(path: &str) -> bool {
    let dir = path.strip_suffix("index.html").unwrap_or(path);
    let dir = if dir.ends_with('/') { dir.to_string() } else { format!("{dir}/") };
    PAGES.contains(&dir.as_str())
}

/// The web address of a bundle path, tagged so the site can count arrivals from the app.
fn on_site(url: &Url, path: &str) -> Option<Url> {
    let mut web = Url::parse(SITE).ok()?.join(path.trim_start_matches('/')).ok()?;
    if let Some(q) = url.query() {
        web.set_query(Some(q));
    }
    web.query_pairs_mut().append_pair("ref", "desktop");
    web.set_fragment(url.fragment());
    Some(web)
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let downloads = app.handle().clone();
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App(${JSON.stringify(start)}.into()))
                .title(${JSON.stringify(title)})
                .inner_size(1100.0, 820.0)
                .min_inner_size(360.0, 480.0)
                // Bundled pages load here; everything else opens in the system browser.
                .on_navigation(|url| {
                    if matches!(url.scheme(), "about" | "blob" | "data") {
                        return true;
                    }
                    if let Some(path) = bundle_path(url) {
                        if is_bundled_page(path) {
                            return true;
                        }
                        if let Some(web) = on_site(url, path) {
                            let _ = open::that_detached(web.as_str());
                        }
                        return false;
                    }
                    if matches!(url.scheme(), "http" | "https" | "mailto") {
                        let _ = open::that_detached(url.as_str());
                    }
                    false
                })
                // CSV and other exports go to the Downloads folder.
                .on_download(move |_webview, event| {
                    if let DownloadEvent::Requested { destination, .. } = event {
                        let name = destination
                            .file_name()
                            .map(|n| n.to_owned())
                            .unwrap_or_else(|| "export".into());
                        if let Ok(dir) = downloads.path().download_dir() {
                            *destination = dir.join(name);
                        }
                    }
                    true
                })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the app");
}
`;
}

const BUILD_RS = 'fn main() {\n    tauri_build::build()\n}\n';

function cargoToml(crate, description) {
  return `[package]
name = ${JSON.stringify(crate)}
version = ${JSON.stringify(VERSION)}
description = ${JSON.stringify(description)}
license = "MIT"
repository = ${JSON.stringify(REPO_URL)}
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
open = "5"

[profile.release]
codegen-units = 1
lto = true
opt-level = "s"
panic = "abort"
strip = true
`;
}

// --- one project -------------------------------------------------------------

function webFiles(ext, prefix = '') {
  const files = {};
  for (const [rel, body] of Object.entries(ext.files)) {
    if (EXTENSION_ONLY.has(rel) || rel.startsWith('icons/')) continue;
    files[`dist/${prefix}${rel}`] = body;
  }
  return files;
}

/** A suite's tool page gets one link back to the launcher, styled inline (style-src allows it). */
export function withHomeLink(html) {
  const link = '<a href="../index.html" style="position:fixed;bottom:12px;right:12px;z-index:2147483647;padding:6px 10px;border-radius:6px;background:#243d35;color:#fff;font:14px/1.2 system-ui,sans-serif;text-decoration:none">All tools</a>';
  return /<body\b[^>]*>/i.test(html) ? html.replace(/<body\b[^>]*>/i, (m) => `${m}${link}`) : `${link}${html}`;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The root page of a one-tool app: Tauri falls back to it, and it points at the tool (no script needed). */
export function redirectHtml(title, href) {
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta http-equiv="refresh" content="0; url=${esc(href)}">\n<title>${esc(title)}</title>\n</head>\n<body><a href="${esc(href)}">${esc(title)}</a></body>\n</html>\n`;
}

export function launcherHtml(title, tools) {
  const items = tools.map((t) => `<li><a href="./${t.slug}/index.html"><strong>${esc(t.name)}</strong></a><br><span>${esc(t.description)}</span></li>`).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
body{font:16px/1.5 system-ui,sans-serif;margin:0 auto;max-width:860px;padding:24px 16px;color:#1d2a26;background:#fbfaf7}
h1{font-size:1.6rem;margin:0 0 4px}ul{list-style:none;padding:0}li{padding:10px 0;border-bottom:1px solid #e3e0d8}
a{color:#12594a}span{color:#4a5752;font-size:.93rem}footer{margin-top:24px;font-size:.85rem;color:#4a5752}
@media (prefers-color-scheme:dark){body{background:#151c1a;color:#e8ece9}a{color:#8fd4bd}span,footer{color:#aab6b1}li{border-color:#2c3633}}
</style>
</head>
<body>
<h1>${esc(title)}</h1>
<p>${tools.length} free, open-source (MIT) tools. They run on this computer, offline; nothing you type is sent anywhere.</p>
<ul>
${items}
</ul>
<footer>An aid, not legal, tax, financial or professional advice. No warranty.</footer>
</body>
</html>
`;
}

/**
 * One desktop project as { name, identifier, crate, tools, files } or { skip }.
 * `target` is a venture slug or a suite id; `slugs` limits which ventures a suite scans.
 */
export async function buildDesktop({ target, root = REPO_ROOT, slugs, baseUrl = BASE_URL }) {
  const suite = suites()[target];
  let files;
  let name;
  let description;
  let homepage;
  let tools;
  let license;
  if (suite) {
    tools = [];
    files = {};
    for (const slug of (slugs ?? await discover(root)).filter(suite.test)) {
      const ext = await buildExtension({ slug, dir: path.join(root, 'ventures', slug) });
      if (ext.skip) continue;
      license ??= ext.files.LICENSE;
      const web = webFiles(ext, `${slug}/`);
      web[`dist/${slug}/index.html`] = withHomeLink(web[`dist/${slug}/index.html`]);
      Object.assign(files, web);
      tools.push({ slug, name: ext.name, description: readMeta(ext.files['index.html'])?.description ?? '' });
    }
    if (!tools.length) return { skip: `suite ${target} has no tool the packager accepts` };
    name = productName(/tools?$/i.test(suite.title) ? suite.title : `${suite.title} tools`);
    files['dist/index.html'] = launcherHtml(name, tools);
    description = `${tools.length} free offline tools: ${tools.slice(0, 6).map((t) => t.name).join(', ')}${tools.length > 6 ? ', and more' : ''}.`;
    homepage = suite.url;
  } else {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(target)) return { skip: `not a venture slug or suite id: ${target}` };
    const ext = await buildExtension({ slug: target, dir: path.join(root, 'ventures', target) });
    if (ext.skip) return { skip: ext.skip };
    const meta = readMeta(ext.files['index.html']);
    name = productName(meta.title);
    description = meta.description;
    homepage = toolUrl(target);
    files = webFiles(ext, `${target}/`);
    files['dist/index.html'] = redirectHtml(name, `./${target}/index.html`);
    license = ext.files.LICENSE;
    tools = [{ slug: target, name, description }];
  }
  const identifier = packageId(suite ? `suite-${target}` : target, baseUrl);
  const crate = crateName(suite ? `${target}-tools` : target);
  files.LICENSE = license;
  Object.assign(files, iconFiles());
  const pages = ['/', ...Object.keys(files).filter((f) => /^dist\/.+\/index\.html$/.test(f)).map((f) => f.slice(4, -'index.html'.length))].sort();
  files['src-tauri/src/main.rs'] = mainRs({ title: name, start: suite ? 'index.html' : `${target}/index.html`, pages, site: baseUrl });
  files['src-tauri/build.rs'] = BUILD_RS;
  files['src-tauri/Cargo.toml'] = cargoToml(crate, shortDescription(description));
  files['src-tauri/tauri.conf.json'] = `${JSON.stringify({
    $schema: 'https://schema.tauri.app/config/2',
    productName: name,
    mainBinaryName: crate,
    version: VERSION,
    identifier,
    build: { frontendDist: '../dist' },
    app: {
      withGlobalTauri: false,
      // The window is made in main.rs so it can refuse navigation away from the bundle.
      windows: [],
      security: { csp: CSP, freezePrototype: true },
    },
    bundle: {
      active: true,
      targets: 'all',
      category: 'Productivity',
      shortDescription: shortDescription(description),
      longDescription: `${description}\n\nFree and open source (MIT). Runs offline with no account, no ads and no tracking; nothing you type leaves this computer. An aid, not legal, tax, financial or professional advice.`,
      publisher: new URL(baseUrl).hostname.split('.')[0],
      homepage: tagUrl(homepage, 'desktop'),
      license: 'MIT',
      licenseFile: '../LICENSE',
      copyright: 'MIT License',
      icon: ['icons/32x32.png', 'icons/128x128.png', 'icons/128x128@2x.png', 'icons/icon.icns', 'icons/icon.ico'],
      // Ad-hoc signature: Apple Silicon will not launch an unsigned bundle at all. Not a Developer ID.
      macOS: { minimumSystemVersion: '10.15', signingIdentity: '-' },
      linux: { deb: { section: 'utils' } },
    },
  }, null, 2)}\n`;
  files['package.json'] = `${JSON.stringify({
    name: crate,
    version: VERSION,
    private: true,
    license: 'MIT',
    scripts: { tauri: 'tauri', build: 'tauri build' },
    devDependencies: { '@tauri-apps/cli': TAURI_CLI },
  }, null, 2)}\n`;
  for (const [rel, body] of Object.entries(wingetManifests({ name, description, homepage }))) files[`winget/${rel}`] = body;
  files['BUILD.md'] = buildMd({ name, identifier, crate, target, tools, homepage });
  return { name, identifier, crate, tools: tools.map((t) => t.slug), files };
}

// --- winget ---------------------------------------------------------------------

export const WINGET_SCHEMA = '1.6.0';
export const INSTALLER_URL_PLACEHOLDER = 'https://example.invalid/REPLACE-WITH-RELEASE-MSI-URL.msi';
export const SHA256_PLACEHOLDER = '0'.repeat(64);

/** PascalCase, at most 32 characters: one winget identifier segment. */
export function wingetSegment(s) {
  const p = s.split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  return p.slice(0, 32);
}

/** The three files of a winget-pkgs submission (version, installer, defaultLocale). */
export function wingetManifests({ name, description, homepage, version = VERSION, installerUrl = INSTALLER_URL_PLACEHOLDER, sha256 = SHA256_PLACEHOLDER }) {
  const owner = new URL(BASE_URL).hostname.split('.')[0];
  const pkgId = `${wingetSegment(owner)}.${wingetSegment(name)}`;
  const y = (v) => JSON.stringify(v); // JSON strings are valid YAML scalars
  const head = (type) => `# yaml-language-server: $schema=https://aka.ms/winget-manifest.${type}.${WINGET_SCHEMA}.schema.json\nPackageIdentifier: ${pkgId}\nPackageVersion: ${version}\n`;
  const tail = (type) => `ManifestType: ${type}\nManifestVersion: ${WINGET_SCHEMA}\n`;
  return {
    [`${pkgId}.yaml`]: `${head('version')}DefaultLocale: en-US\n${tail('version')}`,
    [`${pkgId}.installer.yaml`]: `${head('installer')}InstallerType: wix\nInstallers:\n  - Architecture: x64\n    InstallerUrl: ${y(installerUrl)}\n    InstallerSha256: ${sha256.toUpperCase()}\n${tail('installer')}`,
    [`${pkgId}.locale.en-US.yaml`]: `${head('defaultLocale')}PackageLocale: en-US\nPublisher: ${y(owner)}\nPublisherUrl: ${y(BASE_URL)}\nPackageName: ${y(name)}\nPackageUrl: ${y(tagUrl(homepage, 'desktop'))}\nLicense: MIT\nLicenseUrl: ${y(`${REPO_URL}/blob/main/LICENSE`)}\nShortDescription: ${y(shortDescription(description))}\nTags:\n  - offline\n  - open-source\n${tail('defaultLocale')}`,
  };
}

function buildMd({ name, identifier, crate, target, tools, homepage }) {
  return `# Build ${name} for macOS, Windows and Linux

This folder is a [Tauri v2](https://v2.tauri.app/) project (MIT/Apache-2.0). \`dist/\` holds ${tools.length === 1 ? 'the tool\'s page and the files it imports' : `a launcher and ${tools.length} tools`}; \`src-tauri/\` is a small Rust shell that shows it in the system web view (WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux). Measured on Linux for one tool: a 3.6 MB executable, a 1.4 MB .deb, and an 80 MB .AppImage (the AppImage carries its own WebKitGTK).

**Offline by construction.** Tauri serves \`dist/\` with a Content-Security-Policy whose \`connect-src\` is \`'none'\`, the window refuses to navigate anywhere but the bundle (links open in your browser), and no Tauri capability is granted, so the page can call no native command. Exports are saved to Downloads.

Generated by \`node platform/distribution/desktop.mjs --build ${target} <dir>\`. Web version: ${tagUrl(homepage, 'desktop')}

## Build it yourself (unsigned)

1. Install [Rust](https://rustup.rs) (stable) and Node.js 18 or later.
2. Platform prerequisites ([Tauri's list](https://v2.tauri.app/start/prerequisites/)):
   - macOS: Xcode Command Line Tools (\`xcode-select --install\`).
   - Windows: Microsoft C++ Build Tools; WebView2 ships with Windows 10 and 11.
   - Linux (Debian/Ubuntu): \`sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev file\`.
3. \`npm install\` here, then \`npx tauri build\` (or \`npx tauri build --bundles dmg\`, \`msi,nsis\`, \`appimage,deb\`).
4. Installers land in \`src-tauri/target/release/bundle/\`. \`npx tauri dev\` opens a window without packaging.

To redraw the icons from one 1024 px PNG: \`npx tauri icon path/to/icon.png\`.

## Or let the workflow build all three

\`.github/workflows/distribute-desktop.yml\` is \`workflow_dispatch\` only and does nothing unless the repository variable \`DISTRIBUTE_DESKTOP\` is \`true\`. Run it with \`${target}\` as the target: it builds on macOS, Windows and Ubuntu runners and attaches the unsigned installers and filled-in winget manifests to a pre-release.

## Signing and notarisation (owner steps)

Nothing here is signed with a publisher identity. Unsigned builds work, but each OS warns the first time:

- **macOS** shows "cannot be opened because the developer cannot be verified" (the bundle carries only an ad-hoc signature). Right-click > Open once, or \`xattr -dr com.apple.quarantine "/Applications/${name}.app"\`. To remove the warning: join the Apple Developer Program, create a *Developer ID Application* certificate, and notarise. Tauri reads \`APPLE_CERTIFICATE\` (base64 .p12), \`APPLE_CERTIFICATE_PASSWORD\`, \`APPLE_SIGNING_IDENTITY\` and either \`APPLE_ID\` + \`APPLE_PASSWORD\` (app-specific) + \`APPLE_TEAM_ID\` or an App Store Connect API key (\`APPLE_API_ISSUER\`, \`APPLE_API_KEY\`, \`APPLE_API_KEY_PATH\`) during \`tauri build\`, then notarises and staples. Set \`bundle.macOS.signingIdentity\` to the identity instead of \`-\`. [Tauri: macOS signing](https://v2.tauri.app/distribute/sign/macos/).
- **Windows** SmartScreen says "Windows protected your PC" until the installer is signed and has built reputation. Options: an OV/EV code-signing certificate (\`bundle.windows.certificateThumbprint\`, \`digestAlgorithm: "sha256"\`, \`timestampUrl\`) or Azure Trusted Signing through \`bundle.windows.signCommand\`. [Tauri: Windows signing](https://v2.tauri.app/distribute/sign/windows/).
- **Linux** needs no signature to run. An AppImage can carry a GPG signature (\`SIGN=1\`, \`SIGN_KEY\`); a .deb is normally signed by the apt repository that serves it.

The workflow does not read any of these secrets today. Wiring them in is a follow-up for the owner: add the secrets, then pass them as \`env:\` to the \`tauri build\` step.

## Follow-ups

- **winget** (Windows Package Manager): \`winget/\` holds the three manifest files for package identifier \`${Object.keys(wingetManifests({ name, description: '', homepage })).find((f) => !/\.(installer|locale)/.test(f)).replace(/\.yaml$/, '')}\`, with a placeholder installer URL and SHA-256. The workflow fills both in from the release's .msi and attaches the result. Submitting is a pull request to [microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs) under the owner's account (\`wingetcreate submit\` or by hand), and validation runs the installer, so sign it first or expect a SmartScreen note. Read winget-pkgs' contribution policy on the day.
- **Flatpak (Flathub)**: Flathub builds from source, so it needs a \`flatpak-builder\` manifest on the GNOME runtime with the Rust SDK extension, Cargo sources vendored offline (\`flatpak-cargo-generator.py\` on \`Cargo.lock\`), AppStream metainfo and a desktop file, and \`--share=network\` left out of \`finish-args\`. Submission is a pull request to flathub/flathub and a reviewer's sign-off. [Tauri: Flatpak](https://v2.tauri.app/distribute/flatpak/).
- **Snap (Snap Store)**: a \`snapcraft.yaml\` with the \`gnome\` extension and \`strict\` confinement, built with \`snapcraft\` and uploaded under a Snap Store account; leave out the \`network\` plug. [Tauri: Snapcraft](https://v2.tauri.app/distribute/snapcraft/).
- The Mac App Store and Microsoft Store each need their own account and review; this offline app is the defensible kind, but list a few tools people return to weekly, not the whole catalogue.

Identifier: \`${identifier}\`. Executable: \`${crate}\`. Source: ${REPO_URL}/tree/main/platform/distribution/desktop.mjs

Free and open source (MIT). No warranty; an aid, not legal, tax, financial or professional advice.
`;
}

// --- catalogue -----------------------------------------------------------------

export async function discover(root = REPO_ROOT) {
  const dir = path.join(root, 'ventures');
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory() && await fs.stat(path.join(dir, e.name, 'index.html')).then(() => true, () => false)) out.push(e.name);
  }
  return out.sort();
}

/** Which ventures qualify, and how many qualifying tools each suite would bundle. */
export async function plan({ root = REPO_ROOT, slugs } = {}) {
  const ok = [];
  const skipped = [];
  for (const slug of slugs ?? await discover(root)) {
    const r = await buildExtension({ slug, dir: path.join(root, 'ventures', slug) });
    if (r.skip) skipped.push({ slug, reason: r.skip }); else ok.push({ slug, identifier: packageId(slug) });
  }
  const bySuite = {};
  for (const [id, s] of Object.entries(suites())) bySuite[id] = ok.filter((o) => s.test(o.slug)).length;
  return { ok, skipped, suites: bySuite };
}

export async function writeDesktop(target, pkg, outDir) {
  const base = path.join(outDir, target);
  for (const [rel, body] of Object.entries(pkg.files)) {
    await fs.mkdir(path.dirname(path.join(base, rel)), { recursive: true });
    await fs.writeFile(path.join(base, rel), body);
  }
  return base;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === '--build') {
    const [, target, outDir] = args;
    if (!target || !outDir) { console.error('usage: desktop.mjs --build <slug|suite> <outDir>'); process.exit(2); }
    const pkg = await buildDesktop({ target });
    if (pkg.skip) { console.error(`${target}: skipped (${pkg.skip})`); process.exit(1); }
    console.log(`wrote ${await writeDesktop(target, pkg, outDir)} (${pkg.tools.length} tool(s), ${Object.keys(pkg.files).length} files, ${pkg.identifier})`);
  } else if (args[0] === '--winget') {
    const [, target, installerUrl, sha256, outDir] = args;
    if (!target || !/^https:\/\//.test(installerUrl ?? '') || !/^[0-9a-f]{64}$/i.test(sha256 ?? '') || !outDir) {
      console.error('usage: desktop.mjs --winget <slug|suite> <https installer url> <sha256> <outDir>'); process.exit(2);
    }
    const pkg = await buildDesktop({ target });
    if (pkg.skip) { console.error(`${target}: skipped (${pkg.skip})`); process.exit(1); }
    const conf = JSON.parse(pkg.files['src-tauri/tauri.conf.json']);
    const homepage = new URL(conf.bundle.homepage); homepage.searchParams.delete('ref');
    const files = wingetManifests({ name: pkg.name, description: conf.bundle.shortDescription, homepage: homepage.href, installerUrl, sha256 });
    await fs.mkdir(outDir, { recursive: true });
    for (const [rel, body] of Object.entries(files)) await fs.writeFile(path.join(outDir, rel), body);
    console.log(`wrote ${Object.keys(files).length} winget manifests to ${outDir}`);
  } else if (args[0] === '--suites') {
    const { suites: bySuite } = await plan();
    for (const [id, n] of Object.entries(bySuite)) console.log(`${id}\t${n} tools`);
  } else {
    const { ok, skipped, suites: bySuite } = await plan();
    const ids = new Set(ok.map((o) => o.identifier));
    console.log(`${ok.length} of ${ok.length + skipped.length} ventures qualify as offline desktop (Tauri) apps${ids.size === ok.length ? '' : `; WARNING: ${ok.length - ids.size} duplicate identifiers`}`);
    console.log(`${Object.keys(bySuite).length} suites: ${Object.entries(bySuite).map(([id, n]) => `${id} (${n})`).join(', ')}`);
    const reasons = {};
    for (const s of skipped) { const k = s.reason.replace(/"[^"]*"|\S+\.m?js/g, '…'); reasons[k] = (reasons[k] ?? 0) + 1; }
    for (const [r, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`  skipped ${n}: ${r}`);
  }
}
