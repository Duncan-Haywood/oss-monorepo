// A painter's rates and costs are the part they would otherwise re-enter
// every visit, so keeping them is what turns a one-off calculation into a
// tool worth returning to. Persistence and sharing serialize the same field
// set as a query string. The transform is pure: no DOM, no storage, no
// network — just the mapping between a state object and a query string.

import { SURFACE_BY_ID } from './calc.mjs';

export const COST_IDS = [
  'hourlyWage',
  'burdenRate',
  'prepHours',
  'setupHours',
  'paintPrice',
  'paintCoverage',
  'wastePercent',
  'travelCost',
  'otherCost',
  'overheadRate',
  'targetMargin',
  'proposedPrice',
  'floorSquareFeet',
  'commonFloorBid',
  'extraCoatFactor',
  'ceilingHeightFeet',
];

function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) return null;
  return result;
}

function usableSurface(surface) {
  if (!surface || typeof surface !== 'object') return null;
  const type = typeof surface.type === 'string' ? surface.type.trim() : '';
  if (type && type !== 'other' && !SURFACE_BY_ID[type]) return null;
  const quantity = usableNumber(surface.quantity);
  const productionRate = usableNumber(surface.productionRate);
  const coats = usableNumber(surface.coats);
  if (quantity === null || productionRate === null || coats === null) return null;
  if (!Number.isInteger(coats) || coats < 1) return null;
  return {
    type: type || 'other',
    quantity,
    productionRate,
    coats,
  };
}

export function encodeState(state) {
  const params = new URLSearchParams();
  const costs = state?.costs ?? state ?? {};
  for (const id of COST_IDS) {
    const value = usableNumber(costs[id]);
    if (value !== null) params.set(id, String(value));
  }
  const surfaces = Array.isArray(state?.surfaces) ? state.surfaces : [];
  surfaces.forEach((surface, index) => {
    const usable = usableSurface(surface);
    if (!usable) return;
    params.set(`s${index}`, `${usable.type},${usable.quantity},${usable.productionRate},${usable.coats}`);
  });
  return params.toString();
}

export function decodeState(source) {
  if (typeof source !== 'string') return { costs: {}, surfaces: [] };
  const trimmed = source.replace(/^[?#]/, '');
  const params = new URLSearchParams(trimmed);
  const costs = {};
  for (const id of COST_IDS) {
    if (!params.has(id)) continue;
    const value = usableNumber(params.get(id));
    if (value !== null) costs[id] = value;
  }
  const surfaces = [];
  for (const [key, raw] of params.entries()) {
    if (!/^s\d+$/.test(key)) continue;
    const parts = String(raw).split(',');
    if (parts.length !== 4) continue;
    const usable = usableSurface({
      type: parts[0],
      quantity: parts[1],
      productionRate: parts[2],
      coats: parts[3],
    });
    if (usable) surfaces.push(usable);
  }
  return { costs, surfaces };
}
