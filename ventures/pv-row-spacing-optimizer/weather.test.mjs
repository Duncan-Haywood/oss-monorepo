import { test } from "node:test";
import assert from "node:assert/strict";
import { clearSkyYear, parseWeatherFile } from "./weather.mjs";

// One clear-sky year, written out in each file layout, must read back as the
// same weather (within the rounding of the written values).
const LAT = 39.74, LON = -105.18, TZ = -7;
const ref = clearSkyYear({ lat: LAT, lon: LON, altitude: 1800, linkeTurbidity: 3 });
const hours = [];
for (let h = 0; h < 8760; h++) {
  const ms = Date.UTC(2025, 0, 1) + h * 3600000 + 1800000; // middle of each UTC hour
  hours.push({ ms, ghi: ref.ghi[h], dni: ref.dni[h], dhi: ref.dhi[h] });
}
const pad = (n, w = 2) => String(n).padStart(w, "0");
const close = (w) => {
  assert.equal(w.sU.length, 8760);
  assert.ok(Math.abs(w.annual.ghi - ref.annual.ghi) / ref.annual.ghi < 0.002, `${w.annual.ghi} vs ${ref.annual.ghi}`);
  assert.ok(Math.abs(w.annual.dni - ref.annual.dni) / ref.annual.dni < 0.01, `${w.annual.dni} vs ${ref.annual.dni}`);
};

test("PVGIS TMY CSV: header lat/lon, UTC stamps, months from mixed years re-dated", () => {
  const lines = [`Latitude (decimal degrees):\t${LAT}`, `Longitude (decimal degrees):\t${LON}`, "Elevation (m):\t1800", "time(UTC),T2m,RH,G(h),Gb(n),Gd(h),IR(h),WS10m,WD10m,SP"];
  for (const r of hours) {
    const d = new Date(r.ms);
    const year = d.getUTCMonth() % 2 ? 2012 : 2007;
    lines.push(`${year}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}:${pad(d.getUTCHours())}${pad(d.getUTCMinutes())},12.5,50,${r.ghi.toFixed(2)},${r.dni.toFixed(2)},${r.dhi.toFixed(2)},300,2,180,84000`);
  }
  lines.push("T2m: 2-m air temperature (degree Celsius)");
  const w = parseWeatherFile(lines.join("\n"), { lat: 10, lon: 10 });
  close(w);
  assert.equal(w.source, "PVGIS TMY");
  assert.equal(w.lat, LAT);
  assert.equal(w.tair[100], 12.5);
  assert.ok(w.notes.some((n) => /file's latitude/.test(n)));
});

test("NSRDB CSV: metadata rows, local standard time", () => {
  const lines = ["Source,Location ID,City,State,Country,Latitude,Longitude,Time Zone,Elevation", `NSRDB,1,-,-,-,${LAT},${LON},${TZ},1800`, "Year,Month,Day,Hour,Minute,Temperature,GHI,DNI,DHI"];
  for (const r of hours) {
    const d = new Date(r.ms + TZ * 3600000);
    lines.push(`2025,${d.getUTCMonth() + 1},${d.getUTCDate()},${d.getUTCHours()},${d.getUTCMinutes()},5,${Math.round(r.ghi)},${Math.round(r.dni)},${Math.round(r.dhi)}`);
  }
  const w = parseWeatherFile(lines.join("\n"));
  close(w);
  assert.equal(w.source, "NSRDB");
  assert.deepEqual(w.notes, []);
});

test("TMY3: station line, hour-ending local stamps sampled 30 minutes earlier", () => {
  const lines = [`724666,"DENVER",CO,${TZ}.0,${LAT},${LON},1800`, "Date (MM/DD/YYYY),Time (HH:MM),ETR (W/m^2),ETRN (W/m^2),GHI (W/m^2),GHI source,GHI uncert (%),DNI (W/m^2),DNI source,DNI uncert (%),DHI (W/m^2),DHI source,DHI uncert (%),Dry-bulb (C)"];
  for (const r of hours) {
    const end = new Date(r.ms + 1800000 + TZ * 3600000); // stamp = end of the hour, local
    let mo = end.getUTCMonth() + 1, dy = end.getUTCDate(), hh = end.getUTCHours();
    if (hh === 0) { const prev = new Date(end.getTime() - 3600000); mo = prev.getUTCMonth() + 1; dy = prev.getUTCDate(); hh = 24; }
    lines.push(`${pad(mo)}/${pad(dy)}/1995,${pad(hh)}:00,0,0,${Math.round(r.ghi)},1,0,${Math.round(r.dni)},1,0,${Math.round(r.dhi)},1,0,-3.5`);
  }
  const w = parseWeatherFile(lines.join("\n"));
  close(w);
  assert.equal(w.source, "TMY3");
  assert.equal(w.tair[0], -3.5);
});

test("generic CSV: ISO timestamps with Z, or naive ones in a typed time zone", () => {
  const z = ["timestamp,ghi,dni,dhi,temp_air", ...hours.map((r) => `${new Date(r.ms).toISOString().slice(0, 16)}Z,${r.ghi},${r.dni},${r.dhi},20`)];
  close(parseWeatherFile(z.join("\n"), { lat: LAT, lon: LON }));
  const naive = ["time,GHI,DNI,DHI", ...hours.map((r) => `${new Date(r.ms + TZ * 3600000).toISOString().slice(0, 16).replace("T", " ")},${r.ghi},${r.dni},${r.dhi}`)];
  const w = parseWeatherFile(naive.join("\n"), { lat: LAT, lon: LON, tzHours: TZ });
  close(w);
  assert.deepEqual(w.notes, []);
  // The same file read as UTC puts the beam seven hours off: flagged.
  const wrong = parseWeatherFile(naive.join("\n"), { lat: LAT, lon: LON, tzHours: 0 });
  assert.ok(wrong.notes.some((n) => /sun is computed to be down/.test(n)));
});

test("refusals: part of a year, daily data, no weather columns, no location", () => {
  const half = ["timestamp,ghi,dni,dhi", ...hours.slice(0, 4000).map((r) => `${new Date(r.ms).toISOString()},${r.ghi},${r.dni},${r.dhi}`)];
  assert.throws(() => parseWeatherFile(half.join("\n"), { lat: LAT, lon: LON }), /full year/);
  const daily = ["timestamp,ghi,dni,dhi", ...Array.from({ length: 365 }, (_, d) => `${new Date(Date.UTC(2025, 0, 1 + d)).toISOString()},200,300,80`)];
  assert.throws(() => parseWeatherFile(daily.join("\n"), { lat: LAT, lon: LON }), /hourly or finer/);
  assert.throws(() => parseWeatherFile("a,b,c\n1,2,3", { lat: LAT, lon: LON }), /No weather columns/);
  const z = ["timestamp,ghi,dni,dhi", ...hours.map((r) => `${new Date(r.ms).toISOString()},${r.ghi},${r.dni},${r.dhi}`)];
  assert.throws(() => parseWeatherFile(z.join("\n"), {}), /Latitude and longitude/);
});
