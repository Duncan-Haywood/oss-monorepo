// Geometry port: CAD file -> features (volume, bounding box, holes). `CadFeaturesGeometry` wraps
// packages/cad-features (pure TypeScript, Worker-safe) for STEP, ASCII DXF, STL and ASCII IGES (a box
// from the trimmed faces; no volume or holes); native SolidWorks returns null and the estimator
// enters blank sizes by hand.
import { extractFeatures, type PartFeatures } from "@cad-features";
import type { CadUnit, GeometryConfidence, GeometryFeatures } from "@shared/geometry";

// Which files are CAD lives in shared/geometry.ts, so the New RFQ form counts drawing pages the
// same way the worker does.
export { CAD_EXTENSIONS, isCadFile } from "@shared/geometry";
export type { GeometryFeatures };

/** A CAD file to measure. `units`: the unit an estimator chose for a file that does not state one. */
export interface GeometryInput {
  name: string;
  bytes: ArrayBuffer;
  units?: CadUnit;
}

export interface GeometryExtractor {
  /** Null when the file type is unsupported or no extractor is configured. */
  extract(file: GeometryInput): Promise<GeometryFeatures | null>;
}

export class UnavailableGeometry implements GeometryExtractor {
  async extract(): Promise<GeometryFeatures | null> {
    return null;
  }
}

/**
 * Test/demo extractor: returns the registered features for a file name, else null. A measure with
 * units chosen by an estimator looks up `name@mm` or `name@in`.
 */
export class FakeGeometry implements GeometryExtractor {
  constructor(private byName: Record<string, GeometryFeatures> = {}) {}
  set(name: string, features: GeometryFeatures) {
    this.byName[name] = features;
  }
  async extract(file: { name: string; units?: CadUnit }) {
    return this.byName[file.units ? `${file.name}@${file.units}` : file.name] ?? null;
  }
}

const MM3_PER_IN3 = 16_387.064;
const MM2_PER_IN2 = 645.16;
const inch = (mm: number) => round(mm / 25.4, 4);
const round = (v: number, dp: number) => Math.round(v * 10 ** dp) / 10 ** dp;

/** File extensions packages/cad-features reads. */
export const MEASURED_CAD_EXTENSIONS = [".step", ".stp", ".dxf", ".stl", ".iges", ".igs"];

/** True for the CAD files `CadFeaturesGeometry` measures (STEP, DXF, STL and IGES); others return null. */
export const isMeasuredCadFile = (name: string) =>
  MEASURED_CAD_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));

/**
 * Map the parser's millimetre result to the app's inch-based features. Pure; unit-tested.
 * `chosenUnits`: the unit an estimator chose for a file that states none; the numbers were read in
 * it, so the units count as known and the "units-unknown" flag is dropped.
 */
export function toGeometryFeatures(
  f: PartFeatures,
  source: string,
  chosenUnits?: CadUnit,
): GeometryFeatures | null {
  const size = f.boundingBox?.size;
  if (!size) return null;
  const chosen = f.unitsAssumed && chosenUnits !== undefined;
  const conf = chosen ? { ...f.fieldConfidence, units: "high" as const } : f.fieldConfidence;
  const read: CadUnit = chosenUnits ?? (f.sourceUnits === "in" ? "in" : "mm");
  const out: GeometryFeatures = {
    format: f.format,
    volumeIn3: null,
    boundingBoxIn: { xIn: inch(size.x), yIn: inch(size.y), zIn: inch(size.z) },
    surfaceAreaIn2: f.mesh?.surfaceArea == null ? null : round(f.mesh.surfaceArea / MM2_PER_IN2, 4),
    holes: [],
    flat: null,
    confidence: {
      boundingBox: lowerOf(conf.units, conf.boundingBox),
      volume: lowerOf(conf.units, conf.measures),
      holes: lowerOf(conf.units, conf.holes),
      bends: lowerOf(conf.units, conf.bends),
    },
    flags: f.flags
      .filter((x) => !(chosen && x.code === "units-unknown"))
      .map((x) => ({ code: x.code, message: x.message })),
    source,
  };
  if (f.unitsAssumed) out.units = { read, setBy: chosen ? "estimator" : "assumed" };
  if (f.solid) {
    out.volumeIn3 =
      f.solid.totalVolume === null ? null : round(f.solid.totalVolume / MM3_PER_IN3, 4);
    const holes = new Map<string, GeometryFeatures["holes"][number]>();
    for (const body of f.solid.bodies) {
      for (const c of body.cylinders) {
        if (c.kind !== "hole") continue;
        const key = `${round(c.diameter, 3)}:${round(c.depth, 3)}`;
        const prev = holes.get(key);
        if (prev) prev.count += c.count;
        else
          holes.set(key, {
            diameterIn: inch(c.diameter),
            depthIn: inch(c.depth),
            count: c.count,
            threaded: null,
          });
      }
    }
    out.holes = [...holes.values()].sort((a, b) => a.diameterIn - b.diameterIn);
    out.holeLocations = f.solid.bodies
      .flatMap((body) => body.holeAxes ?? [])
      .map((a) => ({ diametersIn: a.diameters.map(inch), depthIn: inch(a.depth) }));
  }
  if (f.flat) {
    const fl = f.flat;
    out.holes = fl.circularHoles.map((h) => ({
      diameterIn: inch(h.diameter),
      depthIn: null,
      count: h.count,
      threaded: null,
    }));
    out.flat = {
      blankIn: { widthIn: inch(fl.blank.width), heightIn: inch(fl.blank.height) },
      netAreaIn2: round(fl.netArea / MM2_PER_IN2, 4),
      cutLengthIn: inch(fl.cutLength),
      pierceCount: fl.pierceCount,
      bendLineCount: fl.bendLines.length,
    };
  }
  return out;
}

const RANK: Record<GeometryConfidence, number> = { low: 0, medium: 1, high: 2 };
const lowerOf = (a: GeometryConfidence, b: GeometryConfidence) => (RANK[a] <= RANK[b] ? a : b);

/** Production extractor: STEP, ASCII DXF, STL and ASCII IGES through packages/cad-features. */
export class CadFeaturesGeometry implements GeometryExtractor {
  constructor(private source = "packages/cad-features@0.1.0") {}
  async extract(file: GeometryInput): Promise<GeometryFeatures | null> {
    if (!isMeasuredCadFile(file.name)) return null;
    const f = extractFeatures(file.bytes, file.name, file.units ? { assumeUnits: file.units } : {});
    return toGeometryFeatures(f, this.source, file.units);
  }
}
