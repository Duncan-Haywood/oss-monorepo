#!/usr/bin/env python3
"""Geocode the Traditional Latin Mass locations in sources.csv, find hubs, draw map.svg.

Inputs (downloaded once, not committed; see README.md):
  --gazetteer DIR   Census 2023 Gazetteer files 2023_Gaz_place_national.txt and
                    2023_Gaz_zcta_national.txt
  --atlas FILE      us-atlas@3.0.1 states-10m.json (TopoJSON of state outlines)

Outputs, next to this script: locations.csv (sources.csv plus lat/lon),
hubs.csv (clusters of sites within RADIUS_KM of a centre), map.svg.
Standard library only.
"""
import argparse, csv, json, math, re
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
RADIUS_KM = 80  # roughly a 50-mile drive: how far people travel for a Sunday Mass
SOC = {  # colour validated with the dataviz palette checker; shape is the secondary encoding
    'FSSP': ('#2a78d6', 'circle', 'Priestly Fraternity of St. Peter (FSSP)'),
    'ICKSP': ('#eb6834', 'square', 'Institute of Christ the King (ICKSP)'),
    'SSPX': ('#1baf7a', 'triangle', 'Society of St. Pius X (SSPX)'),
}
SUFFIX = re.compile(r' (city|town|village|CDP|borough|municipality|city and borough|'
                    r'consolidated government \(balance\)|metro government \(balance\)|'
                    r'unified government \(balance\)|metropolitan government \(balance\)|urban county)$')


def norm(s):
    s = s.lower().replace('saint ', 'st. ').replace('é', 'e')
    return re.sub(r'[^a-z0-9. ]', '', s).strip()


def load_gazetteer(d):
    places, zips = {}, {}
    with open(d / '2023_Gaz_place_national.txt', encoding='latin-1') as f:
        for r in csv.DictReader(f, delimiter='\t'):
            r = {k.strip(): v.strip() for k, v in r.items()}
            key = (r['USPS'], norm(SUFFIX.sub('', r['NAME'])))
            # keep the largest place of a duplicated name (e.g. a city over a CDP)
            if key not in places or float(r['ALAND_SQMI']) > places[key][2]:
                places[key] = (float(r['INTPTLAT']), float(r['INTPTLONG']), float(r['ALAND_SQMI']))
    with open(d / '2023_Gaz_zcta_national.txt', encoding='latin-1') as f:
        for r in csv.DictReader(f, delimiter='\t'):
            r = {k.strip(): v.strip() for k, v in r.items()}
            zips[r['GEOID']] = (float(r['INTPTLAT']), float(r['INTPTLONG']))
    return places, zips


ALIAS = {('KY', 'Lexington'): 'Lexington-Fayette'}  # Census names it as a merged government


def geocode(rows, places, zips):
    out, missing = [], []
    for r in rows:
        ll = None
        if r['zip'] and r['zip'] in zips:
            ll, how = zips[r['zip']], 'zcta'
        else:
            city = ALIAS.get((r['state'], r['city']), r['city'])
            p = places.get((r['state'], norm(city)))
            if p:
                ll, how = p[:2], 'place'
        if not ll:
            missing.append(f"{r['society']} {r['city']}, {r['state']}")
            continue
        out.append({**r, 'lat': f'{ll[0]:.5f}', 'lon': f'{ll[1]:.5f}', 'geocoded_by': how})
    if missing:
        raise SystemExit('not geocoded: ' + '; '.join(missing))
    return out


def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def hubs(rows):
    """Greedy: take the site with the most Mass-offering neighbours within RADIUS_KM,
    claim them as one hub, repeat. Houses with no Sunday Mass listed do not count."""
    pts = [r for r in rows if r['kind'] in ('apostolate', 'mass centre')]
    ll = [(float(r['lat']), float(r['lon'])) for r in pts]
    left = set(range(len(pts)))
    found = []
    while left:
        best = max(left, key=lambda i: (sum(km(ll[i], ll[j]) <= RADIUS_KM for j in left), -i))
        members = [j for j in left if km(ll[best], ll[j]) <= RADIUS_KM]
        if len(members) < 3:
            break
        left -= set(members)
        socs = Counter(pts[j]['society'] for j in members)
        cities = Counter(f"{pts[j]['city']}, {pts[j]['state']}" for j in members)
        lat = sum(ll[j][0] for j in members) / len(members)
        lon = sum(ll[j][1] for j in members) / len(members)
        found.append(dict(centre=f"{pts[best]['city']}, {pts[best]['state']}", sites=len(members),
                          FSSP=socs['FSSP'], ICKSP=socs['ICKSP'], SSPX=socs['SSPX'],
                          societies=len(socs), lat=f'{lat:.4f}', lon=f'{lon:.4f}',
                          places='; '.join(c for c, _ in cities.most_common())))
    return found


# ---- projection: Albers equal-area conic, with Alaska and Hawaii insets ----
def albers(lon0, lat0, p1, p2):
    n = (math.sin(math.radians(p1)) + math.sin(math.radians(p2))) / 2
    C = math.cos(math.radians(p1)) ** 2 + 2 * n * math.sin(math.radians(p1))
    r0 = math.sqrt(C - 2 * n * math.sin(math.radians(lat0))) / n

    def f(lon, lat):
        t = n * math.radians(lon - lon0)
        r = math.sqrt(max(C - 2 * n * math.sin(math.radians(lat)), 0)) / n
        return r * math.sin(t), r0 - r * math.cos(t)
    return f


# Same parameters as d3.geoAlbersUsa at scale 1070 (lower 48, Alaska at 0.35x, Hawaii).
K, CX, CY = 1070, 487.5, 300
W, H = 975, 690
_L48 = albers(-96, 0, 29.5, 45.5)
_AK = albers(-154, 0, 55, 65)
_HI = albers(-157, 0, 8, 18)


def _centred(f, lon, lat, clon, clat, k, tx, ty):
    x, y = f(lon, lat)
    x0, y0 = f(clon, clat)
    return k * (x - x0) + tx, -k * (y - y0) + ty


def proj(lon, lat):
    if lat > 50 and lon < -129:  # Alaska
        return _centred(_AK, lon, lat, -156, 58.5, 0.35 * K, CX - 0.307 * K, CY + 0.201 * K)
    if lat < 23 and lon < -150:  # Hawaii
        return _centred(_HI, lon, lat, -160, 19.9, K, CX - 0.205 * K, CY + 0.212 * K)
    return _centred(_L48, lon, lat, -96.6, 38.7, K, CX, CY)


def state_paths(atlas):
    topo = json.loads(Path(atlas).read_text())
    sx, sy = topo['transform']['scale']
    tx, ty = topo['transform']['translate']
    arcs = []
    for a in topo['arcs']:
        x = y = 0
        pts = []
        for dx, dy in a:
            x += dx; y += dy
            pts.append((x * sx + tx, y * sy + ty))
        arcs.append(pts)

    def ring(idx):
        pts = []
        for i in idx:
            seg = arcs[i] if i >= 0 else arcs[~i][::-1]
            pts.extend(seg[1:] if pts else seg)
        return pts

    out = []
    for g in topo['objects']['states']['geometries']:
        if g['id'] in ('60', '66', '69', '72', '78'):  # territories: no listed sites
            continue
        polys = g['arcs'] if g['type'] == 'MultiPolygon' else [g['arcs']]
        d = []
        for poly in polys:
            for r in poly:
                p = [proj(lon, lat) for lon, lat in ring(r)]
                d.append('M' + 'L'.join(f'{x:.1f},{y:.1f}' for x, y in p) + 'Z')
        out.append(''.join(d))
    return out


def marker(shape, x, y, color, title):
    t = f'<title>{esc(title)}</title>'
    if shape == 'circle':
        return f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4.2" fill="{color}" class="m">{t}</circle>'
    if shape == 'square':
        return f'<rect x="{x-3.8:.1f}" y="{y-3.8:.1f}" width="7.6" height="7.6" rx="1.2" fill="{color}" class="m">{t}</rect>'
    return (f'<path d="M{x:.1f},{y-5:.1f}L{x+4.6:.1f},{y+3.4:.1f}L{x-4.6:.1f},{y+3.4:.1f}Z" '
            f'fill="{color}" class="m">{t}</path>')


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


def svg(rows, hub_rows, states, labels):
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" '
         f'aria-labelledby="t d" font-family="system-ui,-apple-system,Segoe UI,sans-serif">',
         '<title id="t">Traditional Latin Mass locations of the FSSP, ICKSP and SSPX in the United States</title>',
         f'<desc id="d">{len(rows)} locations listed on the three societies\' own websites in November 2026, '
         f'with the {len(labels)} largest clusters within {RADIUS_KM} km ringed. Diocesan Latin Masses are not shown.</desc>',
         '<style>.s{fill:#efeeea;stroke:#fcfcfb;stroke-width:1}.m{stroke:#fcfcfb;stroke-width:1.2}'
         '.h{fill:none;stroke:#52514e;stroke-width:1.2;stroke-dasharray:3 2}'
         '.l{font-size:12px;fill:#0b0b0b;font-weight:600;paint-order:stroke;stroke:#fcfcfb;stroke-width:3px}'
         '.k{font-size:12px;fill:#52514e}'
         '@media (prefers-color-scheme:dark){.bg{fill:#1a1a19}.s{fill:#2c2c2a;stroke:#1a1a19}'
         '.m{stroke:#1a1a19}.h{stroke:#c3c2b7}.l{fill:#f0efec;stroke:#1a1a19}.k{fill:#c3c2b7}}</style>',
         f'<rect class="bg" width="{W}" height="{H}" fill="#fcfcfb"/>']
    o.append('<text class="l" x="24" y="34" style="font-size:17px">Traditional Latin Mass sites of the three '
             'priestly societies, and where they cluster</text>')
    o += [f'<path class="s" d="{d}"/>' for d in states]
    for h in labels:
        x, y = proj(float(h['lon']), float(h['lat']))
        r = 9 + 2.6 * math.sqrt(h['sites'])
        o.append(f'<circle class="h" cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}"/>')
    order = {'SSPX': 0, 'FSSP': 1, 'ICKSP': 2}
    for r in sorted(rows, key=lambda r: order[r['society']]):
        c, shape, _ = SOC[r['society']]
        x, y = proj(float(r['lon']), float(r['lat']))
        o.append(marker(shape, x, y, c, f"{r['society']}: {r['name']}, {r['city']}, {r['state']}"))
    for h in labels:
        x, y = proj(float(h['lon']), float(h['lat']))
        r = 9 + 2.6 * math.sqrt(h['sites'])
        dx, dy, anchor = h['offset']
        o.append(f'<text class="l" x="{x + dx * (r + 3):.1f}" y="{y + dy * (r + 3) + 4:.1f}" '
                 f'text-anchor="{anchor}">{esc(h["label"])} · {h["sites"]}</text>')
    y0 = H - 62
    counts = Counter(r['society'] for r in rows)
    for i, (k, (c, shape, name)) in enumerate(SOC.items()):
        x0 = 24 + (i % 2) * 400
        y = y0 + (i // 2) * 20
        o.append(marker(shape, x0, y, c, name))
        o.append(f'<text class="k" x="{x0 + 12}" y="{y + 4}">{esc(name)}: {counts[k]}</text>')
    o.append(f'<circle class="h" cx="424" cy="{y0 + 20}" r="6"/>'
             f'<text class="k" x="436" y="{y0 + 24}">Hub: 3+ Mass sites within {RADIUS_KM} km (label: name · sites)</text>')
    o.append(f'<text class="k" x="24" y="{H - 12}">Sources: fssp.com, '
             'institute-christ-king.org, sspx.org (Nov 2026). Diocesan Latin Masses not shown.</text>')
    o.append('</svg>')
    return '\n'.join(o) + '\n'


# Display names and label placement (dx, dy, anchor) for the hubs, keyed by centre.
LABELS = {
    'Pequannock, NJ': ('New York–North Jersey', (1, 0.3, 'start')),
    'Post Falls, ID': ("Spokane–Coeur d'Alene", (1, 0, 'start')),
    'Akron, OH': ('Cleveland–Youngstown', (0, -1, 'middle')),
    'Los Angeles, CA': ('Los Angeles', (-0.8, 0.9, 'end')),
    'Dallas, TX': ('Dallas–Fort Worth', (1, 0, 'start')),
    'Oakland, CA': ('SF Bay Area', (-1, 0, 'end')),
    'Merrillville, IN': ('Chicago–NW Indiana', (0.3, 1.6, 'start')),
    'Warren, MA': ('Southern New England', (0.4, -1.2, 'end')),
    'Burlington, WI': ('Milwaukee–Rockford', (-1, -0.6, 'end')),
    'Oak Grove, MN': ('Twin Cities', (-1, 0, 'end')),
    'Fort Myers, FL': ('Fort Myers–Naples', (-1, 0, 'end')),
    'Westwood, KS': ('Kansas City', (-1, 0.2, 'end')),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--gazetteer', type=Path, required=True)
    ap.add_argument('--atlas', type=Path, required=True)
    ap.add_argument('--top', type=int, default=12)
    a = ap.parse_args()
    rows = list(csv.DictReader(open(HERE / 'sources.csv', newline='')))
    places, zips = load_gazetteer(a.gazetteer)
    loc = geocode(rows, places, zips)
    with open(HERE / 'locations.csv', 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(loc[0]))
        w.writeheader(); w.writerows(loc)
    hb = hubs(loc)
    with open(HERE / 'hubs.csv', 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(hb[0]))
        w.writeheader(); w.writerows(hb)
    labels = []
    for h in hb[:a.top]:
        name, off = LABELS.get(h['centre'], (h['centre'], (1, 0, 'start')))
        labels.append({**h, 'label': name, 'offset': off})
    (HERE / 'map.svg').write_text(svg(loc, hb, state_paths(a.atlas), labels))
    for h in hb:
        print(f"{h['sites']:3} {h['centre']:28} FSSP {h['FSSP']} ICKSP {h['ICKSP']} SSPX {h['SSPX']} | {h['places']}")


if __name__ == '__main__':
    main()
