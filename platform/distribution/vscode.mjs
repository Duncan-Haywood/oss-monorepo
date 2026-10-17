/**
 * VS Code / Open VSX extension packager: one extension, "Free Tools Catalogue",
 * whose command-palette command lists every launched tool (searchable by title
 * and description) and opens the pick in the browser. Off by default; this
 * builds the .vsix artifact only. Publishing to Open VSX or the VS Code
 * Marketplace is the owner's step (a publisher namespace and token).
 * See portfolio/distribution/README.md.
 *
 *   node platform/distribution/vscode.mjs                  # dry run: counts tools that would be listed
 *   node platform/distribution/vscode.mjs --build <outDir> # writes <outDir>/<name>-<version>.vsix
 *
 * The extension has no dependencies, requests no permissions beyond opening a
 * link, makes no network calls of its own and sends nothing anywhere: the tool
 * list is baked in at build time from the same page metadata the other channels use.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMeta, toolUrl } from './bluesky.mjs';
import { tagUrl } from './attribution.mjs';
import { zip } from './webext.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
export const VERSION = '0.1.0';
export const NAME = 'free-tools-catalogue';
export const PUBLISHER = process.env.VSCODE_PUBLISHER || 'duncan-haywood';
const REPO_URL = 'https://github.com/duncan-haywood/oss-monorepo';
export const COMMAND = 'freeToolsCatalogue.search';

const shortTitle = (t) => t.split(/\s[—–|-]\s/)[0].trim();

/** Tool entries { slug, title, description, url } for every launched venture with readable page metadata. */
export async function collect({ root = REPO_ROOT } = {}) {
  const launched = JSON.parse(await fs.readFile(path.join(root, 'platform/pages/launched.json'), 'utf8')).launched;
  const out = [];
  for (const slug of Object.keys(launched).sort()) {
    const html = await fs.readFile(path.join(root, 'ventures', slug, 'index.html'), 'utf8').catch(() => null);
    const meta = html && readMeta(html);
    if (!meta) continue;
    out.push({ slug, title: shortTitle(meta.title), description: meta.description.replace(/\s+/g, ' '), url: tagUrl(toolUrl(slug), 'vscode') });
  }
  return out;
}

/** extension.js source with the tool list embedded as JSON data. */
export function extensionSource(tools) {
  return `'use strict';
const vscode = require('vscode');
const TOOLS = ${JSON.stringify(tools)};

function activate(context) {
  context.subscriptions.push(vscode.commands.registerCommand('${COMMAND}', async () => {
    const pick = await vscode.window.showQuickPick(
      TOOLS.map((t) => ({ label: t.title, detail: t.description, description: t.slug, url: t.url })),
      { placeHolder: 'Search ' + TOOLS.length + ' free tools', matchOnDetail: true, matchOnDescription: true }
    );
    if (pick) await vscode.env.openExternal(vscode.Uri.parse(pick.url));
  }));
}
function deactivate() {}
module.exports = { activate, deactivate };
`;
}

export function manifest(count, version = VERSION) {
  return {
    name: NAME,
    displayName: 'Free Tools Catalogue',
    description: `Search ${count} free, open-source calculators, checkers and small business tools from the command palette.`,
    version,
    publisher: PUBLISHER,
    license: 'MIT',
    engines: { vscode: '^1.80.0' },
    categories: ['Other'],
    keywords: ['calculator', 'checker', 'tools', 'free', 'open source'],
    repository: { type: 'git', url: `${REPO_URL}.git` },
    homepage: toolUrl('').replace(/\/$/, '/'),
    main: './extension.js',
    activationEvents: [],
    capabilities: { untrustedWorkspaces: { supported: true }, virtualWorkspaces: true },
    contributes: { commands: [{ command: COMMAND, title: 'Free Tools: Search the catalogue' }] },
  };
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The VSIX-only metadata files that wrap an extension/ folder. */
export function vsixWrapper(m) {
  return {
    '[Content_Types].xml': '<?xml version="1.0" encoding="utf-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/Content-Types"><Default Extension=".json" ContentType="application/json"/><Default Extension=".js" ContentType="application/javascript"/><Default Extension=".md" ContentType="text/markdown"/><Default Extension=".vsixmanifest" ContentType="text/xml"/><Default Extension="" ContentType="text/plain"/></Types>\n',
    'extension.vsixmanifest': `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Language="en-US" Id="${esc(m.name)}" Version="${esc(m.version)}" Publisher="${esc(m.publisher)}"/>
    <DisplayName>${esc(m.displayName)}</DisplayName>
    <Description xml:space="preserve">${esc(m.description)}</Description>
    <Tags>${esc(m.keywords.join(','))}</Tags>
    <Categories>${esc(m.categories.join(','))}</Categories>
    <License>extension/LICENSE.txt</License>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code" Version="${esc(m.engines.vscode)}"/></Installation>
  <Dependencies/>
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/readme.md" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE.txt" Addressable="true"/>
  </Assets>
</PackageManifest>
`,
  };
}

const MIT = `MIT License

Copyright (c) Free Tools Catalogue contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
`;

export function readme(count) {
  return `# Free Tools Catalogue

Search ${count} free, open-source calculators, checkers and small business tools from the command palette.

Open the palette and run **Free Tools: Search the catalogue**. Type to filter by name or description; pressing Enter opens the tool's page in your browser.

The extension has no settings, collects nothing and makes no network requests itself. The list is bundled in the package; opening a tool is an ordinary link to ${toolUrl('')}.

Free and open source (MIT). Source: ${REPO_URL}

Tools are aids, offered without warranty, and are not legal, tax, medical or other professional advice.
`;
}

/** { name, version, files } where files is the full VSIX content. */
export async function buildVsix({ root = REPO_ROOT, version = VERSION } = {}) {
  const tools = await collect({ root });
  if (!tools.length) return { skip: 'no launched tools with readable metadata' };
  const m = manifest(tools.length, version);
  const files = {
    ...vsixWrapper(m),
    'extension/package.json': `${JSON.stringify(m, null, 2)}\n`,
    'extension/extension.js': extensionSource(tools),
    'extension/readme.md': readme(tools.length),
    'extension/LICENSE.txt': MIT,
  };
  return { name: `${NAME}-${version}.vsix`, count: tools.length, files };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const r = await buildVsix();
  if (r.skip) { console.error(r.skip); process.exit(1); }
  if (args[0] === '--build') {
    if (!args[1]) { console.error('usage: vscode.mjs --build <outDir>'); process.exit(2); }
    await fs.mkdir(args[1], { recursive: true });
    const out = path.join(args[1], r.name);
    await fs.writeFile(out, zip(r.files));
    console.log(`wrote ${out} (${r.count} tools)`);
  } else {
    console.log(`would package ${r.count} tools as ${r.name} (publisher ${PUBLISHER}); --build <dir> writes it`);
  }
}
