---
title: "Where the Traditional Latin Mass clusters in the US"
seo_title: "Traditional Latin Mass hubs in the US: FSSP, ICKSP and SSPX map"
date: 2026-11-03
tags: [maps, data, catholic, latin-mass]
description: "A map of the 211 US locations of the three priestly societies that offer the Traditional Latin Mass, and the 12 metro areas where they cluster."
---

Three priestly societies are dedicated to the Traditional Latin Mass, the pre-1970 Roman rite, and each publishes a list of where it serves. The Priestly Fraternity of St. Peter (FSSP) lists 53 US locations, the Institute of Christ the King Sovereign Priest (ICKSP) lists 27, and the Society of St. Pius X (SSPX) lists 131. We read all three lists on 3 November 2026, placed each site with Census 2023 gazetteer coordinates, and looked for clusters: three or more sites that offer Mass within 80 km (about 50 miles) of one centre.

**[The map (SVG)](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/maps/latin-mass-hubs/map.svg)** shows every site, with a different colour and shape for each society, and rings the hubs. The data and the script that draws it are in `docs/maps/latin-mass-hubs/`.

## The hubs

The 12 largest clusters, by sites that offer Mass:

| Hub | Sites | FSSP | ICKSP | SSPX |
|---|---|---|---|---|
| New York–North Jersey | 6 | 1 | 2 | 3 |
| Spokane–Coeur d'Alene | 5 | 1 | 0 | 4 |
| Cleveland–Akron–Youngstown | 5 | 1 | 1 | 3 |
| Los Angeles | 4 | 2 | 0 | 2 |
| Dallas–Fort Worth | 4 | 2 | 0 | 2 |
| San Francisco Bay Area | 4 | 0 | 2 | 2 |
| Chicago–NW Indiana | 4 | 1 | 1 | 2 |
| Southern New England (Worcester, Providence, Boston's west, Hartford) | 4 | 1 | 1 | 2 |
| Milwaukee–Rockford | 4 | 0 | 3 | 1 |
| Twin Cities–St. Cloud | 4 | 1 | 0 | 3 |
| Fort Myers–Naples | 3 | 2 | 0 | 1 |
| Kansas City | 3 | 1 | 1 | 1 |

Eleven more clusters of three follow: Lincoln–Omaha, Philadelphia–Allentown, Houston, Seattle–Tacoma, Bridgeport–Waterbury, St. Louis, Detroit, Pittsburgh, Quincy–northeast Missouri, Miami–Palm Beach and Green Bay–Sheboygan. All 23 are listed in `hubs.csv`.

## What the map shows

- **There is no single capital.** The biggest cluster has six sites. The societies spread out to reach people rather than concentrating.
- **Only five hubs have all three societies:** New York–North Jersey, Cleveland–Youngstown, Chicago–NW Indiana, Southern New England and Kansas City.
- **Each society has its own geography.** The ICKSP is concentrated around the Great Lakes, with 12 of its 27 US sites in Wisconsin, Illinois, Indiana, Michigan and Ohio, five of them in Wisconsin alone. The FSSP is strong in the Plains and the South (Nebraska, Oklahoma, Texas, Florida). The SSPX has the widest reach, as the only one of the three in states like Montana, Oregon, Tennessee and North Carolina.
- **The Chicago–Milwaukee corridor is the densest region** once the two clusters the method splits it into are added together: eight Mass sites, plus the ICKSP's US headquarters in Chicago.
- **Eight states have no site from any of the three:** Alabama, Delaware, Maine, Mississippi, South Carolina, Utah, Vermont and Wyoming. California (16 sites), Texas (14) and Florida (11) have the most.

## What it does not show

This is not a count of every Latin Mass in the US. Most are offered by diocesan priests in ordinary parishes, and we could not fetch a directory of those, so they are left out. A diocesan list would add many dots and could reorder the hubs.

A dot is a site, not a congregation size. St. Marys, Kansas, often described as the largest SSPX community in the country, is a single triangle. Some SSPX chapels are served once a month, and the lists don't say how often each site has Mass. 19 listed houses with no Sunday Mass (priories, convents, seminaries, headquarters) are drawn but not counted.

The 80 km radius and the clustering method are choices. At 40 km only eight hubs remain and Dallas–Fort Worth drops out. At 130 km the Chicago, NW Indiana and Milwaukee sites merge into one hub of eight. `build.py` takes the CSV and redraws the map in a second, so it is easy to redo with other settings.

Sources: [FSSP locations list](https://fssp.com/locations-list/), [ICKSP "Our Locations"](https://institute-christ-king.org/), [SSPX District of the USA chapel list](https://sspx.org/en/list-sspx-chapels), and US Census Bureau 2023 Gazetteer files for coordinates.
