// The engine against pvlib-python 0.16.1 (check/pvlib_reference.py writes
// the reference file; see its docstring for what each section is).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sunPosition, clearSky } from "./solar.mjs";
import { shadedFraction, trackerRotation, skyViewFactor } from "./rows.mjs";
import { clearSkyYear } from "./weather.mjs";

const ref = JSON.parse(readFileSync(new URL("./check/pvlib_reference.json", import.meta.url), "utf8"));
const RAD = Math.PI / 180;
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const vec = (zen, az) => ({ e: Math.sin(zen * RAD) * Math.sin(az * RAD), n: Math.sin(zen * RAD) * Math.cos(az * RAD), u: Math.cos(zen * RAD) });

test("sun position is within 0.02 deg of pvlib's SPA (300 instants, 2000-2040, latitudes to 60 deg)", () => {
  let worstZ = 0, worstA = 0;
  for (const r of ref.sun) {
    const p = sunPosition(r.ms, r.lat, r.lon);
    worstZ = Math.max(worstZ, Math.abs(p.zenith - r.zenith));
    if (r.zenith < 89) worstA = Math.max(worstA, angDiff(p.azimuth, r.azimuth) * Math.sin(r.zenith * RAD));
    if (r.apparentZenith < 88) assert.ok(Math.abs(p.apparentZenith - r.apparentZenith) < 0.03, JSON.stringify(r));
  }
  assert.ok(worstZ < 0.02, `zenith ${worstZ}`);
  assert.ok(worstA < 0.02, `azimuth (scaled by sin zenith) ${worstA}`);
});

test("clear sky matches pvlib's Ineichen-Perez to 0.01 W/m2 at the same zenith", () => {
  for (const r of ref.clearsky) {
    const c = clearSky(r.apparentZenith, r.doy, r.tl, r.altitude);
    for (const k of ["ghi", "dni", "dhi"]) assert.ok(Math.abs(c[k] - r[k]) < 0.01, `${k} ${c[k]} vs ${r[k]}`);
  }
});

test("fixed-row shaded fraction matches pvlib.shading.shaded_fraction1d (300 cases)", () => {
  let checked = 0;
  for (const r of ref.shade) {
    const s = vec(r.zenith, r.azimuth);
    const b = r.tilt * RAD, f = r.facing * RAD;
    const cosAoi = s.e * Math.sin(f) * Math.sin(b) + s.n * Math.cos(f) * Math.sin(b) + s.u * Math.cos(b);
    // pvlib returns a shadow on the front face even with the sun behind the
    // row; there is no beam on the face then, so only lit faces are compared.
    if (!(cosAoi > 0)) continue;
    checked++;
    assert.ok(Math.abs(shadedFraction(s.u, cosAoi, r.gcr) - r.fs) < 1e-9, JSON.stringify(r));
  }
  assert.ok(checked > 150, `${checked} lit cases`);
});

test("tracker rotation matches pvlib.tracking.singleaxis with and without backtracking", () => {
  for (const r of ref.tracker) {
    const s = vec(r.zenith, r.azimuth);
    const c = (r.axisAzimuth + 90) * RAD;
    const sC = s.e * Math.sin(c) + s.n * Math.cos(c);
    for (const [key, bt] of [["bt", true], ["true", false]]) {
      if (r[key] === null) continue;
      const th = trackerRotation(sC, s.u, r.gcr, r.maxAngle, bt);
      assert.ok(Math.abs(th - r[key]) < 1e-6, `${key} ${th} vs ${r[key]} ${JSON.stringify(r)}`);
    }
  }
});

test("a clear-sky year on rows: direct and sky diffuse within 0.1% of pvlib infinite_sheds", () => {
  const a = ref.annual;
  const w = clearSkyYear({ lat: a.site.lat, lon: a.site.lon, altitude: a.site.altitude, linkeTurbidity: a.site.tl });
  assert.ok(Math.abs(w.annual.ghi - a.ghi) / a.ghi < 0.002, `ghi ${w.annual.ghi} vs ${a.ghi}`);
  for (const cs of a.cases) {
    let direct = 0, sky = 0;
    for (const i of w.day) {
      let tilt, cosAoi;
      if (cs.kind === "fixed") {
        tilt = cs.tilt;
        cosAoi = -w.sN[i] * Math.sin(tilt * RAD) + w.sU[i] * Math.cos(tilt * RAD);
      } else {
        const sC = -w.sE[i]; // axis azimuth 180: cross-axis direction is west
        const th = trackerRotation(sC, w.sU[i], cs.gcr, 60, true);
        tilt = Math.abs(th);
        cosAoi = sC * Math.sin(th * RAD) + w.sU[i] * Math.cos(th * RAD);
      }
      if (cosAoi > 0) direct += w.dni[i] * cosAoi * (1 - shadedFraction(w.sU[i], cosAoi, cs.gcr));
      sky += w.dhi[i] * skyViewFactor(tilt, cs.gcr);
    }
    direct /= 1000; sky /= 1000;
    assert.ok(Math.abs(direct - cs.direct) / cs.direct < 0.001, `${JSON.stringify(cs)} direct ${direct}`);
    assert.ok(Math.abs(sky - cs.sky) / cs.sky < 0.001, `${JSON.stringify(cs)} sky ${sky}`);
  }
});
