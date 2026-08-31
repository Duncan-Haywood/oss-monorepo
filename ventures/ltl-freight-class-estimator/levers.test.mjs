import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateFreightClass } from './calc.mjs';
import { leverText, PALLET_DECK_INCHES } from './levers.mjs';

const worked = () => estimateFreightClass({ length: 48, width: 40, height: 36, weight: 500 });

test('names both levers in units a dock can act on', () => {
  const lines = leverText(worked());
  // Height first, because it is the one a shipper can change without finding
  // more freight to put on the pallet.
  assert.match(lines.cheaper, /Class 77\.5/);
  assert.match(lines.cheaper, /pack to 33\.3″ \(2\.7″ shorter\)/);
  assert.match(lines.cheaper, /put 540 lb per piece on it \(40 lb more\)/);
  assert.match(lines.dearer, /Class 92\.5/);
  assert.match(lines.dearer, /above 37\.5″ — 1\.5″ of headroom/);
  assert.match(lines.dearer, /below 480 lb per piece/);
});

test('the clipboard lines carry the same numbers as the panel', () => {
  const lines = leverText(worked());
  assert.equal(lines.plain.length, 2);
  assert.match(lines.plain[0], /To reach class 77\.5: pack to 33\.3″ \(2\.7″ shorter\), or put 540 lb per piece/);
  assert.match(lines.plain[1], /Re-rates to class 92\.5 above 37\.5″/);
  // No markup reaches the clipboard — a warehouse email is plain text.
  for (const line of lines.plain) assert.doesNotMatch(line, /<[a-z/]/i);
});

test('drops the height lever when it would ask for less than a bare pallet', () => {
  // 3 lb across a full 48x40 footprint reaches class 400 only at 5.4", which
  // is under the deck of the pallet it is sitting on.
  const result = estimateFreightClass({ length: 48, width: 40, height: 48, weight: 3 });
  assert.ok(result.levers.cheaper.maxHeight < PALLET_DECK_INCHES);
  const lines = leverText(result);
  assert.doesNotMatch(lines.cheaper, /pack to/);
  assert.match(lines.cheaper, /under a bare pallet, so weight is the only lever/);
  assert.match(lines.plain[0], /put \d+ lb per piece/);
});

test('calls out freight sitting on its band line instead of printing 0.0″', () => {
  // Packing to the class 77.5 target lands exactly on that band's floor, so the
  // headroom before falling back to 85 is nil — the moment a remeasure is most
  // likely to cost money, and the moment a "0.0″ of headroom" reads as noise.
  const result = estimateFreightClass({ length: 48, width: 40, height: 33.3, weight: 500 });
  assert.equal(result.freightClass, 77.5);
  assert.ok(result.levers.dearer.heightHeadroom < 0.5);
  const lines = leverText(result);
  assert.doesNotMatch(lines.dearer, /0\.0″ of headroom/);
  assert.match(lines.dearer, /which is where it already measures/);
  assert.match(lines.dearer, /on the band line/i);
  assert.match(lines.plain[1], /On the band line/);
});

test('emits an empty string for a lever that does not exist', () => {
  const densest = leverText(estimateFreightClass({ length: 12, width: 12, height: 12, weight: 100 }));
  assert.equal(densest.cheaper, '', 'class 50 has nothing cheaper to reach');
  assert.notEqual(densest.dearer, '');
  assert.equal(densest.plain.length, 1);

  const lightest = leverText(estimateFreightClass({ length: 48, width: 40, height: 60, weight: 15 }));
  assert.equal(lightest.dearer, '', 'class 500 cannot re-rate any further down');
  assert.notEqual(lightest.cheaper, '');
  assert.equal(lightest.plain.length, 1);
});

test('rounds for reading without ever rounding a threshold the wrong way', () => {
  // The panel shows one decimal. A target height that rounded *up* would tell
  // the shipper to pack taller than the band allows, which is the one error
  // this feature must not make: pack to the shown height and you are inside.
  for (const weight of [137, 291, 488, 913]) {
    const result = estimateFreightClass({ length: 48, width: 40, height: 40, weight });
    const cheaper = result.levers.cheaper;
    if (!cheaper || cheaper.maxHeight < PALLET_DECK_INCHES) continue;
    const shown = Number(leverText(result).plain[0].match(/pack to ([\d.]+)″/)[1]);
    const atShown = estimateFreightClass({ length: 48, width: 40, height: shown, weight });
    assert.ok(
      atShown.freightClass <= cheaper.freightClass,
      `packing to the displayed ${shown}″ at ${weight} lb landed in class ${atShown.freightClass}, not ${cheaper.freightClass}`,
    );
  }
});
