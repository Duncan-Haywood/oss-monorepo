// @ts-check
// Starting prices, each with where it came from. These are national-chain
// (Home Depot) listings found on 2026-10-29. Most were read from the search
// result's copy of the product page because the product pages refuse automated
// fetches, so a price can be days or weeks old and differs by store; the page
// says so and links each one. Every price is editable on the page.
//
// A board length with no listing of its own is priced at the per-foot rate of
// the nearest listed length of the same lumber, and says so. Items with no
// listing at all are marked as estimates.

/** @typedef {{ price: number, url?: string, store?: string, seen?: string, note: string, kind: 'listed' | 'derived' | 'estimate' }} Priced */

const HD = 'Home Depot';
const SEEN = '2026-10-29';
const SNIP = 'price read from the search result for this product page';

/** Listed boards: material -> length in ft -> listing. */
export const LISTED_LUMBER = {
  '2x4': {
    8: { price: 4.15, url: 'https://www.homedepot.com/p/2-in-x-4-in-x-8-ft-Prime-Stud-058449/312528776', note: `${SNIP}; other listings $3.85-$4.25` },
    10: { price: 7.72, url: 'https://www.homedepot.com/p/2-in-x-4-in-x-10-ft-2-and-BTR-S-Dry-Spruce-Pine-Fir-Lumber-0133160/303335795', note: SNIP },
    12: { price: 8.46, url: 'https://www.homedepot.com/p/2-in-x-4-in-x-12-ft-Premium-Kiln-Dried-Heat-Treated-Whitewood-Dimensional-Lumber-244S12P/319459507', note: SNIP },
    16: { price: 13.17, url: 'https://www.homedepot.com/p/2-in-x-4-in-x-16-ft-2-Premium-Grade-SPF-Dimensional-Lumber-0133166/303335813', note: SNIP },
    14: { price: 8.32, url: 'https://www.homedepot.com/p/2-in-x-4-in-x-14-ft-2-Premium-Grade-SPF-Dimensional-Lumber-161675/100023769', note: `price read from a search result for this product page; the category page showed $9.32; $7.49 each for 35 or more`, bulk: { min: 35, price: 7.49 } },
  },
  '2x6': {
    8: { price: 6.83, url: 'https://www.homedepot.com/p/2-in-x-6-in-x-8-ft-2-Premium-Grade-SPF-Dimensional-Lumber-0200352/203445784', note: `${SNIP}; listings vary $6.75-$9.62` },
    12: { price: 10.68, url: 'https://www.homedepot.com/p/2-in-x-6-in-x-12-ft-2-and-Better-PRIME-Kiln-Dried-Heat-Treated-Spruce-Pine-Fir-Lumber-S206SE-1-12/311720641', note: SNIP },
    16: { price: 14.34, url: 'https://www.homedepot.com/p/2-in-x-6-in-x-16-ft-2-Premium-Grade-SPF-Dimensional-Lumber-058447/312528849', note: SNIP },
    10: { price: 12.48, url: 'https://www.homedepot.com/p/2-in-x-6-in-x-10-ft-Better-Prime-Douglas-Fir-Lumber-2023-10/206019464', note: `price read from a search result for this product page (Douglas fir; SPF 2x6x10 copies showed $9.07-$12.47); $11.23 each for 35 or more`, bulk: { min: 35, price: 11.23 } },
    14: { price: 14.78, url: 'https://www.homedepot.com/p/2-in-x-6-in-x-14-ft-Premium-Kiln-Dried-Heat-Treated-Whitewood-Dimensional-Lumber-161772/100035171', note: `the higher of the prices read from search results for this page ($12.54-$14.78)` },
  },
  '2x8': {
    12: { price: 12.34, url: 'https://www.homedepot.com/p/2-in-x-8-in-x-12-ft-2-Premium-Grade-Southern-Yellow-Pine-Dimensional-Lumber-560499/202085927', note: `${SNIP}; Southern yellow pine; other copies of the page show $15.38-$15.52` },
    8: { price: 10.25, url: 'https://www.homedepot.com/b/Lumber-Composites-Dimensional-Lumber/2x8/N-5yc1vZc3tcZ1z0ywxx', note: `the higher of $8.22-$10.25 read from a search result for the Home Depot category page (model 689238, Southern yellow pine)` },
    10: { price: 12.82, url: 'https://www.homedepot.com/b/Lumber-Composites-Dimensional-Lumber-Framing-Lumber/2x8/N-5yc1vZc55wZ1z0ywxx', note: `the higher of $10.28-$12.82 read from a search result for the Home Depot category page (model 689246)` },
    16: { price: 21.76, url: 'https://www.homedepot.com/p/2-in-x-8-in-x-16-ft-SYP-2-Standard-Grade-Dimensional-Lumber-581968/316632061', note: `the higher of $16.46-$21.76 read from search results for this page; bulk price for 24 or more seen at $14.81-$19.58` },
  },
  '2x10': {
    12: { price: 25.46, url: 'https://www.homedepot.com/p/2-in-x-10-in-x-12-ft-2-Premium-Grade-Fir-Dimensional-Lumber-603708/206182035', note: `${SNIP}; Douglas fir (western pricing); pine is often cheaper` },
    10: { price: 21.76, url: 'https://www.homedepot.com/b/Lumber-Composites-Dimensional-Lumber/2x10/10-ft/N-5yc1vZc3tcZ1z0ywxpZ1z1rkse', note: `the higher of $20.98-$21.76 read from a search result for the Home Depot category page (Douglas fir, model 734446); a pine 2x10x10 showed $16.32` },
    16: { price: 27.54, url: 'https://www.homedepot.com/p/2-in-x-10-in-x-16-ft-2-Premium-Grade-Southern-Yellow-Pine-Dimensional-Lumber-852-562/326965961', note: `the higher of $27.38-$27.54 read from search results for this page` },
  },
  'PT 2x6': {
    12: { price: 14.18, url: 'https://www.homedepot.com/p/WeatherShield-2-in-x-6-in-x-12-ft-2-Prime-Ground-Contact-Pressure-Treated-Southern-Yellow-Pine-Lumber-253921/206967802', note: `${SNIP}; ground contact` },
    16: { price: 19.48, url: 'https://www.homedepot.com/p/WeatherShield-2-in-x-6-in-x-16-ft-2-Prime-Ground-Contact-Pressure-Treated-Southern-Yellow-Pine-Lumber-253921/206967797', note: `${SNIP}; ground contact` },
    8: { price: 10.98, url: 'https://www.homedepot.com/p/WeatherShield-2-in-x-6-in-x-8-ft-2-Prime-Ground-Contact-Pressure-Treated-Lumber-262P8/206936146', note: `the higher of $9.68-$10.98 read from search results for this page; ground contact` },
    10: { price: 12.28, url: 'https://www.homedepot.com/b/Lumber-Composites-Pressure-Treated-Lumber/10-ft/N-5yc1vZc3srZ1z1rkse', note: `the commonest price ($10.28-$13.48 seen) read from a search result for the Home Depot category page; ground contact; $11.05 each for 32 or more`, bulk: { min: 32, price: 11.05 } },
  },
  'PT 4x4': {
    12: { price: 22.88, url: 'https://www.homedepot.com/p/4-in-x-4-in-x-12-ft-2-Pressure-Treated-Ground-Contact-Southern-Pine-Timber-4230254/100073070', note: `${SNIP}; ground contact` },
    8: { price: 11.28, url: 'https://www.homedepot.com/p/4-in-x-4-in-x-8-ft-2-Ground-Contact-Pressure-Treated-Southern-Yellow-Pine-Wood-Post-194354/205220341', note: `price read from a search result for this product page; ground contact; $10.15 each for 50 or more`, bulk: { min: 50, price: 10.15 } },
    10: { price: 19.68, url: 'https://www.homedepot.com/p/4-in-x-4-in-x-10-ft-2-Ground-Contact-Pressure-Treated-Timber-288741/301913694', note: `the higher of $16.78-$19.68 read from search results for this page; ground contact` },
  },
  'PT 4x6': {
    12: { price: 32.88, url: 'https://www.homedepot.com/p/4-in-x-6-in-x-12-ft-2-Pressure-Treated-Ground-Contact-Southern-Pine-Timber-260430/100062638', note: `${SNIP}; ground contact` },
    8: { price: 24.18, url: 'https://www.homedepot.com/p/4-in-x-6-in-x-8-ft-2-Ground-Contact-Pressure-Treated-Timber-259270/100026579', note: `price read from an old copy of this page in search results; ground contact; $21.76 each for 20 or more`, bulk: { min: 20, price: 21.76 } },
  },
};

/** For lumber with no listing at all: the listed lumber whose per-foot rate it is scaled from, and by how much. */
const UNLISTED = {
  '2x12': ['2x10', 1.25], 'PT 2x4': ['PT 2x6', 0.7], 'PT 2x8': ['PT 2x6', 1.35], 'PT 2x10': ['PT 2x6', 1.75], 'PT 2x12': ['PT 2x6', 2.2],
};

/** Listed items, keyed as in lumber.mjs EXAMPLE_ITEMS; `per` divides a listing into the unit the estimate counts. */
export const LISTED_ITEMS = {
  floorSheet: { price: 49.53, url: 'https://www.homedepot.com/p/Plytanium-23-32-in-x-4-ft-x-8-ft-Southern-Pine-Tongue-and-Groove-Plywood-Sheathing-605189/100003769', note: `${SNIP}; 23/32" tongue-and-groove` },
  roofSheet: { price: 11.68, url: 'https://www.homedepot.com/p/OSB-7-16-in-Sheathing-Panel-Application-as-4-ft-x-8-ft-386081/202106230', note: `${SNIP}; listings vary $10.38-$14.98` },
  siding8: { price: 46.78, url: 'https://www.homedepot.com/p/reviews/Plytanium-Plywood-Siding-Panel-T1-11-8-IN-OC-Nominal-19-32-in-x-4-ft-x-8-ft-Actual-0-563-in-x-48-in-x-96-in-113699/100000016/2', note: `${SNIP} (the product's reviews page); another copy of the product page showed $43.98` },
  shingleBundle: { price: 40.47, url: 'https://www.homedepot.com/p/Owens-Corning-TruDefinition-Duration-Algae-Resistant-Estate-Gray-Laminate-Architectural-Shingles-32-8-sq-ft-per-Bundle-TD20/205655964', note: `${SNIP}; 32.8 sq ft per bundle` },
  underlayment: { price: 119, url: 'https://www.homedepot.com/p/GAF-FeltBuster-1000-sq-ft-Synthetic-Roofing-Underlayment-Roll-0973/205035868', note: `${SNIP}; one roll covers 1,000 sq ft` },
  dripEdge: { price: 11.98, url: 'https://www.homedepot.com/p/Amerimax-Home-Products-F5-5S-x-10-ft-White-Aluminum-Drip-Edge-Flashing-5511600120/100074238', note: `${SNIP}; cheaper profiles $7.68-$8.48` },
  fasciaTrim: { price: 23.52, url: 'https://www.homedepot.com/p/PrimeLinx-1-in-x-6-in-x-12-ft-Radiata-Pine-Finger-Joint-Primed-Board-253192/304798235', note: `${SNIP}; finger-jointed primed board` },
  soffitPanel: { price: 20.68, url: 'https://www.homedepot.com/p/Ply-Gem-Economy-T4-12-75-in-x-12-ft-White-Vinyl-Vented-Soffit-EVS12P-04/306292522', note: `${SNIP}; 12-3/4" x 12 ft vented vinyl` },
  hurricaneTie: { price: 0.58, url: 'https://www.homedepot.com/p/Simpson-Strong-Tie-H2-5A-18-Gauge-Galvanized-Hurricane-Tie-H2-5A/203302239', note: `${SNIP}; Simpson H2.5A` },
  // A rafter meets a ridge beam at the roof's slope. Simpson rates its standard face-mount hangers
  // (LUS among them) at table load only for joists sloped up to 1/4:12, and sends steeper ones to
  // technical bulletin T-C-SLOPEJST or a sloped hanger (face-mount hanger guide:
  // https://cdn.shopify.com/s/files/1/0398/5188/4705/files/Face-Mount_Hanger.pdf). The LSU/LSSU
  // hangers are field-adjustable for slopes up to 45 degrees, so a 4/12 to 12/12 rafter takes one.
  rafterHanger: { price: 6.56, seen: '2026-10-30', url: 'https://www.homedepot.com/p/Simpson-Strong-Tie-LSU-ZMAX-Galvanized-Adjustable-Light-Slopeable-Skewable-U-Hanger-for-2x6-LSU26Z/100375313', note: 'read 2026-10-30 from a search result for this page (Simpson LSU26Z, internet 100375313); its embedded offer was dated valid to 2025-10-03, so it may be stale; $6.23 each for 50 or more; the plain-galvanized LSU26 (internet 100375129) showed $5.47 but out of stock. Simpson sizes it for 2x6; for 2x4 rafters check Simpson\'s catalogue for the fit', bulk: { min: 50, price: 6.23 } },
  rafterHanger28: { price: 11.47, seen: '2026-10-30', url: 'https://www.homedepot.com/p/Simpson-Strong-Tie-2-in-x-8-in-18-Gauge-Light-Adjustable-U-Joist-Hanger-LSSU28/100375379', note: 'read 2026-10-30 from an undated search result for this page (Simpson LSSU28, internet 100375379)' },
  rafterHanger210: { price: 10.71, seen: '2026-10-30', url: 'https://www.homedepot.com/p/Simpson-Strong-Tie-LSSU-Light-Field-Adjustable-Face-Mount-Hanger-for-2x10-LSSU210/100374915', note: 'read 2026-10-30 from an undated search result for this page (Simpson LSSU210, internet 100374915, SKU 755674)' },
  gableVent: { price: 22.98, url: 'https://www.homedepot.com/p/Gibraltar-Building-Products-12-in-x-12-in-Square-White-Galvanized-Steel-Built-in-Screen-Gable-Louver-Vent-GLFF1212WH-1-8/310198861', note: `${SNIP}; a 12x12 vent, the nearest listed size` },
  lpPanel: { price: 39.96, url: 'https://www.homedepot.com/p/LP-SmartSide-SmartSide-38-Series-8-in-Application-as-4-ft-x-8-ft-Cedar-Texture-OC-Panel-Engineered-Treated-Wood-Siding-27874/100055901', note: `${SNIP}; LP SmartSide 38 Series 3/8" 4x8 panel; other copies of the page showed $42.78-$53.58` },
  lpPanel76: { price: 64.88, url: 'https://www.homedepot.com/p/LP-SmartSide-LP-SmartSide-Cedar-Texture-Panel-OC-Engineered-Treated-Wood-Siding-4-in-Application-as-7-16-in-x-4-ft-x-8-ft-25831/100089302', note: `${SNIP}; LP SmartSide 76 Series 7/16" 4x8, model 25831; another copy of the page showed $41.98` },
  trim1x4x8: { price: 10.58, url: 'https://www.homedepot.com/p/PrimeLinx-1-in-x-4-in-x-8-ft-Radiata-Pine-Finger-Joint-Primed-Board-252978/304819679', note: `${SNIP}; PrimeLinx finger-joint primed, model 252978; copies showed $8.58-$10.58` },
  trim1x4x12: { price: 15.25, url: 'https://www.homedepot.com/p/PrimeLinx-1-in-x-4-in-x-12-ft-Radiata-Pine-Finger-Joint-Primed-Board-253128/304798035', note: `${SNIP}; PrimeLinx finger-joint primed, model 253128` },
  trim1x4x16: { price: 21.34, url: 'https://www.homedepot.com/p/1-in-x-4-in-x-16-ft-Primed-Pine-Finger-Joint-Board-702636/307424572', note: `${SNIP}; primed pine finger-joint, model 702636` },
  framingNails: { price: 25.2, url: 'https://www.homedepot.com/p/Grip-Rite-3-1-2-in-x-8-Gauge-16-penny-Exterior-Galvanized-Steel-Common-Nails-5-lb-Box-16HGC5/202308475', note: `${SNIP}; Grip-Rite 16HGC5` },
  sheathingNails: { price: 26.85, url: 'https://www.homedepot.com/p/Everbilt-2-1-2-in-x-8D-Hot-Dipped-Galvanized-Common-Nails-5-lbs-478-Count-EB0054155/328605368', note: `${SNIP}; Everbilt EB0054155, 478 nails` },
  sidingNails: { price: 5.57, url: 'https://www.homedepot.com/p/Everbilt-2-1-2-in-x-8D-Hot-Dipped-Galvanized-Siding-1-lbs-140-Count-EB0004158/328604774', note: `${SNIP}; Everbilt EB0004158, 140 nails; another copy showed $6.98` },
  sidingNails5: { price: 18.87, url: 'https://www.homedepot.com/p/Grip-Rite-2-1-2-in-x-11-1-2-Gauge-8-penny-Exterior-Galvanized-Spiral-Shank-Siding-Nails-5-lb-Box-8HGSTHS5/202308593', note: 'the higher of $15.98-$18.87 read 2026-10-30 from search-result copies of Home Depot category pages; Grip-Rite 8HGSTHS5, about 770 nails (the count Lowe\'s gives for the same model)' },
  roofingNails: { price: 15.5, url: 'https://www.homedepot.com/p/PRO-FIT-1-1-4-in-Electro-Galvanized-Roofing-Nails-5-lbs-Box-0132075/318170189', note: `${SNIP}; PRO-FIT 0132075` },
  trimNails: { price: 9.98, url: 'https://www.homedepot.com/p/321812794', note: `${SNIP}; Everbilt 816630, about 168 nails` },
  connectorNails: { price: 4.88, url: 'https://homedepot.com/p/Simpson-Strong-Tie-Strong-Drive-1-1-2-in-x-0-148-in-SCN-Smooth-Shank-HDG-Connector-Nail-120-Pack-N10DHDG-R/206101770', note: `${SNIP}; Simpson N10DHDG-R` },
  caulk: { price: 5.61, url: 'https://homedepot.com/p/100035980', note: `${SNIP}; DAP Dynaflex 230 white, model 18275` },
  zFlashing: { price: 7.33, store: 'DK Hardware', url: 'https://www.dkhardware.com/amerimax-5651100120-roof-flashing-drip-cap-5-8-w-x-10-ft-l-galvanized-steel-silver-silver-product-5607192.html', note: 'Amerimax 5651100120; no Home Depot or Lowe\'s price was readable (Home Depot sells Gibraltar 17845 at https://www.homedepot.com/p/Gibraltar-Building-Products-5-8-in-x-10-ft-Galvanized-Steel-Z-Flashing-17845/100319849)' },
  starterShingle: { price: 54.97, url: 'https://www.homedepot.com/p/GAF-Pro-Start-120-lin-ft-Eave-and-Rake-Roofing-Starter-Strip-Shingles-1126000/202052408', note: `${SNIP}; GAF Pro-Start 1126000, 120 lin ft` },
  ridgeCapShingle: { price: 61.09, url: 'https://homedepot.com/p/GAF-Seal-A-Ridge-Hickory-Hip-and-Ridge-Cap-Roofing-Shingles-25-Linear-ft-Per-Bundle-0850395/207158984', note: `${SNIP}; GAF Seal-A-Ridge 0850395, 25 lin ft` },
  tHinge: { price: 8.47, url: 'https://homedepot.com/p/Everbilt-8-in-Zinc-Plated-Gate-Tee-Hinge-15409/202034080', note: `${SNIP}; Everbilt 15409` },
  hasp: { price: 6.6, url: 'https://www.homedepot.com/p/Everbilt-4-1-2-in-Zinc-Plated-Adjustable-Staple-Safety-Hasp-24592/327600239', note: `${SNIP}; Everbilt 24592` },
  caneBolt: { price: 17.27, seen: '2026-10-30', url: 'https://homedepot.com/p/Everbilt-18-in-Zinc-Plated-Cane-Bolt-30027/326004712', note: 'read 2026-10-30 from search results for this page (Everbilt 30027); copies showed $17.27-$18.98, and the 20027 model $16.93' },
  doorPull: { price: 7.47, url: 'https://homedepot.com/p/Everbilt-6-1-2-in-Black-Polymer-Door-Pull-30057/326243297', note: `${SNIP}; Everbilt 30057` },
  deckBlock: { price: 10.47, url: 'https://www.homedepot.com/p/7-3-4-in-x-10-3-4-in-x-10-3-4-in-Concrete-Deck-Block-100002709/204827028', note: 'price read from the search result for the Home Depot category page; 10-3/4 x 10-3/4 x 7-3/4 in., model 100002709' },
  gravelTon: { price: 120, kind: 'estimate', store: 'Hello Gravel cost guide', url: 'https://hellogravel.com/guides/2025-gravel-prices-per-ton-complete-cost-guide-for-crushed-stone-pea-gravel-delivery/', note: 'low end of the guide\'s $120-$255 a ton delivered for #57 crushed stone (often a 3-ton minimum); picking it up at a quarry or yard usually costs less. Bagged, Quikrete all-purpose gravel is $8.99 per 0.5 cu ft at Ace (https://www.acehardware.com/departments/building-supplies/concrete-cement-and-masonry/sand-and-gravel/5419049), about $485 a cubic yard' },
  floorOSB: { price: 35.67, store: 'Home Depot (Uber Eats listing)', url: 'https://www.ubereats.com/store/the-home-depot-17111-statesville-road/1Tb7cROeXRiHt0g3Mzgczg/ec9b1de6-82aa-56a7-afaf-f64e28ecf566/9f41003a-b135-5c28-aecb-1ec5d8e8bbaf/89b91a4e-82ca-598e-9eaa-cf30fe47bb47', note: "LP Legacy Premium 23/32 T&G OSB subfloor as listed for one Home Depot store (Cornelius, NC) on Uber Eats, read from a search result; delivery listings can carry a markup and this one may be stale. Home Depot's own page showed no readable price" },
  paverBase: { price: 5.97, kind: 'estimate', url: 'https://www.homedepot.com/p/100580973', note: 'Pavestone 0.5 cu ft paver base (model 98001): $5.97 read from a category-page search result and matched to this item by its position on the page, so not certain' },
  landscapeFabric: { price: 13.96, url: 'https://homedepot.com/p/Dalen-3-ft-X-50-ft-Weed-Shield-Landscape-Fabric-and-Weed-Barrier-WS3-50/329107996', note: `${SNIP}; Dalen WS3-50, 3 x 50 ft` },
  handTamper: { price: 37.25, url: 'https://homedepot.com/p/WaLensee-48-in-Steel-Handle-8-in-x-8-in-Tamper-GS001/322932130', note: `${SNIP}; WaLensee GS001, 8 x 8 in.` },
  plateCompactor: { price: 125, store: 'Gertens (Minnesota)', url: 'https://www.gertens.com/wacker-plate-compactor', note: "price read from the search result for the rental page: $80 for 4 hours, $125 for 24 hours. Home Depot rents one (https://www.homedepot.com/tool-truck-rental/Vibratory-Plate-Compactor-20/0008708/) but shows the rate only once you pick a store" },
  trimPaintQt: { price: 25.98, seen: '2026-10-30', url: 'https://www.homedepot.com/p/BEHR-PREMIUM-PLUS-1-qt-Ultra-Pure-White-Semi-Gloss-Enamel-Exterior-Paint-Primer-505004/100193826', note: 'read 2026-10-30 from search results for this page (Behr Premium Plus exterior semi-gloss paint and primer, quart, model 505004); its offer was marked valid to 2026-10-18. Behr gives 250-400 sq ft a gallon' },
  trimPaintGal: { price: 48.98, seen: '2026-10-30', url: 'https://www.homedepot.com/p/BEHR-PREMIUM-PLUS-1-gal-Medium-Base-Semi-Gloss-Enamel-Exterior-Paint-Primer-540001/202301632', note: 'the commonest price ($39.72-$48.98, by colour) read 2026-10-30 from search results for Behr Premium Plus exterior semi-gloss gallons (model 540001 and colour pages)' },
  accentPaint: { price: 22.98, url: 'https://www.homedepot.com/p/BEHR-PREMIUM-PLUS-1-qt-W-B-400-Vermont-Cream-Satin-Enamel-Exterior-Paint-Primer-905004/311059379', note: `${SNIP}; Behr Premium Plus exterior, quart` },
  formTube: { price: 13.99, store: 'Ace Hardware', seen: '2026-10-30', url: 'https://www.acehardware.com/departments/building-supplies/concrete-cement-and-masonry/concrete-forms-and-accessories/5097282', note: "Ace's listing of the same Quikrete 12 x 48 in. tube, read from a search result on 2026-10-30. Home Depot (internet 100318546, model 692203: https://www.homedepot.com/p/100318546) and Lowe's (item 10150) list it but showed no readable price; other sellers listed $15.48-$22.99" },
  concreteBag: { price: 5.91, seen: '2026-10-30', url: 'https://www.homedepot.com/p/Quikrete-80-lb-Concrete-Mix-110180/100318511', note: 'read from a search result for the Home Depot concrete-mix category page on 2026-10-30, undated; $5.32 a bag for 42 or more. Quikrete states 0.60 cu ft a bag' },
  cmuBlock: { price: 2.85, url: 'https://www.homedepot.com/p/8-in-x-8-in-x-16-in-Concrete-Block-597767/202532685', note: `${SNIP}; model 597767, sold in select stores; regional versions showed $1.85-$2.78` },
  concreteBlock: { price: 2.67, url: 'https://www.homedepot.com/b/Building-Materials-Concrete-Cement-Masonry-Cinder-Blocks/N-5yc1vZcdpe', note: 'read from a search result for the Home Depot category page (4x8x16 solid block, model 30168621)' },
  interiorPanel: { price: 14.25, url: 'https://www.homedepot.com/b/Lumber-Composites/Hardboard/N-5yc1vZbqpgZ1z1wei7', note: 'read from a search result for the Home Depot category page: 1/8 in. tempered hardboard 4x8 (model 832777)' },
  glitter: { price: 7.98, url: 'https://www.homedepot.com/p/Glitter-Silver-Paint-Additive-300-1S/336145367', note: `${SNIP}; model 300-1S` },
  adhesive: { price: 8.98, url: 'https://www.homedepot.com/p/Loctite-PL-400-Subfloor-28-oz-All-Weather-Latex-Construction-Adhesive-Tan-Cartridge-each-2136221/300751977', note: `${SNIP}; Loctite PL 400 subfloor, 28 oz; $8.08 each for 12 or more`, bulk: { min: 12, price: 8.08 } },
  screws: { price: 10.97, url: 'https://www.homedepot.com/p/Grip-Rite-8-x-1-5-8-in-2-Phillips-Bugle-Head-Coarse-Thread-Coated-Exterior-Wood-Deck-Screws-1-lb-Box-PTN158S1/100192216', note: `${SNIP}; Grip-Rite #8 x 1-5/8 in. exterior screws, 1 lb box (model PTN158S1); the category page showed $8.97` },
  flashingTape: { price: 24.77, url: 'https://www.homedepot.com/p/Typar-4-in-x-75-ft-Butyl-Rubber-Copolmer-Window-and-Door-Flashing-Roll-BUTYL-001/302640122', note: `${SNIP}; Typar 4 in. x 75 ft butyl flashing` },
  shims: { price: 1.78, url: 'https://www.homedepot.com/p/8-in-Wood-Shims-12-Piece-per-Bundle-WSSHW08/300723328', note: `${SNIP}; 8 in. pine shims, 12 a bundle; the result did not tie the price firmly to this item` },
  lpPanel10: { price: 59.98, url: 'https://www.homedepot.com/b/Building-Materials-Siding/LP-SmartSide/N-5yc1vZaripZ6j2', note: 'read from a search result for the Home Depot LP SmartSide category page: 3/8 in. 4x10 cedar texture primed panel (model 25825)' },
  lpPanel76x9: { price: 85.48, url: 'https://www.homedepot.com/p/LP-SmartSide-SmartSide-76-Series-Cedar-Texture-Panel-8-in-OC-Engineered-Treated-Wood-Siding-Application-As-4-ft-x-9-ft-316207/202524764', note: `${SNIP}; model 316207; showed out of stock` },
  vinylJ: { price: 7.98, url: 'https://www.homedepot.com/p/Ply-Gem-5-8-in-x-1-1-2-in-x-12-6-ft-Pewter-J-Channel-VJC581NPH/202666288', note: `${SNIP}; Ply Gem J-channel, 12.6 ft; white $7.77-$8.48` },
  vinylStarter: { price: 9.48, url: 'https://www.homedepot.com/p/Ply-Gem-Vinyl-Starter-Strip-VS12-00/306293860', note: `${SNIP}; Ply Gem starter strip (VS12 00), taken as 12 ft from its model number` },
  vinylCorner: { price: 25.98, url: 'https://www.homedepot.com/p/Ply-Gem-3-in-x-3-4-in-White-Outside-Corner-Post-V0CP33404H/202666279', note: `the higher of $24.98-$25.98 read from search results for this page; Ply Gem outside corner post, taken as 10 ft` },
  vinylBox: { price: 169, url: 'https://www.homedepot.com/p/Double-4-5-in-x-145-in-White-Dutch-Lap-Vinyl-Siding-PCD4504H/301738325', note: `${SNIP}; one box covers 200 sq ft` },
  // Board and batten: exterior-rated treated engineered wood, not interior finger-joint pine.
  bbBoard: { price: 27.0, seen: '2026-10-30', url: 'https://www.homedepot.com/p/LP-SmartSide-SmartSide-440-Series-Cedar-Texture-Trim-Engineered-Treated-Wood-Siding-Application-As-6-in-x-16-ft-25882/202079509', note: 'read 2026-10-30 from a search result for this page (LP SmartSide 440 Series 4/4 x 6 in. x 16 ft, model 25882, internet 202079509); Stine Home + Yard listed it at $29.99' },
  bbBatten: { price: 19.98, seen: '2026-10-30', url: 'https://www.homedepot.com/p/LP-SmartSide-SmartSide-440-Series-Cedar-Texture-Trim-Engineered-Treated-Wood-Siding-Application-As-4-in-x-16-ft-25880/202079506', note: 'read 2026-10-30 from a search result for this page (LP SmartSide 440 Series 4/4 x 4 in. x 16 ft, model 25880), which showed it in stock; an older copy of the same page showed $24.77' },
  hardiePlank: { price: 9.68, url: 'https://www.homedepot.com/p/James-Hardie-Hardie-Plank-HZ10-6-25-in-x-144-in-Primed-Cedarmill-Fiber-Cement-Lap-Siding-215570/100075705', note: `${SNIP}; 6-1/4" x 12 ft plank, 5" exposure` },
  // Lap siding and what goes under it, from search-result copies seen 2026-10-30
  // (Home Depot's pages refuse automated reads). Several copies were months or
  // years old, which the notes say; check them at your store.
  lapHardie: { price: 12.48, seen: '2026-10-30', url: 'https://www.homedepot.com/p/James-Hardie-HardiePlank-HZ10-8-25-in-x-144-in-Primed-Cedarmill-Fiber-Cement-Lap-Siding-215572/100064049', note: 'the higher of $12.25-$12.48 in a cached search-result copy of this page (HZ10, model 215572); $10.61 each for 25 or more in the same copy. In a freeze-thaw climate James Hardie sells HZ5 instead: $17.98 here (model 6000265), $14.98 at Lowe\'s', bulk: { min: 25, price: 10.61 } },
  lapHardie5: { price: 17.98, seen: '2026-10-30', url: 'https://www.homedepot.com/p/James-Hardie-Hardie-Plank-HZ5-8-25-in-x-144-in-Primed-Cedarmill-Fiber-Cement-Lap-Siding-6000265/202035444', note: 'read 2026-10-30 from a search result for this page (HZ5, model 6000265, internet 202035444), a copy about 261 days old; $15.28 each for 25 or more in the same copy', bulk: { min: 25, price: 15.28 } },
  // 5/4 trim (about 1" thick), so lap siding butts into trim that stands proud of it.
  trim54Hardie: { price: 23.48, seen: '2026-10-30', url: 'https://www.homedepot.com/p/James-Hardie-Hardie-Trim-HZ10-1-in-x-3-5-in-x-12-ft-Primed-Smooth-Fiber-Cement-Trim-Board-216764/202699791', note: 'read 2026-10-30 from a search result for this page (HardieTrim HZ10 5/4, 1 x 3-1/2 in. x 12 ft primed smooth, model 216764), a copy about 261 days old; $19.96 each for 25 or more', bulk: { min: 25, price: 19.96 } },
  trim54LP: { price: 24.99, store: 'Stine Home + Yard', seen: '2026-10-30', url: 'https://www.stinehome.com/building-materials/house-siding/treated-engineered-wood-trim/lp-smartside-cedar-texture-540-trim---16-ft.-l-x-4-in.-w/012179.html', note: "LP SmartSide 540 Series cedar texture trim, 16 ft x 4 in., read 2026-10-30 from a search result for this regional chain's page. Home Depot lists the same trim (model 41161, internet 202535949) but no copy showed a price; Lowe's showed $24.98 for a 540 primed trim board (model 25891, item 209308) whose size the copy did not give" },
  lapLP12: { price: 11.28, seen: '2026-10-30', url: 'https://www.homedepot.com/p/LP-SmartSide-SmartSide-38-Series-Cedar-Texture-Lap-Engineered-Treated-Wood-Siding-Application-As-8-in-x-12-ft-28869/202057810', note: 'the higher of $10.92-$11.28 in search-result copies of this page (model 28869)' },
  lapLP16: { price: 15.48, seen: '2026-10-30', url: 'https://www.homedepot.com/p/202520473', note: 'category-page search copy about 133 days old (model 25797); an older copy of the product page showed $14.98' },
  houseWrap: { price: 38.93, seen: '2026-10-30', url: 'https://www.homedepot.com/p/3-ft-x-100-ft-Housewrap-539960203/339453275', note: `${SNIP}; Everbilt woven house wrap, 3 x 100 ft (300 sq ft)` },
  wrapTape: { price: 14.97, seen: '2026-10-30', url: 'https://homedepot.com/b/Hardware-Fasteners/house-wrap/N-5yc1vZc255Z1z1grr1', note: 'Tyvek tape 2 in x 164 ft (D13841470), read from a search-result copy of the category page' },
  capNails: { price: 22.45, seen: '2026-10-30', url: 'https://www.homedepot.com/p/PRO-FIT-1-in-Electro-Galvanized-Ring-Shank-Nail-with-Plastic-Cap-2000-Count-0135053/318170362', note: `${SNIP}; PRO-FIT 1 in. ring shank with plastic cap, 2,000 (model 0135053)` },
  jointFlashing: { price: 43.68, seen: '2026-10-30', url: 'https://www.homedepot.com/p/100064203', note: `${SNIP}; Amerimax 10 in x 50 ft aluminum coil (model 68010)` },
  metalPanel: { price: 19.98, url: 'https://homedepot.com/p/Gibraltar-Building-Products-8-ft-Corrugated-Galvanized-Steel-31-Gauge-Roof-Panel-13513/202092961', note: `${SNIP}; 8 ft corrugated panel, about 21-1/2" net cover (inferred)` },
  metalRidge: { price: 21.88, url: 'https://homedepot.com/p/Union-Corrugating-10-1-2-ft-x-14-in-29-Gauge-Galvanized-Steel-Black-Ridge-Cap-ST-RC-0812-003/322332805', note: `${SNIP}; 10-1/2 ft ridge cap` },
  stain: { price: 49.98, url: 'https://www.homedepot.com/p/BEHR-Premium-1-gal-Deep-Base-Solid-Color-Waterproofing-Stain-Sealer-501301/202263885', note: `${SNIP}; solid-colour exterior stain` },
  drywall: { price: 15.58, url: 'https://homedepot.com/b/Building-Materials-Drywall-Drywall-Sheets/4x8/N-5yc1vZbb52Z1z18jbl', note: `${SNIP} (category page); 1/2" UltraLight 4x8` },
  plywoodLining: { price: 27.56, url: 'https://www.homedepot.com/p/Plytanium-15-32-in-x-4-ft-x-8-ft-3-Ply-RTD-Sheathing-132411/100067329', note: `${SNIP}; 15/32" 4x8; listings vary $23.48-$29.23` },
  osbLining: { price: 11.68, url: 'https://www.homedepot.com/p/OSB-7-16-Application-as-4ft-X-8-ft-Sheathing-Panel-386081/202106230', note: `${SNIP}; 7/16" 4x8` },
  pegboard: { price: 23.98, url: 'https://homedepot.com/p/Pegboard-White-Panel-Common-3-16-in-x-4-ft-x-8-ft-Actual-0-155-in-x-47-7-in-x-95-7-in-486140/202189722', note: `${SNIP}; 3/16" 4x8` },
  beadboard: { price: 22.78, url: 'https://homedepot.com/p/3-16-in-x-4-ft-x-8-ft-MDF-Beadboard-Panel-739558/202090200', note: `${SNIP}; 3/16" MDF 4x8` },
  insulation: { price: 77.97, url: 'https://homedepot.com/p/CertainTeed-R13-Kraft-Faced-Fiberglass-Insulation-Batt-15-in-x-93-in-13-Pieces-645710/330975699', note: `${SNIP}; R-13 kraft-faced, 125.94 sq ft a bag` },
  jointCompound: { price: 21.84, url: 'https://www.homedepot.com/p/USG-Sheetrock-Brand-4-5-Gal-Plus-3-Lightweight-All-Purpose-Pre-Mixed-Joint-Compound-381466/100321602', note: `${SNIP}; 4.5 gal` },
  drywallTape: { price: 9.49, url: 'https://hemlockhardware.com/products/266811-sheetrock-2-1-16-in-x-500-ft-paper-joint-drywall-tape', store: 'Hemlock Hardware', note: 'price read from the product page on 2026-10-29 (recheck_prices.py; a search-result copy had shown $7.49); 500 ft paper tape (no big-box listing found)' },
  interiorPaint: { price: 31.98, url: 'https://www.homedepot.com/p/BEHR-PREMIUM-PLUS-1-gal-Deep-Base-Eggshell-Enamel-Low-Odor-Interior-Paint-Primer-230001/202761523', note: `${SNIP}; Behr Premium Plus interior` },
  anchorKit48: { price: 145.84, seen: '2026-10-30', url: 'https://www.homedepot.com/p/Tie-Down-48-in-x-3-4-in-Double-Head-Anchoring-Kit-with-Straps-and-Bolts-4-Pack-Specialty-Fastener-59802/328302172', note: `${SNIP} on 2026-10-30; Tie Down 59802, four anchors with straps and bolts` },
  anchorKit30: { price: 109.35, seen: '2026-10-30', url: 'https://www.homedepot.com/p/Tie-Down-30-in-x-3-4-in-Double-Head-Anchoring-Kit-with-Straps-and-Bolts-4-pack-59800/328302034', note: `${SNIP} on 2026-10-30; Tie Down 59800, four anchors with straps and bolts` },
  pitchConnector: { price: 6.39, url: 'https://www.homedepot.com/p/Simpson-Strong-Tie-VPA-Galvanized-Variable-Pitch-Connector-for-1-1-2-in-Engineered-Wood-VPA2/204842454', note: `${SNIP}; Simpson VPA2 for 1-1/2" members` },
  paint: { price: 45.98, url: 'https://www.homedepot.com/p/BEHR-PREMIUM-PLUS-1-gal-Medium-Base-Satin-Enamel-Exterior-Paint-Primer-940001/202301640', note: `${SNIP}; Behr Premium Plus exterior` },
};

/** Wall sheathing under lap and board-and-batten siding is the same OSB panel as the roof. */
/** @type {any} */ (LISTED_ITEMS).wallSheathing = LISTED_ITEMS.roofSheet;
/** The rake board is the same primed 1x4 as the wall trim. */
/** @type {any} */ (LISTED_ITEMS).rakeTrim = LISTED_ITEMS.trim1x4x12;

/** Items with no listing: our own rough figure, marked as an estimate. */
const ESTIMATES = {
  siding9: ['siding8', 108 / 96], siding10: ['siding8', 120 / 96],
  lpPanel9: ['lpPanel', 108 / 96],
  lpPanel76x10: ['lpPanel76', 120 / 96],
};

const withSource = (l) => ({ store: HD, seen: SEEN, kind: /** @type {const} */ ('listed'), ...l });

/**
 * Price and source for one board.
 * @param {string} material @param {number} ft
 * @returns {Priced}
 */
export function boardPrice(material, ft) {
  const listed = /** @type {Record<string, Record<number, any>>} */ (LISTED_LUMBER)[material];
  if (listed?.[ft]) return withSource(listed[ft]);
  if (listed) {
    const lens = Object.keys(listed).map(Number).sort((a, b) => Math.abs(a - ft) - Math.abs(b - ft) || b - a);
    const from = lens[0];
    const l = listed[from];
    return { price: Math.round((l.price / from) * ft * 100) / 100, url: l.url, store: HD, seen: SEEN, note: `scaled by length from the listed ${from} ft board ($${l.price.toFixed(2)})`, kind: 'derived' };
  }
  const un = /** @type {Record<string, [string, number]>} */ (/** @type {unknown} */ (UNLISTED))[material];
  if (un) {
    const base = boardPrice(un[0], ft);
    return { price: Math.round(base.price * un[1] * 100) / 100, note: `no listing found; our estimate from ${un[0]} x ${un[1]}`, kind: 'estimate' };
  }
  return { price: ft, note: 'no listing found; $1 a foot placeholder', kind: 'estimate' };
}

/** Price and source for a non-lumber item. @param {string} key @returns {Priced} */
export function itemPrice(key) {
  const l = /** @type {Record<string, any>} */ (LISTED_ITEMS)[key];
  if (l) return withSource(l);
  const e = /** @type {Record<string, any>} */ (ESTIMATES)[key];
  if (Array.isArray(e)) {
    const base = itemPrice(e[0]);
    return { price: Math.round(base.price * e[1] * 100) / 100, url: base.url, store: base.store, seen: base.seen, note: 'no listing found for this length; scaled by area from the listed 4x8 panel', kind: 'derived' };
  }
  if (typeof e === 'number') return { price: e, note: 'no listing found; our estimate', kind: 'estimate' };
  return { price: 0, note: 'no price', kind: 'estimate' };
}

/**
 * Delivery charges for a building-materials order. Filled from each store's
 * published policy when one could be read; otherwise null and the page asks
 * you to type your store's charge.
 * @type {Record<string, { fee: number | null, url?: string, note: string }>}
 */
export const DELIVERY = {
  homedepot: { fee: 79, url: 'https://www.homedepot.com/l/Lawrence/KS/Lawrence/66046/2211/garden-center', note: 'flatbed or box-truck delivery as listed on a Home Depot store page (tiers of about $3 by car, $35 by van, $79 by flatbed); free above a threshold that varies by store' },
  lowes: { fee: null, url: 'https://www.lowes.com/l/help/truck-delivery', note: 'Lowe\'s does not publish a truck-delivery fee we could read: type your store\'s charge' },
};
