/**
 * Contract tests for the documentation HTML to JSX converter.
 *
 * These assert the conversion rules the generated documentation depends on.
 * They were validated against the `htmltojsx` implementation this module
 * replaced: 42 fixtures plus the repository's full 11-page documentation set
 * converted byte-identically before the dependency was removed. The removal
 * closed two CRITICAL advisories (`request` SSRF, `form-data` CRLF injection).
 *
 * Run: node --test scripts/test-html-to-jsx.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convert } from './html-to-jsx.mjs';

/** convert() always terminates with a newline; strip it for readable assertions. */
const c = (html) => convert(html).replace(/\n$/, '');

test('renames HTML attributes to their React property names', () => {
  assert.equal(c('<div class="a b">x</div>'), '<div className="a b">x</div>');
  assert.equal(c('<label for="n">N</label>'), '<label htmlFor="n">N</label>');
  assert.equal(
    c('<table><tbody><tr><td colspan="2">c</td></tr></tbody></table>'),
    '<table><tbody><tr><td colSpan={2}>c</td></tr></tbody></table>',
  );
  assert.equal(c('<input maxlength="10" type="text">'), '<input maxLength={10} type="text" />');
  assert.equal(c('<div tabindex="0">z</div>'), '<div tabIndex={0}>z</div>');
});

test('passes through attributes that need no rename, including aria and data', () => {
  assert.equal(
    c('<div aria-labelledby="x" data-foo="bar" id="y">z</div>'),
    '<div aria-labelledby="x" data-foo="bar" id="y">z</div>',
  );
});

test('emits numeric attribute values as expressions, not strings', () => {
  // React treats a bare string "2" and {2} differently for some props, and the
  // generated pages were built against the expression form.
  assert.equal(c('<ol start="2"><li>a</li></ol>'), '<ol start={2}><li>a</li></ol>');
  assert.equal(c('<p title="1.5">x</p>'), '<p title="1.5">x</p>', 'non-integers stay strings');
});

test('renders a valueless attribute as a bare JSX boolean', () => {
  assert.equal(c('<input disabled="" type="text">'), '<input disabled type="text" />');
});

test('escapes double quotes inside attribute values', () => {
  assert.equal(c('<div title=\'say "hi"\'>x</div>'), '<div title="say &quot;hi&quot;">x</div>');
});

test('converts inline styles to a JSX style object', () => {
  assert.equal(
    c('<p style="color: red; font-size: 12px">t</p>'),
    "<p style={{color: 'red', fontSize: 12}}>t</p>",
  );
});

test('strips px from integer pixel values but keeps other units as strings', () => {
  assert.equal(
    c('<p style="max-width: 720px; font-size: 1.2rem">t</p>'),
    "<p style={{maxWidth: 720, fontSize: '1.2rem'}}>t</p>",
  );
});

test('keeps unitless numeric style values unquoted', () => {
  assert.equal(c('<p style="z-index: 5">t</p>'), '<p style={{zIndex: 5}}>t</p>');
  // 0.9 does not survive parseInt round-tripping, so it stays a quoted string.
  assert.equal(c('<p style="opacity: 0.9">t</p>'), "<p style={{opacity: '0.9'}}>t</p>");
});

test('rewrites single quotes inside style values to double quotes', () => {
  assert.equal(
    c("<p style=\"font-family: 'Fira Code', monospace\">t</p>"),
    '<p style={{fontFamily: \'"Fira Code", monospace\'}}>t</p>',
  );
});

test('preserves the lowercase ms prefix when camelCasing style keys', () => {
  // React expects `msFlex`, not `MsFlex`; every other vendor prefix capitalizes.
  assert.equal(c('<p style="-ms-flex: 1">t</p>'), '<p style={{msFlex: 1}}>t</p>');
  assert.equal(
    c('<p style="-webkit-box-flex: 1">t</p>'),
    '<p style={{WebkitBoxFlex: 1}}>t</p>',
  );
});

test('drops an empty style attribute to an empty object', () => {
  assert.equal(c('<p style="">t</p>'), '<p style={{}}>t</p>');
});

test('escapes text so JSX renders the original characters', () => {
  assert.equal(c('<p>Tom & Jerry</p>'), '<p>Tom &amp; Jerry</p>');
  assert.equal(c('<p>a &lt; b</p>'), '<p>a &lt; b</p>');
  assert.equal(c('<p>a b</p>'), '<p>a&nbsp;b</p>', 'non-breaking space is preserved');
});

test('escapes curly braces in text so they are not read as JSX expressions', () => {
  assert.equal(c('<p>use {this}</p>'), "<p>use {'{'}this{'}'}</p>");
});

test('self-closes elements with no children', () => {
  assert.equal(c('<p>a<br>b</p>'), '<p>a<br />b</p>');
  assert.equal(c('<div></div>'), '<div />');
});

test('converts HTML comments to JSX comment expressions', () => {
  assert.equal(c('<div><!-- hi --></div>'), '<div>{/* hi */}</div>');
});

test('neutralizes a comment that would close the JSX comment early', () => {
  assert.equal(c('<div><!-- a */ b --></div>'), '<div>{/* a * / b */}</div>');
});

test('protects significant whitespace inside pre from JSX coalescing', () => {
  // JSX collapses runs of whitespace, so newlines and multi-space runs become
  // string expressions that survive rendering.
  assert.equal(c('<pre>a\n  b</pre>'), '<pre>a{"\\n"}{"  "}b</pre>');
});

test('hoists style element bodies out of JSX children', () => {
  // Style bodies use curly braces freely and cannot be JSX children.
  assert.equal(
    c('<div><style>.a { color: red }</style></div>'),
    '<div><style dangerouslySetInnerHTML={{__html: ".a { color: red }" }} /></div>',
  );
});

test('hoists textarea content into defaultValue', () => {
  assert.equal(c('<textarea>hi</textarea>'), '<textarea defaultValue={"hi"} />');
});

test('strips script tags rather than emitting them into generated pages', () => {
  assert.equal(c('<div><script>alert(1)</script><p>after</p></div>'), '<div><p>after</p></div>');
});

test('wraps multiple top-level nodes in a single div', () => {
  // JSX requires one root; a lone root is returned unwrapped.
  assert.equal(c('<p>one</p><p>two</p>'), '<div>\n  <p>one</p><p>two</p>\n</div>');
  assert.equal(c('<section><p>one</p></section>'), '<section><p>one</p></section>');
});

test('treats non-whitespace text beside an element as multiple top-level nodes', () => {
  assert.match(c('lead<p>one</p>'), /^<div>/);
});

test('camelCases SVG element and attribute names', () => {
  assert.equal(
    c('<svg><clipPath id="c"><rect width="10"></rect></clipPath></svg>'),
    '<svg><clipPath id="c"><rect width={10} /></clipPath></svg>',
  );
  assert.equal(
    c('<svg><path stroke-width="2" fill-rule="evenodd"></path></svg>'),
    '<svg><path strokeWidth={2} fillRule="evenodd" /></svg>',
  );
});

test('preserves source indentation of nested structures', () => {
  assert.equal(
    c('<div>\n  <ul>\n    <li>a</li>\n  </ul>\n</div>'),
    '<div>\n  <ul>\n    <li>a</li>\n  </ul>\n</div>',
  );
});

test('parses table markup in a div context so rows are not hoisted out', () => {
  // parse5 defaults to a template fragment context, which does not apply the
  // in-table insertion modes; the converter forces a div context to match the
  // innerHTML behaviour the generated pages were built against.
  assert.equal(
    c('<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>D</td></tr></tbody></table>'),
    '<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>D</td></tr></tbody></table>',
  );
});

test('leaves unicode text untouched', () => {
  assert.equal(c('<p>café — naïve ✓</p>'), '<p>café — naïve ✓</p>');
});
