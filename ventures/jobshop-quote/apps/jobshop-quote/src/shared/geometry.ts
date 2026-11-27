// Part geometry features, as produced by packages/cad-features from a CAD file (ports/geometry.ts).
// Inches throughout. Used only to SUGGEST blank size and cycle time; the estimator decides.
// Rows stored before the STEP/DXF adapter landed lack the optional fields; read them as unknown.
import type { FlatBlankMeasures, FlatPatternMeasures, HoleLocationMeasures } from "./costing";

export type GeometryConfidence = "high" | "medium" | "low";

/** File extensions the geometry port is asked about (others are drawings/documents). */
export const CAD_EXTENSIONS = [".step", ".stp", ".iges", ".igs", ".stl", ".dxf", ".sldprt"];

export const isCadFile = (name: string) =>
  CAD_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));

/** The units an estimator can choose for a CAD file that does not state its own. */
export const CAD_UNITS = ["mm", "in"] as const;
export type CadUnit = (typeof CAD_UNITS)[number];

/** True when the file gave no unit and nobody has chosen one yet: the numbers may be 25.4× off. */
export const unitsUnconfirmed = (g: GeometryFeatures) => g.units?.setBy === "assumed";

export interface GeometryFeatures {
  /**
   * Which kind of file it came from. A DXF is a flat pattern: no thickness, no volume. An STL is a
   * triangle mesh: a box and, when the mesh is closed, a volume; no holes and no units. An IGES
   * file gives a box from its trimmed faces and its declared units, and holes from its full
   * cylinders (a ray along each axis tells a hole from a boss); no volume.
   */
  format?: "step" | "dxf" | "stl" | "iges";
  /** Solid volume of the finished part; null when the parser could not measure it exactly. */
  volumeIn3: number | null;
  /** Axis-aligned bounding box of the part (zIn is 0 for a DXF flat pattern). */
  boundingBoxIn: { xIn: number; yIn: number; zIn: number };
  surfaceAreaIn2: number | null;
  holes: { diameterIn: number; depthIn: number | null; count: number; threaded: boolean | null }[];
  /**
   * STEP solids only: each hole location (the hole walls on one axis line, so a counterbored hole
   * is one location with two diameters), smallest diameter first. Absent on rows stored before it.
   */
  holeLocations?: { diametersIn: number[]; depthIn: number }[] | null;
  /** DXF flat patterns only: what a laser, waterjet, plasma or punch quote runs on. */
  flat?: {
    blankIn: { widthIn: number; heightIn: number };
    netAreaIn2: number;
    cutLengthIn: number;
    pierceCount: number;
    bendLineCount: number;
  } | null;
  /** The parser's own confidence per field, so a guess is never shown as a measurement. */
  confidence?: {
    boundingBox: GeometryConfidence;
    volume: GeometryConfidence;
    holes: GeometryConfidence;
    /** DXF bend lines: high from a bend layer, low from a dashed linetype. Absent on older rows. */
    bends?: GeometryConfidence;
  };
  /**
   * Set when the file does not say its unit (always for STL, sometimes for DXF): the unit the
   * numbers were read in, and whether that was assumed or chosen by an estimator. While it is
   * assumed, every confidence above is "low", so nothing is suggested from the file.
   */
  units?: { read: CadUnit; setBy: "assumed" | "estimator" } | null;
  /** What the estimator should know before trusting a number (units assumed, unsupported faces...). */
  flags?: { code: string; message: string }[];
  /** Which extractor produced this and its version, for traceability. */
  source: string;
}

/** Cubic inches removed from a blank to reach the part; null when either volume is unknown. */
export function removedVolumeIn3(
  blankVolumeIn3: number | null,
  partVolumeIn3: number | null,
): number | null {
  if (blankVolumeIn3 === null || partVolumeIn3 === null) return null;
  return Math.max(0, blankVolumeIn3 - partVolumeIn3);
}

/** True when a bounding box can size a 3D blank: a solid, measured with better than low confidence. */
export function canSuggestBlank(g: GeometryFeatures): boolean {
  if (g.format === "dxf") return false;
  if (!(g.boundingBoxIn.xIn > 0 && g.boundingBoxIn.yIn > 0 && g.boundingBoxIn.zIn > 0))
    return false;
  return g.confidence ? g.confidence.boundingBox !== "low" : true;
}

/** The flat-pattern numbers the sheet-metal suggestions use; null when the file is not a flat pattern. */
export function flatMeasures(g: GeometryFeatures): FlatPatternMeasures | null {
  if (!g.flat) return null;
  return {
    cutLengthIn: g.flat.cutLengthIn,
    pierceCount: g.flat.pierceCount,
    bendLineCount: g.flat.bendLineCount,
    measuresConfidence: g.confidence?.volume ?? null,
    holesConfidence: g.confidence?.holes ?? null,
    bendsConfidence: g.confidence?.bends ?? null,
  };
}

/** The hole locations the drilling suggestion uses: a STEP or IGES solid's; null for a DXF or STL, or a row stored before them. */
export function holeLocationMeasures(g: GeometryFeatures): HoleLocationMeasures | null {
  if ((g.format !== "step" && g.format !== "iges") || !g.holeLocations) return null;
  return { locations: g.holeLocations, holesConfidence: g.confidence?.holes ?? null };
}

/** A DXF flat pattern's overall size for the sheet blank; null when the file is not a flat pattern. */
export function flatBlankMeasures(g: GeometryFeatures): FlatBlankMeasures | null {
  if (!g.flat) return null;
  return {
    widthIn: g.flat.blankIn.widthIn,
    heightIn: g.flat.blankIn.heightIn,
    confidence: g.confidence?.boundingBox ?? null,
  };
}
