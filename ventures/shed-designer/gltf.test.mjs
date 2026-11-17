// The .glb export: a well-formed glTF 2.0 binary that carries every piece the
// 3D view draws, at full size in metres with Y up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, PRESETS } from './model.mjs';
import { solidsOf, meshOf } from './render3d.mjs';
import { shedGlb, shedGltf, readGlb } from './gltf.mjs';

const IN = 0.0254;

for (const name of Object.keys(PRESETS)) {
  test(`${name}: the glb is valid glTF 2.0 and holds every drawn piece`, () => {
    const shed = buildShed(PRESETS[name]());
    const glb = shedGlb(shed);
    assert.equal(glb.byteLength % 4, 0);
    const { json, bin, jsonLen, binLen } = readGlb(glb);
    assert.equal(jsonLen % 4, 0);
    assert.equal(binLen % 4, 0);
    assert.equal(json.asset.version, '2.0');
    assert.equal(json.buffers[0].byteLength, bin.byteLength);

    // Every buffer view lies inside the buffer and is 4-byte aligned; every accessor fits its view.
    for (const v of json.bufferViews) {
      assert.equal(v.byteOffset % 4, 0);
      assert.ok(v.byteOffset + v.byteLength <= bin.byteLength);
    }
    const f32 = new Float32Array(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
    for (const a of json.accessors) {
      const v = json.bufferViews[a.bufferView];
      assert.equal(a.componentType, 5126);
      assert.equal(a.type, 'VEC3');
      assert.equal(v.byteLength, a.count * 12);
      // min and max are the data's own bounds (validators reject a mismatch).
      const data = f32.subarray(v.byteOffset / 4, v.byteOffset / 4 + a.count * 3);
      for (let k = 0; k < 3; k++) {
        let lo = Infinity; let hi = -Infinity;
        for (let i = k; i < data.length; i += 3) { lo = Math.min(lo, data[i]); hi = Math.max(hi, data[i]); }
        assert.ok(Math.abs(lo - a.min[k]) < 1e-5 && Math.abs(hi - a.max[k]) < 1e-5, `accessor bounds, axis ${k}`);
      }
    }
    // A triangle list: vertex counts in threes, normals unit length.
    for (const m of json.meshes) {
      const p = m.primitives[0];
      assert.equal(p.mode, 4);
      assert.equal(json.accessors[p.attributes.POSITION].count % 3, 0);
      assert.equal(json.accessors[p.attributes.POSITION].count, json.accessors[p.attributes.NORMAL].count);
      assert.ok(p.material < json.materials.length);
    }

    // Same triangles as the viewer draws, one mesh per piece.
    const solids = solidsOf(shed);
    const expected = meshOf(solids).pos.length / 3;
    const got = json.meshes.reduce((n, m) => n + json.accessors[m.primitives[0].attributes.POSITION].count, 0);
    assert.equal(got, expected);
    assert.equal(json.meshes.length, solids.filter((s) => s.geom.profile.length >= 3).length);

    // The scene's root holds one node per layer, each holding its pieces.
    const root = json.nodes[json.scenes[0].nodes[0]];
    const layered = root.children.flatMap((i) => json.nodes[i].children);
    assert.equal(layered.length, json.meshes.length);
    assert.ok(root.children.some((i) => json.nodes[i].name === 'Walls'));
    // Framing members are named by kind, mark and stock.
    const names = json.nodes.map((n) => n.name);
    const m0 = shed.members[0];
    assert.ok(names.some((n) => n.startsWith(m0.kind[0].toUpperCase()) && n.includes(m0.id)), 'a member is named by its mark');
  });
}

test('the model is in metres with y up: the footprint and peak come out at the shed\'s size', () => {
  const shed = buildShed(PRESETS['8x12']());
  const { json } = shedGltf(shed, { layers: ['floor'] });
  const pos = json.meshes.map((m) => json.accessors[m.primitives[0].attributes.POSITION]);
  const ext = (k, f) => f(...pos.map((a) => (f === Math.min ? a.min[k] : a.max[k])));
  // The floor framing spans the footprint: x along the length, -z across the width.
  assert.ok(Math.abs((ext(0, Math.max) - ext(0, Math.min)) - shed.dims.length * IN) < 1e-3);
  assert.ok(Math.abs((ext(2, Math.max) - ext(2, Math.min)) - shed.dims.width * IN) < 1e-3);
  assert.ok(ext(2, Math.max) <= 1e-6, 'the model\'s +y (toward the back) is glTF\'s -z');
  // The whole model's top is at the peak (y up), within the roofing's thickness.
  const all = shedGltf(shed).json;
  const top = Math.max(...all.meshes.map((m) => all.accessors[m.primitives[0].attributes.POSITION].max[1]));
  assert.ok(top > (shed.dims.peak - 2) * IN && top < (shed.dims.peak + 2) * IN, `top ${top / IN}" vs peak ${shed.dims.peak}"`);
});

test('windows are see-through, everything else opaque and double-sided', () => {
  const { json } = shedGltf(buildShed(PRESETS['8x12']()));
  const glass = json.materials.filter((m) => m.alphaMode === 'BLEND');
  assert.equal(glass.length, 1);
  assert.ok(json.materials.every((m) => m.doubleSided));
  for (const m of json.materials) for (const c of m.pbrMetallicRoughness.baseColorFactor) assert.ok(c >= 0 && c <= 1);
});

test('readGlb rejects a file that is not a glb', () => {
  assert.throws(() => readGlb(new Uint8Array(32)), /magic/);
});
