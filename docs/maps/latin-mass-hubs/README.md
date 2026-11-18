# Traditional Latin Mass hubs in the US

Data and map for the post
[`docs/posts/2026-11-03-where-the-traditional-latin-mass-clusters-in-the-us.md`](../../posts/2026-11-03-where-the-traditional-latin-mass-clusters-in-the-us.md).

| File | What it is |
|---|---|
| `sources.csv` | 211 US locations, read on 2026-11-03 from each society's own list: [FSSP](https://fssp.com/locations-list/) (53), [ICKSP](https://institute-christ-king.org/) "Our Locations" (27), [SSPX District of the USA](https://sspx.org/en/list-sspx-chapels) (131). |
| `locations.csv` | The same rows with a latitude and longitude: the Census 2023 ZCTA centroid where the list gives a ZIP (every SSPX row and four others), otherwise the Census 2023 place internal point for the city. |
| `hubs.csv` | Clusters: the site with the most Mass-offering neighbours within 80 km becomes a centre, takes those neighbours, and the step repeats while a cluster has at least 3 sites. |
| `map.svg` | The map (Albers USA projection, light and dark). |
| `build.py` | Rebuilds the last three from `sources.csv`. Standard library only. |

Rebuild:

```sh
mkdir -p /tmp/gaz && cd /tmp/gaz
curl -sSLO https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_Gaz_place_national.zip
curl -sSLO https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_Gaz_zcta_national.zip
curl -sSLO https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json
unzip -o '*.zip' && cd -
python3 docs/maps/latin-mass-hubs/build.py --gazetteer /tmp/gaz --atlas /tmp/gaz/states-10m.json
```

## Limits

- **Diocesan Latin Masses are not included.** Most US Latin Masses are offered by
  diocesan priests in ordinary parishes. No list of those could be fetched (the
  main directory returned 403 to this session), so this map shows only the three
  priestly societies dedicated to the old rite. A diocesan directory would add many
  dots and could move the ranking.
- **A dot is a site, not a congregation size.** St. Marys, Kansas, the largest
  SSPX community in the country, is one triangle.
- 19 rows are houses with no Sunday Mass listed (SSPX priories, convents and the
  district house, the FSSP seminary and headquarters, the ICKSP headquarters).
  They are drawn but don't count toward hubs.
- Placement is at city or ZIP level. Three rows needed judgment, noted in
  `sources.csv`: the ICKSP Bay Area apostolate is placed in Oakland (from the
  page's link slug), St. Josaphat in Queens at the New York City point, and
  Cahokia in Cahokia Heights (the 2021 merger).
- The 80 km radius and the greedy clustering are choices. A different radius
  splits or merges hubs; the CSV lets you redo it.
- Some SSPX chapels are served monthly. The list doesn't say how often each
  site has Mass.
