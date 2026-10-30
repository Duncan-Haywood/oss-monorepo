import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildShed, defaultDesign, PRESETS } from './model.mjs';
import { buildSheets } from './drawings.mjs';
import { fmtFtIn, fmtIn } from './lumber.mjs';
import { VIEWS, elevationSvg, planSvg, packetHtml, packetSummary, sidingLook, encodeDesign, decodeDesign } from './hoa.mjs';

const views = (html) => [...html.matchAll(/<svg[^>]*class="hoa-elev" data-view="(\w+)"/g)].map((m) => m[1]);
const planned = (html) => /class="hoa-elev hoa-plan" data-view="plan"/.test(html);
const texts = (svg) => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));

for (const [key, make] of Object.entries(PRESETS)) {
  test(`${key}: the packet has all four elevations, each with its overall size, heights and pitch`, () => {
    const shed = buildShed(make());
    const d = shed.design;
    const k = shed.dims;
    const html = packetHtml(shed);
    assert.deepEqual(views(html).sort(), [...VIEWS].sort());
    assert.ok(planned(html), 'roof and footprint plan');
    for (const v of VIEWS) {
      const svg = elevationSvg(shed, v);
      const t = texts(svg);
      const eave = v === 'front' || v === 'back';
      assert.ok(t.includes(`${fmtFtIn(eave ? d.length : d.width)} wall ${eave ? 'length' : 'width'}`), `${v}: overall dimension`);
      assert.ok(t.includes(`${fmtFtIn(k.peak)} to peak`), `${v}: peak height`);
      assert.ok(t.includes(`${fmtFtIn(k.plateTop)} to wall top`), `${v}: wall height`);
      assert.ok(t.some((s) => s.startsWith(`${d.pitch}/12 roof pitch`)), `${v}: pitch`);
      if (!eave && d.overhang > 0) assert.ok(t.includes(`${fmtFtIn(d.width + 2 * d.overhang)} eave to eave`), `${v}: eave to eave`);
      // Every door and window on this wall is drawn and labelled with its size.
      const ops = shed.walls[v].openings;
      assert.equal((svg.match(/data-kind="door"/g) || []).length, ops.filter((p) => p.op.kind === 'door').length, `${v}: doors`);
      assert.equal((svg.match(/data-kind="window"/g) || []).length, ops.filter((p) => p.op.kind === 'window').length, `${v}: windows`);
      for (const p of ops) assert.ok(t.includes(`${p.op.kind} ${fmtIn(p.w)} x ${fmtIn(p.op.height)}`), `${v}: ${p.op.kind} label`);
      assert.equal((svg.match(/data-kind="vent"/g) || []).length, (shed.vents[v] || []).length, `${v}: vents`);
    }
  });

  test(`${key}: the summary gives the area, heights and every finish with its colour`, () => {
    const shed = buildShed(make());
    const d = shed.design;
    const rows = Object.fromEntries(packetSummary(shed));
    assert.match(rows.Footprint, new RegExp(`${(d.length * d.width / 144).toFixed(0)} sq ft`));
    assert.match(rows['Height to the peak'], new RegExp(fmtFtIn(shed.dims.peak).replace(/[-/]/g, '\\$&')));
    assert.match(rows.Roof, new RegExp(`${d.pitch}/12`));
    assert.match(rows.Siding, new RegExp(d.sidingType.replace(/[-/]/g, '\\$&')));
    assert.match(rows.Roofing, new RegExp(d.roofColor));
    assert.match(rows.Trim, new RegExp(d.trimColor));
  });
}

test('the chain under each wall places every opening and adds up to the wall', () => {
  const shed = buildShed(PRESETS['8x12']());
  const svg = elevationSvg(shed, 'back');
  const chain = [...svg.matchAll(/<g class="dim chain"><line x1="([\d.-]+)"[^>]*x2="([\d.-]+)"/g)].map((m) => Number(m[2]) - Number(m[1]));
  assert.equal(chain.length, 5); // corner, window, gap, window, corner
  assert.ok(Math.abs(chain.reduce((a, b) => a + b, 0) - shed.design.length) < 0.05);
});

test('lap siding is drawn level and named; T1-11 is drawn with vertical grooves', () => {
  assert.equal(sidingLook('fiber cement').direction, 'horizontal');
  assert.equal(sidingLook('vinyl').direction, 'horizontal');
  assert.equal(sidingLook('HardiePlank lap').direction, 'horizontal');
  assert.equal(sidingLook('T1-11').direction, 'vertical');
  const lines = (svg) => [...svg.matchAll(/<line x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)" stroke="#[0-9a-f]{6}" stroke-width="0\.(?:45|4|6)"/g)];
  const level = (svg) => lines(svg).filter((m) => m[2] === m[4] && m[1] !== m[3]).length;
  const upright = (svg) => lines(svg).filter((m) => m[1] === m[3] && m[2] !== m[4]).length;
  const lap = elevationSvg(buildShed({ ...defaultDesign(), sidingType: 'fiber cement', sidingColor: 'gray' }), 'front');
  const t111 = elevationSvg(buildShed(defaultDesign()), 'front');
  assert.ok(level(lap) > 10 && upright(lap) === 0, `lap: ${level(lap)} level, ${upright(lap)} upright`);
  assert.ok(upright(t111) > 10 && level(t111) === 0, `T1-11: ${level(t111)} level, ${upright(t111)} upright`);
  assert.match(packetHtml(buildShed({ ...defaultDesign(), sidingType: 'fiber cement', sidingColor: 'gray' })), /fiber cement lap siding \(horizontal/);
});

test('the siding, roof and trim colours are the ones chosen', () => {
  const shed = buildShed({ ...defaultDesign(), sidingColor: 'blue', roofColor: 'brown', trimColor: 'black' });
  const html = packetHtml(shed);
  assert.match(html, /Siding: blue paint/);
  assert.match(html, /Roof: brown/);
  assert.match(html, /Trim: black/);
  const svg = elevationSvg(shed, 'front');
  assert.match(svg, /fill="#6185a8"/); // SIDING_COLORS.blue
  assert.match(svg, /fill="#212126"/); // TRIM_COLORS.black
});

test('the 3D view is in the packet only when asked for', () => {
  const shed = buildShed(defaultDesign());
  assert.doesNotMatch(packetHtml(shed), /<img/);
  assert.match(packetHtml(shed, { perspective: 'data:image/png;base64,AAAA' }), /<img src="data:image\/png;base64,AAAA" alt="3D view/);
});

test('the site plan page is the plan set\'s own site sheet when a lot is typed, else a place to sketch one', () => {
  const plain = buildShed(defaultDesign());
  assert.match(packetHtml(plain), /No site plan yet/);
  const lot = buildShed({ ...defaultDesign(), lotWidthFt: 60, lotDepthFt: 120, siteLeftFt: 6, siteRearFt: 8, houseWidthFt: 40, houseDepthFt: 30, houseLeftFt: 10, houseFrontFt: 25, setbackFt: 5 });
  const site = buildSheets(lot).find((s) => s.id === 'site');
  const html = packetHtml(lot);
  // The site sheet comes from the plan set (round 2's site plan); until that
  // lands on this branch, the packet keeps its sketch page.
  if (site) {
    assert.doesNotMatch(html, /No site plan yet/);
    assert.match(html, /class="hoa-fig hoa-site"><svg/);
    assert.match(html, /Not a survey/);
  } else assert.match(html, /No site plan yet/);
});

test('the packet makes no approval or permit claim and keeps the disclaimer on every page', () => {
  const html = packetHtml(buildShed(defaultDesign()));
  assert.doesNotMatch(html, /permit-ready|HOA-approved|\bapproved\b|meets code|code-compliant/i);
  const pages = html.split('<section class="hoa-page').length - 1;
  assert.equal(pages, 5);
  assert.equal((html.match(/Not engineered or code-checked, and not an approval/g) || []).length, pages);
});

test('a design survives the link both ways, and a broken link reads as none', () => {
  const d = { ...defaultDesign(), name: 'Café shed' };
  assert.deepEqual(decodeDesign(`#d=${encodeDesign(d)}`), JSON.parse(JSON.stringify(d)));
  assert.equal(decodeDesign('#d=not-base64!!'), null);
  assert.equal(decodeDesign(''), null);
});

test('the packet page has what its script looks up, the disclaimer, and the designer links to it', () => {
  const html = readFileSync(new URL('./hoa-packet.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('./hoa-page.mjs', import.meta.url), 'utf8');
  for (const id of new Set([...js.matchAll(/\$\('#([\w-]+)/g)].map((m) => m[1]))) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /No warranty\./);
  assert.match(html, /not engineering, construction/);
  assert.match(html, /<script type="module" src="\.\/hoa-page\.mjs"><\/script>/);
  assert.match(html, /@page \{ size: letter landscape/);
  assert.match(readFileSync(new URL('./index.html', import.meta.url), 'utf8'), /id="hoa-packet"/);
  assert.match(readFileSync(new URL('./app.mjs', import.meta.url), 'utf8'), /hoa-packet\.html#d=\$\{encodeDesign\(design\(\)\)\}/);
});

for (const [key, make] of Object.entries(PRESETS)) {
  test(`${key}: the roof plan gives the wall and roof sizes both ways and marks every door and window`, () => {
    const shed = buildShed(make());
    const d = shed.design;
    const svg = planSvg(shed);
    const t = texts(svg);
    assert.ok(t.includes(`${fmtFtIn(d.length)} walls`));
    assert.ok(t.includes(`${fmtFtIn(d.width)} walls`));
    assert.ok(t.includes(`${fmtFtIn(d.width + 2 * d.overhang)} roof`));
    assert.ok(t.some((s) => s.endsWith(' roof') && s.startsWith('about ')));
    assert.ok(t.includes('FRONT') && t.includes('RIDGE'));
    if (d.overhang > 0) assert.ok(t.includes(fmtIn(d.overhang)));
    for (const kind of ['door', 'window']) {
      const n = shed.framedOpenings.filter((o) => o.kind === kind).length;
      assert.equal((svg.match(new RegExp(`data-kind="${kind}"`, 'g')) || []).length, n, `${kind} marks`);
    }
    // Every mark sits on a wall line.
    for (const m of svg.matchAll(/<line x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"[^>]*data-kind="(?:door|window)"/g)) {
      const [x1, y1, x2, y2] = m.slice(1, 5).map(Number);
      const onWall = (x1 === x2 && (Math.abs(x1) < 0.01 || Math.abs(x1 - d.length) < 0.01)) || (y1 === y2 && (Math.abs(y1 - (d.width + d.overhang)) < 0.01 || Math.abs(y1 - d.overhang) < 0.01));
      assert.ok(onWall, m[0]);
    }
  });
}

test('elevations show the chosen door paint, blended shingle tabs, lap shadows and the eave shadow', () => {
  const shed = buildShed({ ...defaultDesign(), sidingType: 'fiber cement', sidingColor: 'sage', doorColor: 'navy', roofColor: 'gray-brown blend' });
  const front = elevationSvg(shed, 'front');
  assert.match(front, /<rect[^>]*fill="#263352"[^>]*data-kind="door"/, 'navy door');
  const tabFills = new Set([...front.matchAll(/<rect [^>]*fill="(#[0-9a-f]{6})" stroke="#[0-9a-f]{6}" stroke-width="0.15"/g)].map((m) => m[1]));
  assert.ok(tabFills.size > 10, `shingle tabs vary in shade (${tabFills.size} shades)`);
  assert.match(front, /fill="#000" fill-opacity="0.16"/, 'eave shadow');
  assert.match(elevationSvg(shed, 'left'), /fill="#000" fill-opacity="0.14"/, 'rake shadow');
  const html = packetHtml(shed);
  assert.match(html, /Roof: gray-brown blend/);
  assert.match(html, /Door: navy/);
  assert.match(html, /Siding: fiber cement lap siding|sage green paint/);
  // The same drawing every time: the tab pattern is seeded, not random.
  assert.equal(elevationSvg(shed, 'front'), front);
});

test('the packet\'s site sheet has no title block of its own, and the 3D corner shows the door', async () => {
  const { CORNERS, cornerFor, siteSheetSvg } = await import('./hoa.mjs');
  const lot = buildShed({ ...defaultDesign(), lotWidthFt: 60, lotDepthFt: 120, siteLeftFt: 6, siteRearFt: 8 });
  const svg = siteSheetSvg(lot);
  assert.match(svg, /<svg/);
  assert.doesNotMatch(svg, /Sheet \d+ of \d+|class="tb"/);
  assert.match(packetHtml(lot), /Add a north arrow/);
  // The default 8x12's door is on the front, its windows on the back.
  const d = defaultDesign();
  assert.equal(cornerFor(d), 'front-right');
  const doorLeft = { ...d, openings: d.openings.map((o) => (o.kind === 'door' ? { ...o, wall: 'left' } : o)) };
  assert.ok(CORNERS[cornerFor(doorLeft)].walls.includes('left'));
  const doorBack = { ...d, openings: d.openings.map((o) => (o.kind === 'door' ? { ...o, wall: 'back' } : o)) };
  assert.ok(CORNERS[cornerFor(doorBack)].walls.includes('back'));
  assert.equal(cornerFor(d, 'back-left'), 'back-left');
  assert.equal(cornerFor(d, 'nonsense'), 'front-right');
  assert.match(packetHtml(buildShed(d), { perspective: 'data:image/png;base64,AA', corner: 'front-left' }), /seen from the front and left side/);
});

test('no shingle tab in an elevation has a negative or zero width', () => {
  for (const make of Object.values(PRESETS)) {
    const shed = buildShed(make());
    for (const v of ['front', 'back', 'left', 'right']) {
      const widths = [...elevationSvg(shed, v).matchAll(/<rect [^>]*width="(-?[\d.]+)"/g)].map((m) => Number(m[1]));
      assert.ok(widths.every((w) => w > 0), `${shed.design.name} ${v}: ${widths.filter((w) => w <= 0).join(', ')}`);
    }
  }
});
