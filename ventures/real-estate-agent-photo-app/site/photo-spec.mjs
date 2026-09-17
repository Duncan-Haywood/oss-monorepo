/**
 * Dated floor spec for listing photos, and the checks that apply it.
 *
 * Ported 1:1 from `../research/src/lib/photo-spec.ts`, which was itself a 1:1
 * port of the desk-researched Python probe at
 * `portfolio/pipeline/probes/mls-photo-spec/`. Three copies of one rule set is
 * two too many, and the reason this one exists is that the other two cannot be
 * served: the probe is a CLI and the TypeScript lives in a Next.js app that
 * needs a build step, so `platform/pages/build.mjs` never publishes it and the
 * front-door mirror never sees it. This file is the same arithmetic in plain
 * ESM, which is the only shape the delivery path can actually put in front of
 * an agent.
 *
 * `parity.test.mjs` is what keeps that honest: it reads the TypeScript source
 * and asserts every constant here still matches it, so a rule changed in one
 * place fails the build rather than quietly serving two different floors.
 *
 * This is not a board rulebook — it is the subset of the venture's compliance
 * model that can be decided from a file header and a filename. Board-specific
 * extras, visual watermark detection, and burned-in contact-info detection are
 * out of scope on purpose (see UNIMPLEMENTED_RULES), and every surface that
 * shows a result has to say so.
 */

export const SPEC_ID = "listing-lens-floor-2026-08-24";
export const SPEC_DATE = "2026-08-24";

export const MIN_LONG_EDGE_PX = 1024;
export const MAX_BYTES = 20 * 1024 * 1024;
export const ALLOWED_FORMATS = new Set(["jpeg", "png"]);

// width/height ratio pairs accepted as "standard listing crop" (either orientation).
export const ASPECT_RATIOS = [
  [4, 3],
  [3, 2],
  [16, 9],
  [5, 4],
  [1, 1],
];
export const ASPECT_TOLERANCE = 0.04;

export const BRANDING_FILENAME_TOKENS = [
  "logo",
  "watermark",
  "branded",
  "brokerage",
  "headshot",
];

export const STAGING_TOKENS = ["staged", "virtually-staged", "virtual-staged"];

export const UNIMPLEMENTED_RULES = [
  "visual_watermark",
  "burned_in_contact",
  "board_specific",
];

export function createEvidenceReport(photos, skippedFiles, checkedAt) {
  return {
    reportType: "listing-lens-photo-preflight",
    specId: SPEC_ID,
    specDate: SPEC_DATE,
    checkedAt,
    checkedPhotos: photos.length,
    skippedFiles: [...skippedFiles],
    unimplementedRules: UNIMPLEMENTED_RULES,
    photos,
  };
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(data, bytes) {
  if (data.length < bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) {
    if (data[i] !== bytes[i]) return false;
  }
  return true;
}

function readUint32BE(data, offset) {
  return ((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]) >>> 0;
}

function readUint16BE(data, offset) {
  return (data[offset] << 8) | data[offset + 1];
}

function jpegSize(data) {
  let i = 2;
  const end = data.length;
  while (i + 4 <= end) {
    if (data[i] !== 0xff) return null;
    const marker = data[i + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      i += 2;
      continue;
    }
    // Start of scan: the entropy-coded image data begins here, so a SOF we
    // have not already seen is not coming.
    if (marker === 0xda) return null;
    const seglen = readUint16BE(data, i + 2);
    if ((marker === 0xc0 || marker === 0xc1 || marker === 0xc2) && seglen >= 8 && i + 4 + 5 <= end) {
      const height = readUint16BE(data, i + 5);
      const width = readUint16BE(data, i + 7);
      return [width, height];
    }
    i += 2 + seglen;
  }
  return null;
}

/**
 * Reads only the header — never the pixels. That is what makes this tool
 * honest about privacy and fast on a folder of 40 MB RAW-derived JPEGs: the
 * bytes that decide every rule below are in the first few hundred.
 */
export function readImageHeader(name, data) {
  const nbytes = data.length;
  if (startsWith(data, PNG_SIGNATURE)) {
    if (data.length < 24) {
      return { name, format: "png", width: null, height: null, nbytes, unreadable: "png-header-truncated" };
    }
    const width = readUint32BE(data, 16);
    const height = readUint32BE(data, 20);
    return { name, format: "png", width, height, nbytes, unreadable: null };
  }
  if (data.length >= 2 && data[0] === 0xff && data[1] === 0xd8) {
    const parsed = jpegSize(data);
    if (parsed === null) {
      return { name, format: "jpeg", width: null, height: null, nbytes, unreadable: "jpeg-sof-missing" };
    }
    const [width, height] = parsed;
    return { name, format: "jpeg", width, height, nbytes, unreadable: null };
  }
  return { name, format: null, width: null, height: null, nbytes, unreadable: "unrecognised-magic" };
}

function aspectOk(width, height) {
  if (height === 0) return false;
  const ratio = width / height;
  for (const [w, h] of ASPECT_RATIOS) {
    const expected = w / h;
    if (Math.abs(ratio - expected) / expected <= ASPECT_TOLERANCE) return true;
    const expectedPortrait = h / w;
    if (Math.abs(ratio - expectedPortrait) / expectedPortrait <= ASPECT_TOLERANCE) return true;
  }
  return false;
}

function stemOf(name) {
  const base = name.includes("/") ? name.slice(name.lastIndexOf("/") + 1) : name;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

function extOf(name) {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot) : "";
}

function replaceCi(text, token) {
  const idx = text.toLowerCase().indexOf(token);
  if (idx < 0) return text;
  return text.slice(0, idx) + text.slice(idx + token.length);
}

function hasOriginal(name, siblingNamesLower) {
  const stem = stemOf(name);
  let stripped = stem;
  for (const tok of STAGING_TOKENS) {
    stripped = replaceCi(stripped, tok);
  }
  stripped = stripped.replace(/^[-_ ]+|[-_ ]+$/g, "");
  if (!stripped) return false;
  const suffix = extOf(name).toLowerCase();
  const candidates = [
    `${stripped}${suffix}`,
    `${stripped}-original${suffix}`,
    `${stripped}_original${suffix}`,
  ].map((c) => c.toLowerCase());
  const own = name.toLowerCase();
  return candidates.some((c) => c !== own && siblingNamesLower.has(c));
}

export const IMAGE_SUFFIXES = new Set([".jpg", ".jpeg", ".png"]);

export function isListingPhoto(name) {
  return IMAGE_SUFFIXES.has(extOf(name).toLowerCase());
}

/** Check one photo. `siblingNamesLower` is every other filename (lowercased) in the same batch. */
export function checkPhoto(name, data, siblingNamesLower = new Set()) {
  const info = readImageHeader(name, data);
  const findings = [];

  // An unreadable file stops here on purpose: every rule below reads a field
  // the header parse did not produce, so running them would report invented
  // failures against a file whose real problem is that it is not an image.
  if (info.unreadable) {
    findings.push({ rule: "unreadable", detail: info.unreadable, severity: "blocking" });
    return { info, findings };
  }

  if (!info.format || !ALLOWED_FORMATS.has(info.format)) {
    findings.push({
      rule: "format",
      detail: `${info.format} is not in ${Array.from(ALLOWED_FORMATS).sort().join(", ")}`,
      severity: "blocking",
    });
  }

  if (info.nbytes > MAX_BYTES) {
    findings.push({
      rule: "byte_size",
      detail: `${info.nbytes} bytes exceeds ${MAX_BYTES}`,
      severity: "blocking",
    });
  }

  if (info.width === null || info.height === null) {
    findings.push({ rule: "long_edge", detail: "dimensions missing after header parse", severity: "blocking" });
  } else {
    const longEdge = Math.max(info.width, info.height);
    if (longEdge < MIN_LONG_EDGE_PX) {
      findings.push({
        rule: "long_edge",
        detail: `long edge ${longEdge}px < ${MIN_LONG_EDGE_PX}px`,
        severity: "blocking",
      });
    }
    if (!aspectOk(info.width, info.height)) {
      findings.push({
        rule: "aspect",
        detail: `${info.width}x${info.height} matches no accepted ratio (±${ASPECT_TOLERANCE})`,
        severity: "degrading",
      });
    }
  }

  const stem = stemOf(name).toLowerCase();
  const brandingHit = BRANDING_FILENAME_TOKENS.find((tok) => stem.includes(tok));
  if (brandingHit) {
    findings.push({
      rule: "branding_filename",
      detail: `filename contains branding token "${brandingHit}"`,
      severity: "blocking",
    });
  }

  if (STAGING_TOKENS.some((tok) => stem.includes(tok)) && !hasOriginal(name, siblingNamesLower)) {
    findings.push({
      rule: "staging_pair",
      detail: "staged derivative has no sibling original (strip staged/virtual- tokens)",
      severity: "blocking",
    });
  }

  return { info, findings };
}

/** Check a batch of files together so the staging_pair rule can see siblings. */
export function checkBatch(files) {
  const photos = files.filter((f) => isListingPhoto(f.name));
  const namesLower = new Set(photos.map((f) => f.name.toLowerCase()));
  return photos.map((f) => checkPhoto(f.name, f.data, namesLower));
}

/**
 * What a photographer should do next after a preflight. Findings say what
 * failed; this turns them into a recapture / desk-fix list they can take
 * back to the property or the export folder.
 *
 * Kind is the highest-effort action that still applies:
 * recapture > pair > reexport > rename. A clean report is omitted.
 * This is not a board acceptance list — see UNIMPLEMENTED_RULES.
 */
const KIND_RANK = {
  recapture: 0,
  pair: 1,
  reexport: 2,
  rename: 3,
};

const RULE_GUIDANCE = {
  long_edge: {
    kind: "recapture",
    action: `Re-export from RAW at ≥${MIN_LONG_EDGE_PX}px on the long edge. If the original is already smaller, recapture this room.`,
  },
  unreadable: {
    kind: "recapture",
    action: "Re-export as JPEG or PNG. This copy cannot be read.",
  },
  aspect: {
    kind: "reexport",
    action: "Recrop to 4:3, 3:2, 16:9, 5:4, or 1:1 before delivery.",
  },
  format: {
    kind: "reexport",
    action: "Re-export as JPEG or PNG.",
  },
  byte_size: {
    kind: "reexport",
    action: `Re-export under ${Math.round(MAX_BYTES / (1024 * 1024))} MiB.`,
  },
  branding_filename: {
    kind: "rename",
    action: "Rename so the filename does not contain logo, watermark, branded, brokerage, or headshot.",
  },
  staging_pair: {
    kind: "pair",
    action: "Add the unstaged original next to this file (same stem, or stem-original).",
  },
};

function reshootItemFor(report) {
  if (report.findings.length === 0) return null;

  let kind = "rename";
  const actions = [];
  const rules = [];
  let priority = "degrading";

  for (const finding of report.findings) {
    rules.push(finding.rule);
    if (finding.severity === "blocking") priority = "blocking";
    const guidance = RULE_GUIDANCE[finding.rule] ?? {
      kind: "reexport",
      action: finding.detail,
    };
    if (KIND_RANK[guidance.kind] < KIND_RANK[kind]) kind = guidance.kind;
    actions.push(guidance.action);
  }

  return {
    fileName: report.info.name,
    kind,
    priority,
    rules,
    action: actions.join(" "),
  };
}

export function buildReshootPlan(reports) {
  const items = reports.map(reshootItemFor).filter((item) => item !== null);
  return {
    items,
    recaptureCount: items.filter((item) => item.kind === "recapture").length,
    deskFixCount: items.filter((item) => item.kind !== "recapture").length,
    blockingCount: items.filter((item) => item.priority === "blocking").length,
  };
}

export function formatReshootPlan(plan) {
  if (plan.items.length === 0) {
    return [
      "Reshoot / desk-fix list: nothing to fix on the checked floor spec.",
      "This is not a warranty that any MLS will accept the photos. Not checked: " +
        UNIMPLEMENTED_RULES.join(", ") +
        ".",
    ].join("\n");
  }

  const lines = [
    "Reshoot / desk-fix list (file headers and filenames only — not MLS acceptance)",
    "",
  ];

  const groups = [
    ["Go back to the property / re-export from RAW", ["recapture"]],
    ["Fix at the desk", ["pair", "reexport", "rename"]],
  ];

  for (const [heading, kinds] of groups) {
    const group = plan.items.filter((item) => kinds.includes(item.kind));
    if (group.length === 0) continue;
    lines.push(`${heading} (${group.length}):`);
    for (const item of group) {
      lines.push(`- ${item.fileName} [${item.kind}/${item.priority}]: ${item.action}`);
    }
    lines.push("");
  }

  lines.push(
    "This list is generated from file headers and filenames only. It does not check " +
      UNIMPLEMENTED_RULES.join(", ") +
      ", and it is not a warranty that any MLS will accept the photos.",
  );
  return lines.join("\n").trimEnd();
}
