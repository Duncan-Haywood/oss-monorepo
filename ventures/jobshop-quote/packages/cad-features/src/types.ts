// Public shape of what the parsers measure. All lengths are millimetres, areas mm², volumes mm³,
// whatever unit the file was drawn in; `sourceUnits` says what that was and `unitsAssumed` says
// whether we had to guess.

export type Confidence = "high" | "medium" | "low";

export type LengthUnit = "mm" | "cm" | "m" | "in" | "ft" | "um" | "mil" | "uin" | "km" | "mi";

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface BoundingBox {
  min: Vec3;
  max: Vec3;
  /** max - min on each axis */
  size: Vec3;
}

/** Something a costing model should know before trusting a number. */
export interface Flag {
  code: FlagCode;
  message: string;
}

export type FlagCode =
  | "binary-dxf"
  | "units-unknown"
  | "units-mixed"
  | "no-closed-outline"
  | "multiple-outlines"
  | "nested-islands"
  | "open-chains"
  | "branching-geometry"
  | "approximated-curves"
  | "non-uniform-scale"
  | "unsupported-entities"
  | "expansion-limit"
  | "bend-lines-by-linetype"
  | "no-solid"
  | "multiple-solids"
  | "assembly-placement-ignored"
  | "volume-unsupported"
  | "volume-failed-check"
  | "bbox-may-underestimate"
  | "surface-model"
  | "parse-errors"
  | "hole-sense-unknown"
  | "model-space-scale";

export interface CircularHoleGroup {
  /** diameter in mm, rounded to 0.001 */
  diameter: number;
  count: number;
}

export interface FlatHole {
  kind: "circle" | "slot" | "other";
  /** circle: diameter; slot: width (2 × end radius) */
  diameter?: number;
  /** slot: overall length end to end */
  length?: number;
  perimeter: number;
  area: number;
  center: Vec2;
}

export interface BendLine {
  layer: string;
  length: number;
  start: Vec2;
  end: Vec2;
}

/** 2D part read from a DXF flat pattern (sheet metal, laser, waterjet, plasma, router). */
export interface FlatFeatures {
  /** perimeter of the part's outer boundary */
  outerPerimeter: number;
  /** area enclosed by the outer boundary */
  grossArea: number;
  /** grossArea minus holes and cut-outs */
  netArea: number;
  /** extents of the outer boundary (z is 0) */
  blank: { width: number; height: number };
  holes: FlatHole[];
  holeCount: number;
  circularHoles: CircularHoleGroup[];
  /** total cut path: outer perimeter + every hole perimeter */
  cutLength: number;
  /** closed contours that each need a pierce: outer + holes */
  pierceCount: number;
  bendLines: BendLine[];
  /** where the bend lines came from: a layer named like /bend/i, a dashed linetype, or none found */
  bendLineSource: "layer" | "linetype" | "none";
  /** length of geometry on etch/mark/engrave layers (not cut) */
  etchLength: number;
  /** closed outer boundaries found in the drawing; >1 means a nest or several views */
  outlineCount: number;
  /** open entity chains that never closed (excluded from area) */
  openChainCount: number;
}

export interface CylinderGroup {
  diameter: number;
  /** "hole": concave (material outside the cylinder); "boss": convex */
  kind: "hole" | "boss";
  /** how many distinct axes carry this cylinder */
  count: number;
  /** longest axial extent seen for this group */
  depth: number;
}

/**
 * One hole location: every full hole cylinder sharing one axis line, so a counterbored or stepped
 * hole is one location with two diameters. Coaxial holes through separate walls are one location
 * too (one drilling pass reaches them).
 */
export interface HoleAxis {
  /** distinct diameters on this axis, smallest first (mm, 0.001) */
  diameters: number[];
  /** axial extent covered by the hole walls on this axis (mm) */
  depth: number;
}

/** One solid body read from a STEP B-rep. */
export interface SolidBody {
  name: string;
  faceCount: number;
  boundingBox: BoundingBox | null;
  /** mm³; null when a face type is not supported by the volume integrator */
  volume: number | null;
  /** surface types present, with counts (PLANE, CYLINDRICAL_SURFACE, ...) */
  surfaceTypes: Record<string, number>;
  /** full cylinders (≥ 350° of wrap) grouped by diameter and kind */
  cylinders: CylinderGroup[];
  /** hole locations: the full hole cylinders grouped by axis line, smallest diameter first */
  holeAxes: HoleAxis[];
  /** cylindrical faces that do not close round (fillets, slot ends) */
  partialCylinderFaces: number;
  volumeNote?: string;
}

export interface SolidFeatures {
  schema: string;
  bodies: SolidBody[];
  /** sum of body volumes when every body has one */
  totalVolume: number | null;
  /** NEXT_ASSEMBLY_USAGE_OCCURRENCE count; >0 means the file is an assembly */
  assemblyUsages: number;
}

export interface FieldConfidence {
  units: Confidence;
  boundingBox: Confidence;
  /** DXF: outline perimeter/area. STEP: volume. */
  measures: Confidence;
  /** DXF: holes. STEP: cylinders. */
  holes: Confidence;
  /** DXF only; STEP is "low" (bends are not detected from a solid). */
  bends: Confidence;
}

/** What an STL mesh is made of (STL only). */
export interface MeshFeatures {
  /** triangles in the file */
  triangles: number;
  /** total area of the triangles, mm²; null when there are none */
  surfaceArea: number | null;
}

export interface PartFeatures {
  format: "dxf" | "step" | "stl" | "iges";
  /** every length below is in this unit */
  units: "mm";
  sourceUnits: LengthUnit | "unknown";
  unitsAssumed: boolean;
  boundingBox: BoundingBox | null;
  flat: FlatFeatures | null;
  solid: SolidFeatures | null;
  /** STL only: the triangle count and surface area. A mesh's volume is in `solid`. */
  mesh?: MeshFeatures;
  confidence: Confidence;
  fieldConfidence: FieldConfidence;
  flags: Flag[];
  /** entity types seen in the file that the parser does not measure, with counts */
  unsupported: Record<string, number>;
}

export interface ExtractOptions {
  /** unit to assume when the file does not say (DXF $INSUNITS 0 or absent; always for STL). Default "mm". */
  assumeUnits?: LengthUnit;
  /** layer test for bend lines. Default /bend/i */
  bendLayer?: RegExp;
  /** layer test for etch / mark geometry (measured, not cut). Default /etch|mark|engrav|scribe/i */
  etchLayer?: RegExp;
  /** layers ignored entirely (title blocks, dimensions). Default /^defpoints$|dim|text|anno|title|border|frame|note/i */
  ignoreLayer?: RegExp;
}

export const MM_PER: Record<LengthUnit, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
  ft: 304.8,
  um: 0.001,
  mil: 0.0254,
  uin: 0.0000254,
  km: 1_000_000,
  mi: 1_609_344,
};
