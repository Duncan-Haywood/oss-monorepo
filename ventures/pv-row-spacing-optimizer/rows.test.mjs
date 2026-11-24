import { test } from "node:test";
import assert from "node:assert/strict";
import { shadedFraction, beamLossShare, skyViewFactor, trackerRotation, shadeFreePitch, simulate } from "./rows.mjs";
import { clearSkyYear } from "./weather.mjs";

const RAD = Math.PI / 180;

test("sky view factor: closed form equals the integral over the face, and the open field at wide spacing", () => {
  for (const tilt of [0, 10, 25, 40, 60]) {
    for (const gcr of [0.2, 0.4, 0.7]) {
      const p = 1 / gcr, b = tilt * RAD;
      let s = 0;
      const N = 20000;
      for (let k = 0; k < N; k++) {
        const t = (k + 0.5) / N;
        const dx = p - Math.cos(b) * (1 - t), dy = Math.sin(b) * (1 - t);
        s += (1 + Math.cos(Math.atan2(dy, dx) + b)) / 2;
      }
      assert.ok(Math.abs(s / N - skyViewFactor(tilt, gcr)) < 1e-6, `${tilt} ${gcr}`);
    }
    assert.ok(Math.abs(skyViewFactor(tilt, 1e-4) - (1 + Math.cos(tilt * RAD)) / 2) < 1e-3);
  }
  assert.equal(skyViewFactor(0, 0.5), 1);
});

test("shaded fraction: none at the shade-free pitch, some inside it, none with the sun behind or the rows flat", () => {
  const tilt = 30, b = tilt * RAD;
  const s = { toward: 0.6, up: 0.4 };
  const norm = Math.hypot(s.toward, s.up);
  const sT = s.toward / norm, sU = s.up / norm;
  const cosAoi = sT * Math.sin(b) + sU * Math.cos(b);
  const p0 = shadeFreePitch(sT, sU, tilt);
  assert.ok(shadedFraction(sU, cosAoi, 1 / p0) < 1e-12);
  assert.ok(shadedFraction(sU, cosAoi, 1 / (p0 * 0.9)) > 0);
  // Hand case: tilt 0 never shades; sun at the tilt angle behind the row is edge-on.
  assert.equal(shadedFraction(0.5, 0.5, 0.9), 0);
  assert.equal(shadedFraction(0.5, 0, 0.5), 0);
  // fs = 1 - sU / (GCR cos AOI): sun 20 deg high straight ahead, tilt 30, GCR 0.5.
  const up = Math.sin(20 * RAD), ahead = Math.cos(20 * RAD);
  const c = ahead * Math.sin(b) + up * Math.cos(b);
  assert.ok(Math.abs(shadedFraction(up, c, 0.5) - (1 - up / (0.5 * c))) < 1e-15);
});

test("electrical bands round a shadow up to whole substrings", () => {
  assert.equal(beamLossShare(0.01, 2), 0.5);
  assert.equal(beamLossShare(0.5, 2), 0.5);
  assert.equal(beamLossShare(0.51, 2), 1);
  assert.equal(beamLossShare(0.2, 0), 0.2);
  assert.equal(beamLossShare(0, 4), 0);
});

test("backtracking keeps rows out of each other's shadow; true tracking does not", () => {
  for (let el = 2; el < 60; el += 3) {
    const sC = Math.cos(el * RAD), sU = Math.sin(el * RAD);
    const th = trackerRotation(sC, sU, 0.4, 60, true);
    const cosAoi = sC * Math.sin(th * RAD) + sU * Math.cos(th * RAD);
    assert.ok(shadedFraction(sU, cosAoi, 0.4) < 1e-9, `el ${el}`);
  }
  const th = trackerRotation(Math.cos(10 * RAD), Math.sin(10 * RAD), 0.4, 60, false);
  assert.equal(th, 60);
  assert.ok(shadedFraction(Math.sin(10 * RAD), Math.cos(10 * RAD) * Math.sin(th * RAD) + Math.sin(10 * RAD) * Math.cos(th * RAD), 0.4) > 0.3);
});

test("a year on rows: yield falls as rows tighten, never above an isolated row; backtracking loses no beam to shade", () => {
  const w = clearSkyYear({ lat: 40, lon: -105, altitude: 1600 });
  const fixed = { kind: "fixed", tilt: 30, azimuth: 180 };
  const iso = simulate(w, fixed, 0).kwhPerKwp;
  let prev = iso;
  for (const gcr of [0.2, 0.3, 0.4, 0.5, 0.6, 0.7]) {
    const y = simulate(w, fixed, gcr).kwhPerKwp;
    assert.ok(y <= prev + 1e-9, `gcr ${gcr}`);
    prev = y;
  }
  assert.ok(iso > 1700 && iso < 2300, `clear-sky yield ${iso}`);
  const bt = simulate(w, { kind: "tracker", axisAzimuth: 180, maxAngle: 60, backtrack: true }, 0.4);
  assert.ok(bt.poa.shadeLost < 1e-6);
  const tt = simulate(w, { kind: "tracker", axisAzimuth: 180, maxAngle: 60, backtrack: false }, 0.4);
  assert.ok(tt.poa.shadeLost > 10);
  // Bands make shading cost more, never less.
  assert.ok(simulate(w, fixed, 0.6, { bands: 2 }).kwhPerKwp < simulate(w, fixed, 0.6, { bands: 0 }).kwhPerKwp);
});
