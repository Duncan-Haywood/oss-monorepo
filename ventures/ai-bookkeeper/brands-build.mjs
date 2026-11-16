// Builds brands.mjs, the brand-name layer, from OpenStreetMap's name-suggestion-index (NSI,
// https://github.com/osmlab/name-suggestion-index, BSD-3-Clause). NSI lists about 50,000 chain
// names worldwide with the kind of place each one is (shop=supermarket, amenity=fuel,
// tourism=hotel). A bank line that starts with a known chain's name says what kind of merchant
// it is, even for a payee these books have never seen and on a file with no merchant code.
//
//   curl -sLo nsi.json https://cdn.jsdelivr.net/npm/name-suggestion-index@8.0.20261101/dist/json/nsi.min.json
//   for n in 10 20 35 40 50; do curl -sLO https://cdn.jsdelivr.net/npm/wordlist-english@1.2.1/english-words-$n.json; done
//   curl -sLo names.tgz https://files.pythonhosted.org/packages/44/4e/f9cb7ef2df0250f4ba3334fbdabaa94f9c88097089763d8e85ada8092f84/names-0.3.0.tar.gz
//   tar xzf names.tgz names-0.3.0/names/   (the 1990 US Census name lists, packaged by `names`, MIT)
//   node brands-build.mjs nsi.json english-words-{10,20,35,40,50}.json --names names-0.3.0/names > /tmp/brands.mjs && mv /tmp/brands.mjs brands.mjs
//   (not straight into brands.mjs: this file imports categorize.mjs, which imports brands.mjs)
//
// The word lists (SCOWL through wordlist-english, MIT) are read at build time only: a one-word
// name that is also a common English word ("Access", "Bell", "Advantage", "Shell", "Target") is
// dropped, because a bank line starting with that word is as often something else. The famous
// ones among them are already in BUILT_IN, which is tried first.
//
// The Census name lists (1990 US Census, public domain, through the `names` package, MIT) are read
// at build time only too: a one-word chain name that is also a person's first name or one of the
// 5,000 commonest surnames ("Albert", "Baxter", "Hampton", "Krystal") is listed in
// BRAND_PERSON_NAMES, and `brandAccount` takes it only when a store number follows it
// (README "Chain names that are people's names", 2026-11-15).
//
// CATEGORY_MAP was written on 2026-11-15 from the NSI category names and from how BUILT_IN
// (categorize.mjs) already files the same kinds of merchant (Kroger, Tesco and Aldi as meals,
// Home Depot and Screwfix as supplies, Royal Mail and USPS as office and postage), before any
// bank line was scored with it. A kind of place that fits two accounts (clothes, department
// and variety stores, pharmacies, electronics, furniture, banks, parking) is left out, so its
// names block a shorter mapped name but suggest nothing.
import { readFileSync } from "node:fs";
import { payeeTokens } from "./categorize.mjs";

export const CATEGORY_MAP = {
  // Meals: what BUILT_IN already does with grocers and restaurants.
  "amenity/fast_food": "6130", "amenity/restaurant": "6130", "amenity/cafe": "6130", "amenity/pub": "6130",
  "amenity/bar": "6130", "amenity/ice_cream": "6130", "shop/bakery": "6130", "shop/pastry": "6130",
  "shop/coffee": "6130", "shop/supermarket": "6130", "shop/convenience": "6130", "shop/deli": "6130",
  "shop/confectionery": "6130", "shop/greengrocer": "6130", "shop/butcher": "6130", "shop/frozen_food": "6130",
  // Travel.
  "tourism/hotel": "6120", "tourism/motel": "6120", "tourism/hostel": "6120", "amenity/car_rental": "6120",
  "shop/travel_agency": "6120",
  // Vehicle and fuel.
  "amenity/fuel": "6160", "amenity/charging_station": "6160", "amenity/car_wash": "6160", "shop/car_repair": "6160",
  "shop/car_parts": "6160", "shop/tyres": "6160", "amenity/vehicle_inspection": "6160",
  // Supplies and materials.
  "shop/doityourself": "6100", "shop/hardware": "6100", "shop/trade": "6100", "shop/paint": "6100",
  "shop/tool_hire": "6100", "shop/craft": "6100", "shop/garden_centre": "6100",
  // Office supplies and postage.
  "shop/stationery": "6070", "shop/copyshop": "6070", "amenity/post_office": "6070",
  // Shipping. Parcel lockers are left out: their brand names are the retailers that run them
  // (Amazon, AliExpress, Allegro).
  "office/logistics": "6180",
  // Utilities and phone.
  "shop/telecommunication": "6140", "office/telecommunication": "6140",
  // Insurance, rent.
  "office/insurance": "6030", "office/coworking": "6080", "shop/storage_rental": "6080",
};

// Names BUILT_IN measured and dropped as more often wrong than right (README "UK merchants in the
// built-in keywords": Halfords, NCP car parks, DVSA), and one read on the development set (South
// Lakeland, eval/southlakeland-pcard.mjs) before any held-out file was scored: none yet beyond those.
export const EXCLUDE = new Set(["halfords", "ncp", "dvsa"]);

// Transit networks and operators (2026-11-16). NSI's `transit/route/*` lists the public-transport
// networks and operators of every bus, train, metro, tram and ferry route it knows ("Long Island Rail
// Road", "SEPTA", "Toronto Transit Commission", "Metrolink"), each tagged `network` and `operator`
// (and short forms). A fare paid to one is travel (6120), as BUILT_IN files Uber and Amtrak. Written
// before any bank line was scored with it. The same filters as the chains apply (at least 4 letters,
// no one-word common English word, people's names only with a store number), plus:
export const TRANSIT_ROUTES = ["bus", "train", "subway", "light_rail", "tram", "trolleybus", "ferry", "monorail"];
export const TRANSIT_FIELDS = ["network", "operator", "network:short", "operator:short", "network:en", "operator:en"];
// Only a name that says it is a transport service is kept ("Long Island Rail Road", "Metrolink",
// "Flixbus", "Toronto Transit Commission"): NSI's network tags are often a bare place ("Renfrewshire",
// "Isle of Wight") or initials ("STAS", "CITA"), and a bank line starting with either is a council,
// a hotel or anything else as often as a fare. So SEPTA, Amtrak and Greyhound are not added here
// (Amtrak and Greyhound are already in BUILT_IN).
const TRANSIT_WORD = /(transit|metro|rail|bus|tram|ferry|ferries|ferrocarril|coach|train|transport|trasport|verkehr|bahn|subway|shuttle|trolley|streetcar|spoor|trein|dopravn|komunikac)/i;
// A city, county or ministry runs many services; a payment to one is tax, a permit, parking or
// rent as often as a fare. Such a name is kept only when it names the transit service itself
// ("King County Metro", "Beaumont Municipal Transit"), never when it is a department or ministry.
const GOVERNMENT = /\b(city|town|village|county|borough|state|province|provincial|municipal|municipality|council|commune|region|government|ministry|department|public works|gemeinde|stadt|ville|comune|kommune)\b/i;
const DEPARTMENT = /\b(government|ministry|department|public works|council|authority of the state)\b/i;
// Rail infrastructure owners sell no fares: a business pays them for access, land or wayleaves.
export const TRANSIT_EXCLUDE = new Set(["network rail", "hoofdrailnet nederland"]);
export function transitName(n) {
  if (!n || /^[a-z]{2}:/.test(n)) return false; // "ar:municipal" style placeholders
  if (TRANSIT_EXCLUDE.has(brandKey(n))) return false;
  if (!TRANSIT_WORD.test(n)) return false;
  return !(GOVERNMENT.test(n) && DEPARTMENT.test(n));
}

// Normalised the way the payee memory keys a line, so "SHELL OIL 57444" and "Shell" meet.
export const brandKey = (name) => payeeTokens(name).join(" ");

export const SURNAMES_KEPT = 5000;

// One-word mapped names that are also people's names (`people`: lower-case first names and surnames).
export function personNames(brands, people) {
  return [...brands].filter(([k, a]) => a && !k.includes(" ") && people.has(k)).map(([k]) => k).sort();
}

// The Census files: "SMITH  1.006  1.006  1", commonest first.
export function readCensusNames(dir) {
  const rd = (f, n) => readFileSync(`${dir}/${f}`, "utf8").trim().split("\n").slice(0, n).map((l) => l.split(/\s+/)[0].toLowerCase());
  return new Set([...rd("dist.male.first"), ...rd("dist.female.first"), ...rd("dist.all.last", SURNAMES_KEPT)].map(brandKey));
}

export function build(nsi, common = new Set(), { transitRoutes = true } = {}) {
  const seen = new Map(); // key -> Set of accounts ("" for an unmapped kind of place)
  for (const [cat, { items }] of Object.entries(nsi.nsi)) {
    const transit = transitRoutes && cat.startsWith("transit/route/") && TRANSIT_ROUTES.includes(cat.slice(14));
    if (!cat.startsWith("brands/") && !transit) continue;
    const account = transit ? "6120" : CATEGORY_MAP[cat.slice(7)] ?? "";
    for (const it of items) {
      const names = transit
        ? new Set(TRANSIT_FIELDS.map((f) => it.tags?.[f]).filter(transitName))
        : new Set([it.displayName, it.tags?.name, it.tags?.brand, it.tags?.["name:en"], it.tags?.["brand:en"], ...(it.matchNames ?? [])]);
      for (const n of names) {
        if (!n) continue;
        const k = brandKey(n);
        // Too short to be a name rather than a word or initials.
        if (k.replace(/ /g, "").length < 4) continue;
        // A one-word name that is a common word.
        if (!k.includes(" ") && common.has(k)) continue;
        if (EXCLUDE.has(k.split(" ")[0])) continue;
        if (!seen.has(k)) seen.set(k, new Set());
        seen.get(k).add(account);
      }
    }
  }
  // One account, or "" when the name is unmapped or the same name is two kinds of place.
  const out = new Map();
  for (const [k, s] of seen) out.set(k, s.size === 1 ? [...s][0] : "");
  // An unmapped name is kept only when it is a mapped name or extends one ("total wine" blocks
  // "total"), since the lookup takes the longest name a line starts with.
  const mappedPrefix = new Set();
  for (const [k, a] of out) if (a) mappedPrefix.add(k);
  for (const [k, a] of out) {
    if (a) continue;
    const t = k.split(" ");
    let keep = false;
    for (let i = 1; i <= t.length && !keep; i++) keep = mappedPrefix.has(t.slice(0, i).join(" "));
    if (!keep) out.delete(k);
  }
  return new Map([...out].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const nsi = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const args = process.argv.slice(3), ni = args.indexOf("--names");
  const namesDir = ni === -1 ? null : args.splice(ni, 2)[1];
  const noTransit = args.includes("--no-transit");
  if (noTransit) args.splice(args.indexOf("--no-transit"), 1);
  const common = new Set(args.flatMap((f) => JSON.parse(readFileSync(f, "utf8")).map((w) => w.toLowerCase())));
  const m = build(nsi, common, { transitRoutes: !noTransit });

  const people = namesDir ? personNames(m, readCensusNames(namesDir)) : [];
  const byAcct = {};
  for (const [k, a] of m) (byAcct[a] ??= []).push(k);
  const version = nsi._meta?.version ?? "unknown";
  let s = `// Generated by brands-build.mjs from OpenStreetMap's name-suggestion-index ${version}; do not edit by hand.
// ${m.size} chain names, grouped by account ("" = a name that blocks a shorter one but suggests nothing).
//
// The names come from the name-suggestion-index, used under its licence:
// Copyright 2026, name-suggestion-index contributors
// Redistribution and use in source and binary forms, with or without modification, are permitted
// provided that the following conditions are met: (1) Redistributions of source code must retain the
// above copyright notice, this list of conditions and the following disclaimer. (2) Redistributions in
// binary form must reproduce the above copyright notice, this list of conditions and the following
// disclaimer in the documentation and/or other materials provided with the distribution. (3) Neither
// the name of the copyright holder nor the names of its contributors may be used to endorse or promote
// products derived from this software without specific prior written permission.
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED
// WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A
// PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
// ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
// LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
// TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF
// ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
export const BRANDS_VERSION = ${JSON.stringify(version)};
export const BRAND_KINDS = ${JSON.stringify(byAcct).replace(/\],"/g, '],\n"')};
// One-word names above that are also a person's first name or a common surname (1990 US Census):
// taken only when a store number follows.
export const BRAND_PERSON_NAMES = ${JSON.stringify(people)};
`;
  process.stdout.write(s);
}
