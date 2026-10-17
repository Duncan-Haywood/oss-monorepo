/**
 * iOS packager: turns a venture's static page into an Xcode project input for
 * a native iPhone/iPad app that bundles the page and runs it offline in a
 * WKWebView (the iOS counterpart of android.mjs, which wraps the hosted page;
 * Apple has no Trusted Web Activity, so the page ships inside the app). Off by
 * default; this writes inputs only. The Apple Developer Program account
 * (annual fee, identity checks), signing, TestFlight and App Review are the
 * owner's steps. See portfolio/distribution/README.md.
 *
 *   node platform/distribution/ios.mjs                         # dry run: how many tools qualify
 *   node platform/distribution/ios.mjs --build <slug> <outDir> # writes <outDir>/<slug>/
 *
 * The folder holds an XcodeGen spec (project.yml, so the Xcode project is
 * generated rather than hand-written), Swift sources, the page and the files
 * it imports under Web/, an opaque 1024 px icon, a privacy manifest that
 * declares no tracking and no collected data, an App Store listing and
 * BUILD.md. Pages are served to the web view from a custom app:// scheme with a
 * Content-Security-Policy that forbids network access, so "collects nothing" is
 * enforced, not just promised. A page that the browser-extension packager
 * would skip (network calls, remote files, inline handlers) is skipped here.
 *
 * Nothing here was compiled: the build session has no Xcode. BUILD.md says so
 * and tells the owner to run it in the Simulator before submitting.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toolUrl, BASE_URL } from './bluesky.mjs';
import { buildExtension, extensionName } from './webext.mjs';
import { packageId, shortDescription } from './android.mjs';
import { renderIcon } from '../pages/offline.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const REPO_URL = 'https://github.com/duncan-haywood/oss-monorepo';
export const MARKETING_VERSION = '1.0.0';
export const BUILD_NUMBER = 1;
export const DEPLOYMENT_TARGET = '15.0';

/** Files buildExtension adds that the iOS bundle does not want. */
const EXTENSION_ONLY = new Set(['background.js', 'manifest.json', 'README.md', 'LICENSE']);

/** The home-screen label iOS truncates at about 12 characters; the store name takes 30. */
export function storeName(title) {
  const n = extensionName(title);
  return n.length <= 30 ? n : `${n.slice(0, 29).trimEnd()}…`;
}

export const CSP = "default-src app: data: blob:; style-src app: 'unsafe-inline'; img-src app: data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'";

export const APP_SWIFT = `import SwiftUI
import WebKit

@main
struct ToolApp: App {
    var body: some Scene {
        WindowGroup {
            ToolWebView().ignoresSafeArea()
        }
    }
}

/// Serves the bundled Web/ folder as app://local/. A custom scheme keeps ES
/// modules working (file:// would not) and lets every response carry a
/// Content-Security-Policy that forbids network access.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "app"
    private static let csp = "${CSP}"
    private static let types: [String: String] = [
        "html": "text/html; charset=utf-8", "js": "text/javascript; charset=utf-8",
        "mjs": "text/javascript; charset=utf-8", "css": "text/css; charset=utf-8",
        "json": "application/json; charset=utf-8", "svg": "image/svg+xml",
        "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif",
        "ico": "image/x-icon", "txt": "text/plain; charset=utf-8", "csv": "text/csv; charset=utf-8",
        "webmanifest": "application/manifest+json", "woff2": "font/woff2",
    ]

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url, let root = Bundle.main.resourceURL?.appendingPathComponent("Web", isDirectory: true) else {
            urlSchemeTask.didFailWithError(URLError(.badURL))
            return
        }
        var rel = url.path
        if rel.isEmpty || rel.hasSuffix("/") { rel += "index.html" }
        while rel.hasPrefix("/") { rel.removeFirst() }
        let file = root.appendingPathComponent(rel).standardizedFileURL
        guard file.path.hasPrefix(root.standardizedFileURL.path + "/"), let data = try? Data(contentsOf: file) else {
            let missing = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "text/plain"])!
            urlSchemeTask.didReceive(missing)
            urlSchemeTask.didReceive(Data("Not found".utf8))
            urlSchemeTask.didFinish()
            return
        }
        let type = Self.types[file.pathExtension.lowercased()] ?? "application/octet-stream"
        let headers = [
            "Content-Type": type,
            "Content-Length": String(data.count),
            "Cache-Control": "no-store",
            "Content-Security-Policy": Self.csp,
        ]
        urlSchemeTask.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}

struct ToolWebView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: BundleSchemeHandler.scheme)
        let web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = context.coordinator
        web.uiDelegate = context.coordinator
        web.load(URLRequest(url: URL(string: "app://local/index.html")!))
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    private var destinations: [ObjectIdentifier: URL] = [:]

    private func topController() -> UIViewController? {
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        var top = scene?.windows.first(where: { $0.isKeyWindow })?.rootViewController
        while let next = top?.presentedViewController { top = next }
        return top
    }

    // Links that leave the app open in Safari; nothing else is loaded.
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if navigationAction.shouldPerformDownload {
            decisionHandler(.download)
            return
        }
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        switch url.scheme {
        case "app", "about", "blob", "data":
            decisionHandler(.allow)
        case "http", "https", "mailto", "tel":
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
        default:
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(navigationResponse.canShowMIMEType ? .allow : .download)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    // target="_blank" links open in Safari.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, url.scheme == "http" || url.scheme == "https" {
            UIApplication.shared.open(url)
        }
        return nil
    }

    // CSV and other exports: save to a temporary file, then offer the share sheet.
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let name = (suggestedFilename as NSString).lastPathComponent
        let dest = dir.appendingPathComponent(name.isEmpty ? "export" : name)
        destinations[ObjectIdentifier(download)] = dest
        completionHandler(dest)
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let file = destinations.removeValue(forKey: ObjectIdentifier(download)), let top = topController() else { return }
        let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        sheet.popoverPresentationController?.sourceView = top.view
        sheet.popoverPresentationController?.sourceRect = CGRect(x: top.view.bounds.midX, y: top.view.bounds.midY, width: 0, height: 0)
        top.present(sheet, animated: true)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        destinations.removeValue(forKey: ObjectIdentifier(download))
    }

    // alert() and confirm() would otherwise be silently dropped.
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        guard let top = topController() else { completionHandler(); return }
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        top.present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        guard let top = topController() else { completionHandler(false); return }
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        top.present(alert, animated: true)
    }
}
`;

export const PRIVACY_MANIFEST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>NSPrivacyTracking</key>
	<false/>
	<key>NSPrivacyTrackingDomains</key>
	<array/>
	<key>NSPrivacyCollectedDataTypes</key>
	<array/>
	<key>NSPrivacyAccessedAPITypes</key>
	<array/>
</dict>
</plist>
`;

const ICON_CONTENTS = `${JSON.stringify({
  images: [{ filename: 'icon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }],
  info: { author: 'xcode', version: 1 },
}, null, 2)}\n`;

/** One iOS project as { name, bundleId, files } or { skip }. */
export async function buildIos({ slug, dir, baseUrl = BASE_URL }) {
  const ext = await buildExtension({ slug, dir });
  if (ext.skip) return { skip: ext.skip };
  const html = await fs.readFile(path.join(dir, 'index.html'), 'utf8');
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? slug;
  const description = /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i.exec(html)?.[1] ?? '';
  const name = storeName(title);
  const bundleId = packageId(slug, baseUrl);
  const files = {};
  for (const [rel, body] of Object.entries(ext.files)) {
    if (EXTENSION_ONLY.has(rel) || rel.startsWith('icons/')) continue;
    files[`Web/${rel}`] = body;
  }
  files.LICENSE = ext.files.LICENSE;
  files['Sources/App.swift'] = APP_SWIFT;
  files['PrivacyInfo.xcprivacy'] = PRIVACY_MANIFEST;
  files['Assets.xcassets/Contents.json'] = `${JSON.stringify({ info: { author: 'xcode', version: 1 } }, null, 2)}\n`;
  files['Assets.xcassets/AppIcon.appiconset/Contents.json'] = ICON_CONTENTS;
  files['Assets.xcassets/AppIcon.appiconset/icon-1024.png'] = renderIcon({ size: 1024, opaque: true });
  // JSON is valid YAML, so JSON.stringify quotes every value safely.
  files['project.yml'] = `${JSON.stringify({
    name: 'ToolApp',
    options: { bundleIdPrefix: bundleId.split('.').slice(0, -1).join('.'), deploymentTarget: { iOS: DEPLOYMENT_TARGET } },
    targets: {
      ToolApp: {
        type: 'application',
        platform: 'iOS',
        sources: [
          { path: 'Sources' },
          { path: 'Web', type: 'folder' },
          { path: 'Assets.xcassets' },
          { path: 'PrivacyInfo.xcprivacy' },
        ],
        info: {
          path: 'Info.plist',
          properties: {
            CFBundleDisplayName: name.length <= 14 ? name : name.slice(0, 13).trimEnd(),
            UILaunchScreen: {},
            UISupportedInterfaceOrientations: ['UIInterfaceOrientationPortrait', 'UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight'],
            'UISupportedInterfaceOrientations~ipad': ['UIInterfaceOrientationPortrait', 'UIInterfaceOrientationPortraitUpsideDown', 'UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight'],
            ITSAppUsesNonExemptEncryption: false,
          },
        },
        settings: {
          base: {
            PRODUCT_NAME: name,
            PRODUCT_BUNDLE_IDENTIFIER: bundleId,
            MARKETING_VERSION: MARKETING_VERSION,
            CURRENT_PROJECT_VERSION: String(BUILD_NUMBER),
            ASSETCATALOG_COMPILER_APPICON_NAME: 'AppIcon',
            SWIFT_VERSION: '5.0',
            TARGETED_DEVICE_FAMILY: '1,2',
            GENERATE_INFOPLIST_FILE: 'NO',
          },
        },
      },
    },
  }, null, 2)}\n`;
  const short = shortDescription(description).slice(0, 30);
  files['store-listing.md'] = `# ${name}\n\n**Name (${name.length}/30):** ${name}\n\n**Subtitle (30 max):** ${short || name}\n\n## Description\n\n${description}\n\nFree and open source (MIT). It runs on your device with no account, no ads and no tracking. Your entries stay on the device and are never sent anywhere, and the app is built so it cannot reach the network.\n\nAn aid, not legal, tax, financial or professional advice. No warranty.\n\n## App Privacy (App Store Connect)\n\n- Data collection: **Data Not Collected**\n- Tracking: **No**\n- Privacy policy URL: ${toolUrl(slug)} (nothing is collected, so there is nothing to disclose)\n- Export compliance: uses no encryption beyond the OS (\`ITSAppUsesNonExemptEncryption\` is false)\n- Age rating: 4+ (no objectionable content, no user-generated content)\n\n## Links\n\n- Web version / support URL: ${toolUrl(slug)}\n- Source: ${REPO_URL}/tree/main/ventures/${slug}\n\n## Category\n\nBusiness, Finance or Productivity, whichever fits the tool.\n`;
  files['BUILD.md'] = `# Build ${name} for the App Store\n\nThis folder is the input to [XcodeGen](https://github.com/yonaskolb/XcodeGen). It bundles the tool's page and the files it imports under \`Web/\` and shows them in a WKWebView over an \`app://\` scheme whose Content-Security-Policy forbids network access. Nothing here is signed or uploaded.\n\n**Not compiled in the session that generated it** (no Xcode there). Run it in the Simulator and confirm the tool works, a CSV export opens the share sheet and no link loads inside the app, before you submit. If the page is blank, open Safari's Develop menu > Simulator > the app and read the console: a Content-Security-Policy violation names the blocked file.\n\n1. Install Xcode 15 or later and \`brew install xcodegen\` on a Mac.\n2. \`xcodegen generate\` in this folder, then \`open ToolApp.xcodeproj\`.\n3. Target ToolApp > Signing & Capabilities: choose your Team. If \`${bundleId}\` is taken, change the bundle id (here and in \`project.yml\`).\n4. Run on an iPhone Simulator. Then Product > Archive > Distribute App > App Store Connect.\n5. In App Store Connect create the app and paste \`store-listing.md\`: the App Privacy answers are Data Not Collected and no tracking. Add screenshots (6.7-inch iPhone at least).\n6. Submit to TestFlight first, then App Review.\n\nYou need an Apple Developer Program membership (annual fee, identity verification). Read App Review Guideline 4.2 (minimum functionality): Apple rejects apps that are only a repackaged website. This one is a standalone offline tool, which is the defensible case, but publish a few tools people return to weekly, not a hundred near-identical listings. Read the current guidelines on the day; this file did not.\n`;
  return { name, bundleId, files };
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
    const r = await buildIos({ slug, dir: path.join(root, 'ventures', slug) });
    if (r.skip) skipped.push({ slug, reason: r.skip }); else ok.push({ slug, name: r.name, bundleId: r.bundleId });
  }
  return { ok, skipped };
}

export async function writeIos(slug, pkg, outDir) {
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
    if (!slug || !outDir) { console.error('usage: ios.mjs --build <slug> <outDir>'); process.exit(2); }
    const pkg = await buildIos({ slug, dir: path.join(REPO_ROOT, 'ventures', slug) });
    if (pkg.skip) { console.error(`${slug}: skipped (${pkg.skip})`); process.exit(1); }
    console.log(`wrote ${await writeIos(slug, pkg, outDir)} (${Object.keys(pkg.files).length} files, ${pkg.bundleId})`);
  } else {
    const { ok, skipped } = await plan();
    const ids = new Set(ok.map((o) => o.bundleId));
    console.log(`${ok.length} of ${ok.length + skipped.length} ventures qualify as iOS (WKWebView) apps${ids.size === ok.length ? '' : `; WARNING: ${ok.length - ids.size} duplicate bundle ids`}`);
    const reasons = {};
    for (const s of skipped) { const k = s.reason.replace(/"[^"]*"|\S+\.m?js/g, '…'); reasons[k] = (reasons[k] ?? 0) + 1; }
    for (const [r, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`  skipped ${n}: ${r}`);
  }
}
