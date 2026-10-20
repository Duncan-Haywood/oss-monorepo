/**
 * WordPress plugin packager: one plugin, "Free Tools Embed", that lets a site
 * owner drop any launched tool into a post or page with a shortcode,
 *
 *   [free_tool slug="shop-rate-calculator"]
 *   [free_tool slug="shop-rate-calculator" height="900"]
 *   [free_tools_list]                      (a linked list of every tool)
 *
 * The shortcode renders a sandboxed, lazy-loaded iframe of the tool's own page
 * (`?pfEmbed=1`, which platform/pages/embed.mjs recognises) plus a visible link
 * to the full tool. Every embed is a real inbound link and an audience that
 * already exists. Off by default: this builds the .zip artifact only; listing
 * it on WordPress.org needs the owner's account (portfolio/distribution/README.md).
 *
 *   node platform/distribution/wordpress.mjs                  # dry run: counts tools
 *   node platform/distribution/wordpress.mjs --build <outDir> # writes <outDir>/<name>-<version>.zip
 *
 * The plugin makes no request of its own, stores nothing and adds no script to
 * the host page. Only slugs baked in at build time are accepted, so a shortcode
 * cannot point the iframe at an arbitrary address.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect } from './vscode.mjs';
import { tagUrl } from './attribution.mjs';
import { zip } from './webext.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
export const VERSION = '0.1.0';
export const NAME = 'free-tools-embed';
const REPO_URL = 'https://github.com/duncan-haywood/oss-monorepo';

const MIT = `MIT License

Copyright (c) Free Tools Embed contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
`;

/** `?pfEmbed=1&ref=wordpress` on the tool's page; the page strips the tag after counting it. */
export const embedUrl = (url) => {
  const u = new URL(tagUrl(url, 'wordpress'));
  u.searchParams.set('pfEmbed', '1');
  return u.href;
};

/** The plugin's one PHP file, with the tool list embedded as JSON data. */
export function pluginSource(tools, version = VERSION) {
  const data = tools.map((t) => ({ slug: t.slug, title: t.title, url: t.url.replace(/[?#].*$/, ''), embed: embedUrl(t.url) }));
  return `<?php
/**
 * Plugin Name: Free Tools Embed
 * Description: Embed ${tools.length} free calculators, checkers and small business tools in a post or page with [free_tool slug="..."].
 * Version: ${version}
 * Requires at least: 5.0
 * Requires PHP: 7.2
 * License: MIT
 * Text Domain: ${NAME}
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function free_tools_embed_catalogue() {
	static $tools = null;
	if ( null === $tools ) {
		$tools = json_decode( <<<'JSON'
${JSON.stringify(data)}
JSON
		, true );
		$tools = is_array( $tools ) ? $tools : array();
	}
	return $tools;
}

function free_tool_shortcode( $atts ) {
	$atts  = shortcode_atts( array( 'slug' => '', 'height' => '720' ), $atts, 'free_tool' );
	$slug  = sanitize_key( $atts['slug'] );
	$tools = free_tools_embed_catalogue();
	$found = null;
	foreach ( $tools as $tool ) {
		if ( $tool['slug'] === $slug ) {
			$found = $tool;
			break;
		}
	}
	if ( null === $found ) {
		return current_user_can( 'edit_posts' )
			? '<p>' . esc_html__( 'free_tool: unknown tool slug.', '${NAME}' ) . '</p>'
			: '';
	}
	$height = max( 300, min( 2000, absint( $atts['height'] ) ) );
	return sprintf(
		'<figure class="free-tools-embed"><iframe src="%1$s" title="%2$s" width="100%%" height="%3$d" loading="lazy" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" referrerpolicy="strict-origin-when-cross-origin" style="border:1px solid #ccc;border-radius:6px"></iframe><figcaption><a href="%4$s">%5$s</a> &middot; free, open-source tool. Not professional advice.</figcaption></figure>',
		esc_url( $found['embed'] ),
		esc_attr( $found['title'] ),
		$height,
		esc_url( $found['url'] ),
		esc_html( $found['title'] )
	);
}
add_shortcode( 'free_tool', 'free_tool_shortcode' );

function free_tools_list_shortcode() {
	$out = '<ul class="free-tools-list">';
	foreach ( free_tools_embed_catalogue() as $tool ) {
		$out .= '<li><a href="' . esc_url( $tool['url'] ) . '">' . esc_html( $tool['title'] ) . '</a></li>';
	}
	return $out . '</ul>';
}
add_shortcode( 'free_tools_list', 'free_tools_list_shortcode' );
`;
}

export function readmeTxt(count, version = VERSION) {
  return `=== Free Tools Embed ===
Contributors: duncanhaywood
Tags: calculator, embed, shortcode, tools, iframe
Requires at least: 5.0
Tested up to: 6.6
Requires PHP: 7.2
Stable tag: ${version}
License: MIT
License URI: https://opensource.org/licenses/MIT

Embed any of ${count} free, open-source calculators, checkers and small business tools in a post or page with a shortcode.

== Description ==

Add \`[free_tool slug="shop-rate-calculator"]\` to a post or page and the tool appears inline. Each embed shows a link to the full tool underneath.

* \`[free_tool slug="..." height="900"]\` sets the frame height (300 to 2000 pixels).
* \`[free_tools_list]\` prints a linked list of every tool and its slug.

The plugin makes no requests of its own, stores nothing, sets no cookies and adds no script to your page. The tool runs inside an iframe from the portfolio's GitHub Pages site and computes in the visitor's browser. Only tools bundled in the plugin can be embedded.

Tools are aids, offered without warranty, and are not legal, tax, medical or other professional advice. Source: ${REPO_URL}

== Installation ==

1. Upload the plugin folder to \`/wp-content/plugins/\` and activate it.
2. Add \`[free_tool slug="..."]\` to a post or page. Use \`[free_tools_list]\` to see the slugs.

== Changelog ==

= ${version} =
* First release.
`;
}

/** { name, count, files } where files is the zip content. */
export async function buildPlugin({ root = REPO_ROOT, version = VERSION } = {}) {
  const tools = await collect({ root });
  if (!tools.length) return { skip: 'no launched tools with readable metadata' };
  const files = {
    [`${NAME}/${NAME}.php`]: pluginSource(tools, version),
    [`${NAME}/readme.txt`]: readmeTxt(tools.length, version),
    [`${NAME}/LICENSE`]: MIT,
  };
  return { name: `${NAME}-${version}.zip`, count: tools.length, files };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const r = await buildPlugin();
  if (r.skip) { console.error(r.skip); process.exit(1); }
  if (args[0] === '--build') {
    if (!args[1]) { console.error('usage: wordpress.mjs --build <outDir>'); process.exit(2); }
    await fs.mkdir(args[1], { recursive: true });
    const out = path.join(args[1], r.name);
    await fs.writeFile(out, zip(r.files));
    console.log(`wrote ${out} (${r.count} tools)`);
  } else {
    console.log(`would package ${r.count} tools as ${r.name}; --build <dir> writes it`);
  }
}
