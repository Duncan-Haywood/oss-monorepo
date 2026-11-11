// Loads source/CityData.mc and runs it -- the shipped Monkey C, not a port.
//
// There is no Connect IQ SDK in this repo, so the module is translated to JS
// by a small, strict set of rewrites that only cover the Monkey C subset
// CityData.mc uses (module/const/function/var, symbols, dictionaries,
// ternaries, integer + - * %, comparisons). Anything outside that subset
// throws instead of being guessed at, so a change to the .mc that this
// translator cannot represent faithfully fails the tests loudly.
//
// The Toybox API is emulated with the documented semantics the file relies
// on: Time.Moment/Duration are whole seconds since the Unix epoch,
// Gregorian.moment() builds a UTC moment, Gregorian.utcInfo() reads a moment's
// calendar fields as UTC, and day_of_week is 1 = Sunday .. 7 = Saturday.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const CITYDATA_PATH = fileURLToPath(new URL('../source/CityData.mc', import.meta.url));

class Moment {
  constructor(sec) {
    if (!Number.isInteger(sec)) throw new Error(`Moment needs whole seconds, got ${sec}`);
    this.sec = sec;
  }
  add(d) {
    if (!(d instanceof Duration)) throw new Error('Moment.add expects a Time.Duration');
    return new Moment(this.sec + d.sec);
  }
  value() { return this.sec; }
}
class Duration {
  constructor(sec) {
    if (!Number.isInteger(sec)) throw new Error(`Duration needs whole seconds, got ${sec}`);
    this.sec = sec;
  }
}
const FORMAT_SHORT = Symbol('FORMAT_SHORT');
const Time = Object.freeze({ Moment, Duration, FORMAT_SHORT });
const Gregorian = Object.freeze({
  moment(o) {
    const known = new Set(['year', 'month', 'day', 'hour', 'minute', 'second']);
    for (const k of Object.keys(o)) if (!known.has(k)) throw new Error(`Gregorian.moment: unknown key ${k}`);
    return new Moment(Date.UTC(o.year, o.month - 1, o.day, o.hour ?? 0, o.minute ?? 0, o.second ?? 0) / 1000);
  },
  utcInfo(m, fmt) {
    if (!(m instanceof Moment)) throw new Error('Gregorian.utcInfo expects a Moment');
    if (fmt !== FORMAT_SHORT) throw new Error('only FORMAT_SHORT is emulated');
    const d = new Date(m.sec * 1000);
    return Object.freeze({
      year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
      hour: d.getUTCHours(), min: d.getUTCMinutes(), sec: d.getUTCSeconds(),
      day_of_week: d.getUTCDay() + 1,
    });
  },
});

export function translate(mc) {
  // 1. drop // comments (no string in the file contains "//"; checked below)
  let code = mc.split('\n').map((line) => {
    const i = line.indexOf('//');
    if (i >= 0 && (line.slice(0, i).match(/"/g) ?? []).length % 2 === 1) {
      throw new Error(`"//" inside a string literal is not supported: ${line.trim()}`);
    }
    return i >= 0 ? line.slice(0, i) : line;
  }).join('\n');

  // 2. using-lines and the module wrapper
  code = code.replace(/^\s*using\s+[\w.]+(\s+as\s+\w+)?\s*;\s*$/gm, '');
  const mod = code.match(/^\s*module\s+CityData\s*\{([\s\S]*)\}\s*$/);
  if (!mod) throw new Error('expected exactly one `module CityData { ... }`');
  code = mod[1];

  // 3. refuse constructs whose Monkey C meaning differs from JS or that the
  //    rewrites below do not handle
  const refuse = [
    [/\//, 'division (Monkey C integer division differs from JS)'],
    [/\.format\(/, 'Number.format'],
    [/\b(class|new\s+(?!Time\.Duration\b)\w|instanceof|has|try|catch|throw|switch|for|while|do)\b/, 'unsupported keyword'],
    [/\b(Math|System|Sys|Lang|Application|WatchUi)\./, 'unemulated Toybox module'],
    [/\b\d+\.\d+/, 'floating-point literal'],
    [/\b\d+l\b/i, 'Long literal'],
  ];
  for (const [re, why] of refuse) {
    const m = code.match(re);
    if (m) throw new Error(`CityData.mc uses ${why}: "${m[0]}"`);
  }

  // 4. rewrites
  code = code
    .replace(/:([A-Za-z_]\w*)\s*=>/g, '$1:')        // { :key => v }  -> { key: v }
    .replace(/(?<![\w?])\s*:(?=[A-Za-z_])/g, (m) => m.replace(':', '¤')) // mark symbols
    .replace(/¤([A-Za-z_]\w*)/g, "'$1'")            // :sym -> 'sym'
    .replace(/\[\s*'(\w+)'\s*\]/g, "['$1']")
    .replace(/\bvar\b/g, 'let')
    .replace(/\.size\(\)/g, '.length');

  const names = [...code.matchAll(/\bfunction\s+(\w+)\s*\(/g)].map((m) => m[1]);
  if (!/\bconst\s+CITIES\s*=/.test(code)) throw new Error('CITIES table not found');
  return { code: `"use strict";\n${code}\nreturn { CITIES, ${names.join(', ')} };`, names };
}

export function loadCityData(path = CITYDATA_PATH) {
  const { code } = translate(readFileSync(path, 'utf8'));
  const mod = Function('Gregorian', 'Time', code)(Gregorian, Time);
  return {
    ...mod,
    // convenience: effective offset (seconds) at a UTC instant in ms
    offsetAt: (city, ms) => mod.effectiveOffsetSeconds(city, new Moment(Math.floor(ms / 1000))),
    localInfoAtMs: (i, ms) => mod.localInfoAt(i, new Moment(Math.floor(ms / 1000))),
  };
}
