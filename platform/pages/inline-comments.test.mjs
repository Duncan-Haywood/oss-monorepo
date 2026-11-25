// stripInlineScriptComments: the hub's inline scripts lose their comment
// lines and nothing else (docs/history/hub-perf-2026-11-25-script-comments.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripInlineScriptComments } from './build.mjs';

test('drops whole-line // comments from inline scripts and keeps every code line byte for byte', () => {
  const html = [
    '<p>// prose outside a script stays</p>',
    '<script type="module">',
    '    // why the next line exists',
    '    const a = 1; // a trailing comment stays with its code',
    '',
    '      //indented, no space',
    "    const url = 'https://example.test/x';",
    '</script>',
    '<script>',
    '  // classic script too',
    '  go();',
    '</script>',
  ].join('\n');
  assert.equal(stripInlineScriptComments(html), [
    '<p>// prose outside a script stays</p>',
    '<script type="module">',
    '    const a = 1; // a trailing comment stays with its code',
    '',
    "    const url = 'https://example.test/x';",
    '</script>',
    '<script>',
    '  go();',
    '</script>',
  ].join('\n'));
});

test('leaves a script whole when a // line could be string content', () => {
  const template = '<script type="module">\n  const t = `\n  // part of the string\n  `;\n</script>';
  assert.equal(stripInlineScriptComments(template), template);
  const continued = '<script>\n  const s = "a\\\n// part of the string";\n</script>';
  assert.equal(stripInlineScriptComments(continued), continued);
});

test('keeps a // line that may close a block comment, and never touches data blocks', () => {
  const block = '<script>\n  /* opened\n  // still inside */\n  run();\n</script>';
  assert.equal(stripInlineScriptComments(block), block);
  const ld = '<script type="application/ld+json">\n// not ours to edit\n{}\n</script>';
  assert.equal(stripInlineScriptComments(ld), ld);
});
