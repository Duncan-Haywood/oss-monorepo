// What the basement and skylight additions do on worked houses.
//   node eval/basement-example.mjs > eval/basement-example.txt
import { calculate, EXAMPLE } from '../load.mjs';

const fmt = x => Math.round(x).toLocaleString('en-US');

// A cold-climate house: the example ranch's rooms moved to 44°N (winter design
// -5 °F, annual mean 45 °F, ground swing 20 °F) over a 1,800 ft² conditioned
// basement, 30 x 60 ft, 8 ft ceiling, 6 ft below grade, 2 ft of exposed
// concrete above grade with four 6 ft² windows. Illustrative inputs, not a
// measured house.
const cold = { ...EXAMPLE.site, latitude: 44, heatingOutdoorF: -5, coolingOutdoorF: 88, coolingDewPointF: 66, annualMeanF: 45, groundAmplitudeF: 20 };
const basement = (wallR, floorR) => ({
  name: 'Basement', areaFt2: 1800, ceilingFt: 8, floor: 'basement', people: 0,
  basement: { depthFt: 6, wallLengthFt: 180, widthFt: 30 },
  walls: [{ facing: 'S', lengthFt: 60, heightFt: 2, windowFt2: 12 }, { facing: 'N', lengthFt: 60, heightFt: 2, windowFt2: 12 }, { facing: 'E', lengthFt: 30, heightFt: 2 }, { facing: 'W', lengthFt: 30, heightFt: 2 }],
});
const upstairs = EXAMPLE.rooms.map(r => ({ ...r, floor: 'conditioned' }));

console.log('Cold-climate ranch over a conditioned basement (44°N, -5 °F winter design, ground surface design 25 °F)\n');
console.log('| basement | wall R | floor R | below-grade walls | basement floor | basement total heat | house heat | house heat, same house on its slab |');
console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');
const slab = calculate({ site: cold, envelope: EXAMPLE.envelope, rooms: EXAMPLE.rooms });
for (const [wR, fR] of [[0, 0], [10, 0], [15, 0], [15, 10]]) {
  const r = calculate({ site: cold, envelope: { ...EXAMPLE.envelope, basementWallR: wR, basementFloorR: fR }, rooms: [...upstairs, basement(wR, fR)] });
  if (r.errors.length) throw new Error(r.errors.join('; '));
  const b = r.rooms.at(-1);
  console.log(`| 1,800 ft² | ${wR} | ${fR} | ${fmt(b.heating.belowGrade)} | ${fmt(b.heating.floor)} | ${fmt(b.heating.total)} | ${fmt(r.house.heating.total)} | ${fmt(slab.house.heating.total)} |`);
}

console.log('\nSkylights on the example ranch (36°N, July design day): two 2 x 4 ft skylights in the living room and kitchen\n');
console.log('| skylights | tilt, facing | house sensible peak | peak hour | skylight sun at peak | tons |');
console.log('| --- | --- | --- | --- | --- | --- |');
const add = (rooms, sky) => rooms.map(r => (['Living', 'Kitchen/dining'].includes(r.name) ? { ...r, skylights: [sky] } : r));
const base = calculate(EXAMPLE);
console.log(`| none | - | ${fmt(base.house.cooling.sensible)} | ${base.house.cooling.peakHour}:00 | 0 | ${base.house.coolingTons.toFixed(2)} |`);
for (const [tilt, facing] of [[0, 'S'], [18.4, 'S'], [18.4, 'N'], [18.4, 'W']]) {
  const r = calculate({ ...EXAMPLE, rooms: add(EXAMPLE.rooms, { areaFt2: 8, tiltDeg: tilt, facing }) });
  console.log(`| 2 x 8 ft² | ${tilt}°, ${tilt ? facing : 'flat'} | ${fmt(r.house.cooling.sensible)} | ${r.house.cooling.peakHour}:00 | ${fmt(r.house.cooling.components.skylightSolar)} | ${r.house.coolingTons.toFixed(2)} |`);
}
