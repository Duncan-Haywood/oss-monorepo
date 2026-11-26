// Unified view of the control library for routes, the SSP generator and the UI.
import { LEVEL1_BY_ID, LEVEL1_REQUIREMENTS } from "./level1";
import {
  FAMILIES,
  type FamilyCode,
  LEVEL2_BY_ID,
  LEVEL2_REQUIREMENTS,
  type Objective,
} from "./level2";

export * from "./csv-import";
export * from "./level1";
export * from "./level2";
export * from "./scoring";
export * from "./sources";

export type CmmcLevel = 1 | 2;

export interface ControlDef {
  id: string;
  level: CmmcLevel;
  family: FamilyCode;
  familyName: string;
  /** FAR paragraph (Level 1) or NIST SP 800-171 Rev. 2 number (Level 2). */
  ref: string;
  nistIds: string[];
  text: string;
  /** DoD Assessment Methodology point value (Level 2 only). */
  weight: number | null;
  objectives: Objective[];
}

const level1: ControlDef[] = LEVEL1_REQUIREMENTS.map((r) => ({
  id: r.id,
  level: 1,
  family: r.family,
  familyName: FAMILIES[r.family],
  ref: `FAR 52.204-21${r.farRef}`,
  nistIds: r.nistIds,
  text: r.text,
  weight: null,
  objectives: r.objectives,
}));

const level2: ControlDef[] = LEVEL2_REQUIREMENTS.map((r) => ({
  id: r.id,
  level: 2,
  family: r.family,
  familyName: FAMILIES[r.family],
  ref: `NIST SP 800-171r2 ${r.nistId}`,
  nistIds: [r.nistId],
  text: r.text,
  weight: r.weight,
  objectives: r.objectives,
}));

export const CONTROLS: Record<CmmcLevel, readonly ControlDef[]> = { 1: level1, 2: level2 };
const BY_ID = new Map<string, ControlDef>([...level1, ...level2].map((c) => [c.id, c]));

export const controlById = (id: string): ControlDef | undefined => BY_ID.get(id);
export const isKnownControl = (id: string) => LEVEL1_BY_ID.has(id) || LEVEL2_BY_ID.has(id);
