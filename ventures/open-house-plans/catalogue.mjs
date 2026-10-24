// @ts-check
// The ready-made designs: each is only a brief. build-catalogue.mjs runs them
// through the engine and writes catalogue/<id>/ and catalogue-data.mjs; the
// page regenerates any of them, byte for byte, when someone downloads it.

export const CATALOGUE = [
  { id: "backyard-studio", name: "Backyard studio", blurb: "A studio ADU with a shed roof and a big front window: kitchen, bath, laundry and storage on one slab.", brief: { beds: 0, area: 420, style: "modern", priority: "budget" } },
  { id: "one-bed-cottage", name: "One-bedroom cottage", blurb: "A cottage with a steep roof, shingle siding and a gabled entry porch; good as an ADU or a first home.", brief: { beds: 1, area: 650, style: "cottage", priority: "beauty" } },
  { id: "two-bed-starter", name: "Two-bedroom starter", blurb: "The cheapest two-bedroom the search found near 900 sq ft: a 4:12 gable, a simple rectangle and a slab.", brief: { beds: 2, baths: 1, area: 900, style: "minimal", priority: "budget" } },
  { id: "two-bed-farmhouse", name: "Two-bedroom farmhouse", blurb: "Board-and-batten, a 9:12 metal roof and a full-width porch, and a primary suite with its own bath.", brief: { beds: 2, baths: 2, area: 1100, style: "farmhouse", priority: "beauty" } },
  { id: "two-bed-accessible", name: "Accessible two-bedroom", blurb: "One level, 36 in doors, a 42 in hall and a bath with room to turn a wheelchair.", brief: { beds: 2, baths: 2, area: 1150, style: "ranch", accessible: true } },
  { id: "three-bed-budget", name: "Three-bedroom on a budget", blurb: "Three bedrooms and two baths near 1,250 sq ft, laid out for the lowest cost per square foot the model finds.", brief: { beds: 3, baths: 2, area: 1250, style: "minimal", priority: "budget" } },
  { id: "three-bed-farmhouse", name: "Three-bedroom farmhouse", blurb: "The classic modern farmhouse: split bedrooms, a full-width porch and a great room.", brief: { beds: 3, baths: 2, area: 1400, style: "farmhouse", priority: "beauty" } },
  { id: "three-bed-craftsman", name: "Three-bedroom craftsman", blurb: "A craftsman bungalow on a crawlspace: deep eaves, lap siding, tapered porch columns.", brief: { beds: 3, baths: 2, area: 1450, style: "craftsman", foundation: "crawl", priority: "beauty" } },
  { id: "three-bed-modern", name: "Three-bedroom modern", blurb: "A low shed roof, vertical siding and a clerestory band over the great room, 9 ft ceilings.", brief: { beds: 3, baths: 2, area: 1500, style: "modern" } },
  { id: "four-bed-ranch-garage", name: "Four-bedroom ranch with garage", blurb: "A hip-roofed ranch with an attached two-car garage, a mudroom and a primary suite.", brief: { beds: 4, baths: 2.5, area: 1800, style: "ranch", garage: 2 } },
  { id: "four-bed-craftsman", name: "Four-bedroom craftsman", blurb: "Four bedrooms and three baths, the primary suite apart from the others.", brief: { beds: 4, baths: 3, area: 2000, style: "craftsman", priority: "beauty" } },
  { id: "five-bed-farmhouse", name: "Five-bedroom farmhouse", blurb: "A big family farmhouse: five bedrooms, three and a half baths, a mudroom and a two-car garage.", brief: { beds: 5, baths: 3.5, area: 2300, style: "farmhouse", garage: 2 } },
];
