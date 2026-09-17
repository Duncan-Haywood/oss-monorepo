import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {
  parseValue, scanObjects, findTrailer, expandObjectStreams, decodeStream,
  resolve, isDict, isName, bytesToBinaryString, binaryStringToBytes, PRef,
} from './pdf-parser.mjs';
import { inflate } from './cli/inflate-node.mjs';
import { buildPdf, accessiblePdfObjects, ACCESSIBLE_TRAILER } from './cli/fixtures.mjs';

test('binary string round-trips every byte value', () => {
  const bytes = new Uint8Array(256);
  for (let i = 0; i < 256; i++) bytes[i] = i;
  const roundTripped = binaryStringToBytes(bytesToBinaryString(bytes));
  assert.deepEqual(Array.from(roundTripped), Array.from(bytes));
});

test('parseValue: dict, array, name, ref, literal string, hex string, bool, null', () => {
  const [dict] = parseValue('<< /A /Name1 /B [1 2 3] /C 4 0 R /D (a string) /E <41421A> /F true /G false /H null >>', 0);
  assert.ok(isDict(dict));
  assert.equal(dict.get('A').name, 'Name1');
  assert.deepEqual(dict.get('B'), [1, 2, 3]);
  assert.ok(dict.get('C') instanceof PRef);
  assert.equal(dict.get('C').num, 4);
  assert.equal(dict.get('D').text, 'a string');
  assert.equal(dict.get('E').text, 'AB\x1a');
  assert.equal(dict.get('F'), true);
  assert.equal(dict.get('G'), false);
  assert.equal(dict.get('H'), null);
});

test('parseValue: literal string escapes (parens, backslash, octal)', () => {
  const [dict] = parseValue('<< /S (a \\(nested\\) \\\\ \\061 string) >>', 0);
  assert.equal(dict.get('S').text, 'a (nested) \\ 1 string');
});

test('parseValue: name with #xx hex escape', () => {
  const [dict] = parseValue('<< /Name#20With#20Spaces true >>', 0);
  assert.ok(dict.has('Name With Spaces'));
});

test('scanObjects finds plain objects and their streams, ignoring the xref table', () => {
  const bytes = buildPdf(accessiblePdfObjects(), ACCESSIBLE_TRAILER);
  const str = bytesToBinaryString(bytes);
  const objects = scanObjects(str);
  assert.equal(objects.size, 10);
  const catalog = objects.get(1).dict;
  assert.ok(isName(catalog.get('Type'), 'Catalog'));
  const content = objects.get(4);
  assert.ok(content.streamStart > 0);
  assert.equal(str.slice(content.streamStart, content.streamEnd), 'BT /F1 12 Tf (Hello) Tj ET');
});

test('findTrailer reads the trailer dict', () => {
  const bytes = buildPdf(accessiblePdfObjects(), ACCESSIBLE_TRAILER);
  const str = bytesToBinaryString(bytes);
  const objects = scanObjects(str);
  const trailer = findTrailer(str, objects);
  assert.ok(isDict(trailer));
  assert.ok(trailer.get('Root') instanceof PRef);
  assert.equal(trailer.get('Root').num, 1);
});

test('findTrailer falls back to a /Type /XRef object when there is no "trailer" keyword', () => {
  const objects = [
    { num: 1, dict: '<< /Type /Catalog /Pages 2 0 R >>' },
    { num: 2, dict: '<< /Type /Pages /Kids [] /Count 0 >>' },
    { num: 3, dict: '<< /Type /XRef /Root 1 0 R /Info 4 0 R /Size 5 >>', stream: 'x' },
  ];
  const bytes = buildPdf(objects, ''); // no real trailer keyword content matters here
  const str = bytesToBinaryString(bytes).replace(/trailer\n[\s\S]*?%%EOF/, '%%EOF');
  const objMap = scanObjects(str);
  const trailer = findTrailer(str, objMap);
  assert.ok(isDict(trailer));
  assert.equal(trailer.get('Root').num, 1);
});

test('decodeStream inflates a FlateDecode stream produced by zlib', async () => {
  const original = 'BT /F1 12 Tf (Compressed hello) Tj ET';
  const compressed = zlib.deflateSync(Buffer.from(original, 'latin1'));
  const objects = [
    { num: 1, dict: `<< /Length ${compressed.length} /Filter /FlateDecode >>`, stream: new Uint8Array(compressed) },
  ];
  const bytes = buildPdf(objects, '<< /Root 1 0 R >>');
  const str = bytesToBinaryString(bytes);
  const objMap = scanObjects(str);
  const decoded = await decodeStream(objMap.get(1), str, inflate);
  assert.equal(bytesToBinaryString(decoded), original);
});

test('decodeStream returns null for an unsupported filter rather than throwing', async () => {
  const objects = [{ num: 1, dict: '<< /Filter /DCTDecode /Length 3 >>', stream: new Uint8Array([1, 2, 3]) }];
  const bytes = buildPdf(objects, '<< /Root 1 0 R >>');
  const str = bytesToBinaryString(bytes);
  const objMap = scanObjects(str);
  const decoded = await decodeStream(objMap.get(1), str, inflate);
  assert.equal(decoded, null);
});

test('expandObjectStreams recovers objects packed into a compressed /Type /ObjStm', async () => {
  const obj1Text = '<< /Type /StructElem /S /Figure /Alt (Alt via ObjStm) >>';
  const obj2Text = '<< /Type /Dummy >>';
  const offset1 = 0;
  const offset2 = obj1Text.length + 1;
  const headerLine = `9 ${offset1} 11 ${offset2}\n`;
  const decompressedBody = headerLine + obj1Text + ' ' + obj2Text;
  const compressed = zlib.deflateSync(Buffer.from(decompressedBody, 'latin1'));

  const objects = [
    { num: 1, dict: '<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 6 0 R /MarkInfo 5 0 R /Lang (en) >>' },
    { num: 2, dict: '<< /Type /Pages /Kids [] /Count 0 >>' },
    { num: 5, dict: '<< /Marked true >>' },
    { num: 6, dict: '<< /Type /StructTreeRoot /K [9 0 R] >>' },
    { num: 7, dict: `<< /Type /ObjStm /N 2 /First ${headerLine.length} /Filter /FlateDecode /Length ${compressed.length} >>`, stream: new Uint8Array(compressed) },
    { num: 10, dict: '<< /Title (Has ObjStm) >>' },
  ];
  const bytes = buildPdf(objects, '<< /Root 1 0 R /Info 10 0 R >>');
  const str = bytesToBinaryString(bytes);
  const objMap = scanObjects(str);
  assert.equal(objMap.has(9), false, 'object 9 only exists inside the ObjStm before expansion');
  await expandObjectStreams(objMap, str, inflate);
  assert.equal(objMap.has(9), true);
  const structElem = objMap.get(9).dict;
  assert.ok(isDict(structElem));
  assert.equal(structElem.get('Alt').text, 'Alt via ObjStm');
  assert.equal(objMap.get(11).dict.get('Type').name, 'Dummy');
});

test('expandObjectStreams never overrides an object already found by the plain scan', async () => {
  const decompressedBody = '1 0\n<< /Type /Poisoned >>';
  const compressed = zlib.deflateSync(Buffer.from(decompressedBody, 'latin1'));
  const objects = [
    { num: 1, dict: '<< /Type /Real >>' },
    { num: 2, dict: `<< /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode /Length ${compressed.length} >>`, stream: new Uint8Array(compressed) },
  ];
  const bytes = buildPdf(objects, '<< /Root 1 0 R >>');
  const str = bytesToBinaryString(bytes);
  const objMap = scanObjects(str);
  await expandObjectStreams(objMap, str, inflate);
  assert.equal(objMap.get(1).dict.get('Type').name, 'Real');
});

test('resolve follows a reference and returns non-references unchanged', () => {
  const objects = new Map([[1, { dict: 'value' }]]);
  assert.equal(resolve(new PRef(1, 0), objects), 'value');
  assert.equal(resolve('literal', objects), 'literal');
  assert.equal(resolve(new PRef(999, 0), objects), null);
});
