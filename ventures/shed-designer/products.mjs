// @ts-check
// Off-the-shelf shed windows and doors, with the maker's rough opening, a
// price and where it was seen (2026-10-29). Picking one sets the opening's
// rough size and puts the unit on the shopping list. Several makers' pages
// showed these sold out or backordered that day, and store prices were read
// from search-result copies of the product pages; the note on each says which.

/** @typedef {{ id: string, kind: 'window'|'door', name: string, roW: number, roH: number, price: number, store: string, url: string, roSource: string, note: string }} Product */

const SWM = 'https://shedwindowsandmore.com/products/';

/** @type {Product[]} */
export const PRODUCTS = [
  { id: 'swm-1421', kind: 'window', name: 'Vertical slider 14 x 21, white aluminum, tempered (Shed Windows and More 1421WF)', roW: 14.25, roH: 21.25, price: 51.95, store: 'Home Depot', url: 'https://www.homedepot.com/p/Shed-Windows-and-More-Vertical-Slider-14-in-x-21-in-White-Aluminum-Utility-Chicken-Coop-Window-Flush-Mount-Tempered-Glass-1421WF/700041747', roSource: `${SWM}vertical-slider-14-in-x-21-in-white-aluminum-window-tempered-glass`, note: 'price from the search result for the store page; maker showed it sold out' },
  { id: 'swm-1823', kind: 'window', name: 'Vertical slider 18 x 23, white aluminum, tempered (Shed Windows and More 1823WF)', roW: 18.25, roH: 23.25, price: 57.9, store: "Lowe's", url: 'https://www.lowes.com/pd/Shed-Windows-and-More-Vertical-Slider-18-x-23-White-Aluminum-Window-Flush-Mount-Tempered-Glass/7151678', roSource: `${SWM}vertical-slider-18-x-23-window-with-tempered-glass`, note: 'price from the search result for the store page (an older copy)' },
  { id: 'swm-1827', kind: 'window', name: 'Vertical slider 18 x 27, white aluminum, tempered (Shed Windows and More 1827WF)', roW: 18.25, roH: 27.25, price: 65.5, store: 'Shed Windows and More', url: `${SWM}vertical-slider-18-x-27-window-with-tempered-glass`, roSource: `${SWM}vertical-slider-18-x-27-window-with-tempered-glass`, note: "maker's list price; also listed at Lowe's" },
  { id: 'swm-1836', kind: 'window', name: 'Vertical slider 18 x 36, white aluminum, tempered (Shed Windows and More)', roW: 18.25, roH: 36.25, price: 75.15, store: 'Shed Windows and More', url: `${SWM}vertical-slider-18-x-36-shed-window-with-tempered-glass`, roSource: `${SWM}vertical-slider-18-x-36-shed-window-with-tempered-glass`, note: "maker's list price" },
  { id: 'swm-2427', kind: 'window', name: 'Vertical slider 24 x 27, white aluminum, tempered (Shed Windows and More 2427WF)', roW: 24.25, roH: 27.25, price: 75.95, store: "Lowe's", url: 'https://www.lowes.com/pd/Shed-Windows-and-More-Vertical-Slider-24-x-27-White-Aluminum-Window-Flush-Mount-Tempered-Glass/7151723', roSource: `${SWM}vertical-slider-24-x-27-window-with-tempered-glass`, note: 'price from the search result for the store page' },
  { id: 'swm-2436', kind: 'window', name: 'Vertical slider 24 x 36, white aluminum, tempered (Shed Windows and More 2436WF)', roW: 24.25, roH: 36.25, price: 86.45, store: "Lowe's", url: 'https://www.lowes.com/pd/Shed-Windows-and-More-Vertical-Slider-24-x-36-White-Aluminum-Window-Flush-Mount-Tempered-Glass/7151722', roSource: `${SWM}vertical-slider-24-x-36-window-with-tempered-glass`, note: 'price from the search result for the store page; Home Depot and the maker list $91.00' },
  { id: 'swm-h2427', kind: 'window', name: 'Horizontal slider 24 x 27, flush, tempered, no grid (Shed Windows and More)', roW: 24.25, roH: 27.25, price: 47.75, store: 'Shed Windows and More', url: `${SWM}horizontal-slider-24-x-27-flush-window-with-tempered-glass-no-grid`, roSource: `${SWM}horizontal-slider-24-x-27-flush-window-with-tempered-glass-no-grid`, note: "maker's list price; backordered that day" },
  { id: 'swm-t2312', kind: 'window', name: 'Fixed transom 23 x 12, white, tempered (Shed Windows and More), laid flat', roW: 23.25, roH: 12.25, price: 53.15, store: 'Shed Windows and More', url: `${SWM}fixed-12-x-23-white-flush-transom-window-with-tempered-glass`, roSource: `${SWM}fixed-12-x-23-white-flush-transom-window-with-tempered-glass`, note: "maker's list price; sold as 12 x 23, used here as a transom 23 wide" },
  { id: 'sr-36x76', kind: 'door', name: '36" fiberglass 6-panel prehung shed door, 76" panel (Shed Repair LLC)', roW: 38.5, roH: 78, price: 615, store: 'Shed Repair LLC', url: 'https://shedrepair.net/product/36-fiberglass-6-panel-prehung-door/', roSource: 'https://shedrepair.net/product/36-fiberglass-6-panel-prehung-door/', note: 'the listing starts at $615; the 76" option may cost more' },
  { id: 'sr-36x71', kind: 'door', name: '36" fiberglass 6-panel prehung shed door, 71" panel (Shed Repair LLC)', roW: 38.5, roH: 73.5, price: 615, store: 'Shed Repair LLC', url: 'https://shedrepair.net/product/36-fiberglass-6-panel-prehung-door/', roSource: 'https://shedrepair.net/product/36-fiberglass-6-panel-prehung-door/', note: 'listing base price' },
  { id: 'masonite-3680', kind: 'door', name: '36 x 80 steel 6-panel prehung exterior door, inswing (Masonite 45692)', roW: 38.25, roH: 82, price: 598, store: 'Home Depot', url: 'https://www.homedepot.com/p/Masonite-36-in-x-80-in-6-Panel-Left-Hand-Inswing-Primed-White-Steel-Prehung-Front-Exterior-Door-with-Vinyl-Frame-45692/202768870', roSource: 'https://images.homedepot-static.com/catalog/pdfImages/82/8289fc2e-6eb6-4dee-82ff-6729be7b9162.pdf', note: "price from the search result for the store page; rough opening from Masonite's install guide" },
  { id: 'masonite-3280-flush', kind: 'door', name: '32 x 80 utility flush primed steel prehung door, inswing, with brickmold (Masonite 85601)', roW: 34.25, roH: 82, price: 246, store: 'Home Depot', url: 'https://www.homedepot.com/p/202082261', roSource: 'https://superarbor.io/products/masonite-32-in-x-80-in-premium-flush-right-hand-inswing-primed-steel-prehung-front-exterior-door-no-brickmold', note: "price from the search result for the store page; no rough opening was published for this item, so this is the rough opening listed for Masonite's 32 x 80 premium flush prehung door: check the door's own install sheet before framing" },
  { id: 'jeldwen-3280-6p', kind: 'door', name: '32 x 80 six-panel primed steel prehung door, inswing, with brickmould (JELD-WEN THDJW166100261)', roW: 34, roH: 82.25, price: 258, store: 'Home Depot', url: 'https://homedepot.com/p/JELD-WEN-32-in-x-80-in-6-Panel-Primed-Steel-Prehung-Left-Hand-Inswing-Front-Door-w-Brickmould-THDJW166100261/202036438', roSource: 'https://superarbor.io/products/jeld-wen-32x80-steel-prehung-entry-door-left-hand-outswing-loe620732', note: "price from the search result for the store page; rough opening from a listing of JELD-WEN's 32 x 80 primed steel prehung door: check the door's own install sheet before framing" },
  { id: 'sr-48x72', kind: 'door', name: '48 x 72 wooden double shed doors, with threshold (Shed Repair LLC)', roW: 48, roH: 71.25, price: 465, store: 'Shed Repair LLC', url: 'https://shedrepair.net/product/48-standard-style-wooden-double-shed-doors/', roSource: 'https://shedrepair.net/product/48-standard-style-wooden-double-shed-doors/', note: "seller's rough-opening rule: door height less 3/4\" with a threshold" },
  { id: 'sr-60x72', kind: 'door', name: '60 x 72 wooden double shed doors, with threshold (Shed Repair LLC)', roW: 60, roH: 71.25, price: 585, store: 'Shed Repair LLC', url: 'https://shedrepair.net/product/60-standard-style-wooden-double-shed-doors/', roSource: 'https://shedrepair.net/product/60-standard-style-wooden-double-shed-doors/', note: "seller's rough-opening rule: door height less 3/4\" with a threshold" },
];

/** @param {string | undefined} id */
export const productById = (id) => PRODUCTS.find((p) => p.id === id) || null;

/**
 * What a unit like a custom-size opening typically costs: the cheapest and
 * dearest catalogue units of its kind and about its size, and their median.
 * Doors over 44" wide are compared with the double doors, narrower ones with
 * the single doors. Given a height too, only the units whose rough opening is
 * within a third of its area count (at least the three nearest), so a 32 x 24
 * window is not priced against a 14 x 21 one. A range from our catalogue, not
 * a listing for that size.
 * @param {'door'|'window'} kind @param {number} width rough opening width (in)
 * @param {number} [height] rough opening height (in)
 */
export function catalogueRange(kind, width, height) {
  const pair = kind === 'door' && width > 44;
  const all = PRODUCTS.filter((p) => p.kind === kind && (kind === 'window' || (p.roW > 44) === pair));
  let units = all;
  if (height > 0 && all.length > 3) {
    const far = (p) => Math.abs(Math.log((p.roW * p.roH) / (width * height)));
    const near = all.filter((p) => far(p) <= Math.log(4 / 3));
    units = near.length >= 3 ? near : [...all].sort((a, b) => far(a) - far(b)).slice(0, 3);
  }
  const sized = units.length < all.length;
  const prices = units.map((p) => p.price).sort((a, b) => a - b);
  const n = prices.length;
  if (!n) return null;
  const median = n % 2 ? prices[(n - 1) / 2] : (prices[n / 2 - 1] + prices[n / 2]) / 2;
  const group = kind === 'window' ? 'shed windows' : pair ? 'double shed doors' : 'single shed doors';
  return { lo: prices[0], hi: prices[n - 1], median, n, group: sized ? `${group} nearest that size` : group };
}
