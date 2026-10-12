import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSamples, infer, generate, convert, pascal, singular } from './types.mjs';

const two = '{"id":1,"name":"a","at":"2024-01-02T03:04:05Z","owner":{"id":2},"items":[{"sku":"A","price":1.5},{"sku":"B","price":null}]}\n{"id":2,"name":null,"at":"2024-02-02T03:04:05Z","owner":null,"extra":true,"items":[]}';

test('parseSamples reads one value, NDJSON and back-to-back pretty objects', () => {
  assert.equal(parseSamples('{"a":1}').length, 1);
  assert.equal(parseSamples('{"a":1}\n{"a":2}').length, 2);
  assert.equal(parseSamples('{\n "a": "}{"\n}\n{\n "a": 2\n}').length, 2);
  assert.equal(parseSamples('[1,2,3]').length, 1);
});

test('parseSamples reports a useful error and never returns partial data', () => {
  assert.throws(() => parseSamples(''), /Paste some JSON/);
  assert.throws(() => parseSamples('{"a":'), /Invalid JSON/);
  assert.throws(() => parseSamples('{"a":1}\n{"a":}'), /Sample 2/);
});

test('fields missing from some samples become optional, nulls become nullable', () => {
  const { code, stats } = convert(two);
  assert.match(code, /extra\?: boolean;/);
  assert.match(code, /name: string \| null;/);
  assert.match(code, /owner: Owner \| null;/);
  assert.match(code, /price: number \| null;/);
  assert.equal(stats.samples, 2);
  assert.equal(stats.optional, 1);
});

test('formats are detected only when every string agrees', () => {
  assert.match(convert('{"at":"2024-01-02T03:04:05Z"}').code, /ISO 8601 date-time/);
  assert.doesNotMatch(convert('{"at":"2024-01-02T03:04:05Z"}\n{"at":"soon"}').code, /ISO 8601/);
});

test('ints stay integers until a float appears', () => {
  assert.match(convert('{"n":1}', { style: 'zod' }).code, /z\.number\(\)\.int\(\)/);
  assert.doesNotMatch(convert('{"n":1}\n{"n":1.5}', { style: 'zod' }).code, /\.int\(\)/);
});

test('identical nested shapes share one type; different shapes get distinct names', () => {
  const same = convert('{"a":{"x":1},"b":{"x":2}}').code;
  assert.equal((same.match(/export interface/g) || []).length, 2);
  const diff = convert('{"a":{"x":1},"b":{"y":"s"}}').code;
  assert.match(diff, /interface A /); assert.match(diff, /interface B /);
  const clash = convert('{"p":{"a":{"x":1}},"q":{"a":{"y":2}}}').code;
  assert.match(clash, /interface A /); assert.match(clash, /interface A2 /);
});

test('array items are named from the singular of the key and unions are parenthesised', () => {
  assert.match(convert('{"categories":[{"n":1}]}').code, /categories: Category\[\]/);
  assert.match(convert('{"v":[1,"a"]}').code, /v: Array<string \| number>/);
});

test('empty arrays and one sample produce warnings instead of silent guesses', () => {
  const { code, warnings } = convert('{"a":[]}');
  assert.match(code, /a: unknown\[\]/);
  assert.ok(warnings.some((w) => /always an empty array/.test(w)));
  assert.ok(warnings.some((w) => /One sample/.test(w)));
});

test('ID-keyed objects become a map, not one field per ID', () => {
  const { code } = convert('{"byId":{"1":{"n":"a"},"2":{"n":"b"},"3":{"n":"c"},"4":{"n":"d"},"5":{"n":"e"}}}');
  assert.match(code, /byId: Record<string, [A-Za-z]+>/);
  assert.doesNotMatch(code, /"1"/);
});

test('property names that are not identifiers are quoted; reserved type names are avoided', () => {
  const { code } = convert('{"first-name":"a","Date":{"x":1}}');
  assert.match(code, /"first-name": string;/);
  assert.match(code, /interface DateType /);
});

test('a non-object root becomes a type alias, and a top-level array infers its item', () => {
  assert.match(convert('[{"a":1},{"a":2,"b":"x"}]').code, /export type Root = Item\[\];/);
  assert.match(convert('[{"a":1},{"a":2,"b":"x"}]').code, /b\?: string;/);
  assert.match(convert('"hi"').code, /export type Root = string;/);
});

test('readonly and root name options apply', () => {
  const { code } = convert('{"a":1}', { readonly: true, rootName: 'api response' });
  assert.match(code, /export interface ApiResponse \{\n  readonly a: number;/);
});

test('zod output nests schemas children-first and handles optional and nullable', () => {
  const { code } = convert(two, { style: 'zod' });
  assert.ok(code.indexOf('OwnerSchema = ') < code.indexOf('RootSchema = '));
  assert.match(code, /extra: z\.boolean\(\)\.optional\(\)/);
  assert.match(code, /owner: OwnerSchema\.nullable\(\)/);
  assert.match(code, /at: z\.string\(\)\.datetime/);
});

test('JSON Schema output is valid JSON with required lists', () => {
  const s = JSON.parse(convert(two, { style: 'jsonschema' }).code);
  assert.equal(s.type, 'object');
  assert.ok(!s.required.includes('extra'));
  assert.ok(s.required.includes('id'));
  assert.deepEqual(s.properties.name.type, ['string', 'null']);
});

test('Go output uses initialisms, pointers for optional and nullable, and imports time only when needed', () => {
  const { code } = convert(two, { style: 'go' });
  assert.match(code, /ID\s+int64\s+`json:"id"`/);
  assert.match(code, /Extra\s+\*bool\s+`json:"extra,omitempty"`/);
  assert.match(code, /import "time"/);
  assert.doesNotMatch(convert('{"a":1}', { style: 'go' }).code, /import "time"/);
});

test('a bad style is rejected', () => {
  assert.throws(() => generate(infer([{}]), { style: 'rust' }), /style must be/);
});

test('helpers', () => {
  assert.equal(pascal('user_profile-id'), 'UserProfileId');
  assert.equal(singular('boxes'), 'box'); assert.equal(singular('entries'), 'entry'); assert.equal(singular('status'), 'status');
});

test('__proto__ keys from untrusted JSON do not pollute or crash', () => {
  const { code } = convert('{"__proto__":{"x":1},"a":1}');
  assert.match(code, /__proto__/);
  assert.equal({}.x, undefined);
});
