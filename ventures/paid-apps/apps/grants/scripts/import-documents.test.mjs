// Unit tests for scripts/lib/import-helpers.mjs. Run from apps/grants:
//   node --test scripts/import-documents.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ALLOWED_EXTENSIONS,
  containsSsnPattern,
  createApiClient,
  DOCUMENT_KINDS,
  dollarsToCents,
  EXT_TO_MIME,
  inferKind,
  isIgnoredName,
  MANIFEST_COLUMNS,
  MAX_UPLOAD_BYTES,
  MEMBER_ROLES,
  manifestTemplateRows,
  markLocalDuplicates,
  normalizeRelPath,
  ORG_TYPES,
  PAST_OUTCOMES,
  parseBaseUrl,
  parseCsv,
  parseInviteList,
  parseManifest,
  planImport,
  retryDelayMs,
  sensitiveNameReason,
  toCsv,
  uploadFields,
  validateFile,
} from "./lib/import-helpers.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, "..", rel), "utf8");

describe("server mirrors", () => {
  const enums = read("src/shared/enums.ts");
  const arrayOf = (name) => {
    const m = new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const`).exec(enums);
    assert.ok(m, `${name} not found in src/shared/enums.ts`);
    return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  };

  it("enums match src/shared/enums.ts", () => {
    assert.deepEqual(DOCUMENT_KINDS, arrayOf("DOCUMENT_KINDS"));
    assert.deepEqual(PAST_OUTCOMES, arrayOf("PAST_OUTCOMES"));
    assert.deepEqual(MEMBER_ROLES, arrayOf("MEMBER_ROLES"));
    assert.deepEqual(ORG_TYPES, arrayOf("ORG_TYPES"));
  });

  it("extension allowlist and size limit match services/ingestion/files.ts", () => {
    const files = read("src/worker/services/ingestion/files.ts");
    const table = /const EXT_TO_MIME[^=]*= \{([\s\S]*?)\};/.exec(files);
    assert.ok(table);
    const server = Object.fromEntries(
      [...table[1].matchAll(/(\w+): "([^"]+)"/g)].map((m) => [m[1], m[2]]),
    );
    assert.deepEqual(EXT_TO_MIME, server);
    assert.match(files, /MAX_UPLOAD_BYTES = 25 \* 1024 \* 1024;/);
    assert.equal(MAX_UPLOAD_BYTES, 25 * 1024 * 1024);
  });
});

describe("inferKind", () => {
  const cases = [
    ["past-applications/awarded/2023 NMCF.pdf", "past_application", "folder", "awarded"],
    ["Past Applications/Declined/BIA 2021.docx", "past_application", "folder", "declined"],
    ["past_applications/not funded/x.pdf", "past_application", "folder", "declined"],
    ["past-applications/funded/x.pdf", "past_application", "folder", "awarded"],
    ["past-applications/2022/BIA-proposal-pending.pdf", "past_application", "folder", "pending"],
    ["past-applications/x.pdf", "past_application", "folder", undefined],
    ["awarded/2021 proposal.pdf", "past_application", "filename", "awarded"],
    ["financials/2023 Audit.pdf", "financial_statement", "folder", undefined],
    ["financials/FY2023 budget.xlsx", "financial_statement", "folder", undefined],
    ["Form 990 2022.pdf", "financial_statement", "filename", undefined],
    ["scans/FY24 Budget.xlsx", "budget", "filename", undefined],
    ["Mission Statement.docx", "mission_statement", "filename", undefined],
    ["award-letters/NMCF 2023.pdf", "award_letter", "folder", undefined],
    ["rejection-letters/x.pdf", "rejection_letter", "folder", undefined],
    ["Letters of Support/Navajo Nation.pdf", "letter_of_support", "folder", undefined],
    ["governance/Bylaws (amended 2019).pdf", "charter_bylaws", "filename", undefined],
    ["annual-reports/2024.pdf", "annual_report", "folder", undefined],
    ["programs/Bridge program.docx", "program_description", "folder", undefined],
    ["transcripts/board chair.txt", "interview_transcript", "folder", undefined],
    ["policies/conflict of interest.pdf", "policy", "folder", undefined],
    ["random.pdf", "other", "default", undefined],
  ];
  for (const [path, kind, kindSource, pastOutcome] of cases) {
    it(path, () => {
      const r = inferKind(path);
      assert.equal(r.kind, kind);
      assert.equal(r.kindSource, kindSource);
      assert.equal(r.pastOutcome, pastOutcome);
    });
  }

  it("the deepest matching folder wins", () => {
    assert.equal(inferKind("financials/budgets/2024.xlsx").kind, "budget");
    assert.equal(inferKind("budgets/financials/2024.pdf").kind, "financial_statement");
  });

  it("only past applications get an outcome", () => {
    assert.equal(inferKind("budgets/awarded/x.xlsx").pastOutcome, undefined);
  });
});

describe("validateFile", () => {
  it("accepts allowed extensions up to 25 MB", () => {
    assert.deepEqual(validateFile({ name: "a.pdf", size: MAX_UPLOAD_BYTES }), { ok: true });
    assert.equal(validateFile({ name: "A.PDF", size: 10 }).ok, true);
    assert.equal(validateFile({ name: "x/photo.jpeg", size: 10 }).ok, true);
    for (const ext of ALLOWED_EXTENSIONS)
      assert.equal(validateFile({ name: `f.${ext}`, size: 1 }).ok, true);
  });

  it("rejects oversize, empty and disallowed files", () => {
    assert.equal(
      validateFile({ name: "a.pdf", size: MAX_UPLOAD_BYTES + 1 }).code,
      "file_too_large",
    );
    assert.equal(validateFile({ name: "a.pdf", size: 0 }).code, "empty_file");
    for (const name of ["a.exe", "a.zip", "a.pptx", "a.xls", "README", "a.pdf.lnk"]) {
      assert.equal(validateFile({ name, size: 10 }).code, "unsupported_file_type", name);
    }
  });
});

describe("paths", () => {
  it("normalizes separators, ./ and Unicode form; rejects escapes", () => {
    assert.equal(normalizeRelPath("./a\\b//c.pdf"), "a/b/c.pdf");
    assert.equal(normalizeRelPath("Dine\u0301.pdf"), "Din\u00e9.pdf");
    for (const bad of ["", "/etc/passwd", "../x.pdf", "a/../../x.pdf", "C:/x.pdf"]) {
      assert.equal(normalizeRelPath(bad), null, bad);
    }
  });

  it("ignores hidden, system and Office lock files", () => {
    for (const n of [".DS_Store", "._x.pdf", "~$draft.docx", "Thumbs.db", "desktop.ini"])
      assert.ok(isIgnoredName(n), n);
    assert.equal(isIgnoredName("mission.pdf"), false);
  });
});

describe("parseCsv / toCsv", () => {
  it("handles quotes, escaped quotes, CRLF, BOM and newlines in fields", () => {
    const rows = parseCsv(
      '\uFEFFpath,notes\r\n"a, b.pdf","say ""hi"""\r\nc.pdf,"two\nlines"\n\n,,\n',
    );
    assert.deepEqual(
      rows.map((r) => r.cells),
      [
        ["path", "notes"],
        ["a, b.pdf", 'say "hi"'],
        ["c.pdf", "two\nlines"],
      ],
    );
    assert.deepEqual(
      rows.map((r) => r.line),
      [1, 2, 3],
    );
  });

  it("round-trips through toCsv", () => {
    const data = [
      ["path", "notes"],
      ["a, b.pdf", 'q "x"'],
      ["c.pdf", " lead"],
    ];
    assert.deepEqual(
      parseCsv(toCsv(data)).map((r) => r.cells),
      data,
    );
  });

  it("throws on an unterminated quote", () => {
    assert.throws(() => parseCsv('path\n"oops.pdf\n'), /Unterminated/);
  });
});

describe("parseManifest", () => {
  const header = MANIFEST_COLUMNS.join(",");

  it("parses a filled-in manifest", () => {
    const csv = `${header}
past-applications/awarded/nmcf.pdf,past_application,NMCF 2023 proposal,awarded,New Mexico Community Foundation,"$12,500.50",2023,
mission.docx,,,,,,,
./financials\\audit.pdf,FINANCIAL_STATEMENT,,,,,,"Audited, FY23"
`;
    const { entries, errors, warnings } = parseManifest(csv);
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
    assert.deepEqual(entries.get("past-applications/awarded/nmcf.pdf"), {
      path: "past-applications/awarded/nmcf.pdf",
      line: 2,
      kind: "past_application",
      title: "NMCF 2023 proposal",
      pastOutcome: "awarded",
      pastFunder: "New Mexico Community Foundation",
      pastAmountCents: 1_250_050,
      pastYear: 2023,
    });
    assert.deepEqual(entries.get("mission.docx"), { path: "mission.docx", line: 3 });
    assert.equal(entries.get("financials/audit.pdf").kind, "financial_statement");
    assert.equal(entries.get("financials/audit.pdf").notes, "Audited, FY23");
  });

  it("accepts a subset of columns in any order, case-insensitively", () => {
    const { entries, errors } = parseManifest("Kind,PATH\nbudget,b.xlsx\n");
    assert.deepEqual(errors, []);
    assert.equal(entries.get("b.xlsx").kind, "budget");
  });

  it("rejects unknown columns and a missing path column", () => {
    assert.match(
      parseManifest("path,outcome\na.pdf,awarded\n").errors[0],
      /Unknown manifest column "outcome"/,
    );
    assert.match(parseManifest("kind\nbudget\n").errors[0], /needs a "path" column/);
    assert.deepEqual(parseManifest("").errors, ["Manifest is empty"]);
  });

  it("reports every bad row with its line number", () => {
    const csv = `${header}
a.pdf,grant,,,,,,
b.pdf,past_application,,won,,,,
c.pdf,past_application,,,,12k,,
d.pdf,past_application,,,,,1850,
../e.pdf,other,,,,,,
f.pdf,other,,,,,,
f.pdf,budget,,,,,,
g.pdf,other,,,,,,,extra
`;
    const { entries, errors } = parseManifest(csv);
    assert.equal(errors.length, 7, errors.join("\n"));
    assert.match(errors[0], /^Line 2: unknown kind "grant"/);
    assert.match(errors[1], /^Line 3: unknown pastOutcome "won"/);
    assert.match(errors[2], /^Line 4: pastAmountUSD/);
    assert.match(errors[3], /^Line 5: pastYear "1850"/);
    assert.match(errors[4], /^Line 6: invalid path/);
    assert.match(errors[5], /^Line 8: duplicate path "f.pdf"/);
    assert.match(errors[6], /^Line 9: more cells than header/);
    assert.deepEqual([...entries.keys()], ["f.pdf"]);
  });

  it("accepts kind=skip and warns about past* fields on unrelated kinds", () => {
    const { entries, errors, warnings } = parseManifest(
      `${header}\nx.pdf,skip,,,,,,\nm.pdf,mission_statement,,awarded,,,,\n`,
    );
    assert.deepEqual(errors, []);
    assert.equal(entries.get("x.pdf").kind, "skip");
    assert.match(warnings[0], /Line 3: past\* columns are set but kind is mission_statement/);
  });

  it("enforces server field lengths", () => {
    const { errors } = parseManifest(
      `path,title,notes\na.pdf,${"t".repeat(301)},\nb.pdf,,${"n".repeat(5001)}\n`,
    );
    assert.equal(errors.length, 2);
  });
});

describe("dollarsToCents", () => {
  it("parses common formats", () => {
    assert.equal(dollarsToCents("12500"), 1_250_000);
    assert.equal(dollarsToCents("$12,500.5"), 1_250_050);
    assert.equal(dollarsToCents(" 0.99 "), 99);
  });
  it("rejects anything else", () => {
    for (const bad of ["12k", "-5", "1.234", "", "abc", "1e6", "2000000000"]) {
      assert.throws(() => dollarsToCents(bad), undefined, bad);
    }
  });
});

describe("personal-data screening", () => {
  it("flags names that suggest client records, IDs or health info", () => {
    for (const p of [
      "Client Roster 2024.xlsx",
      "intake/forms.pdf",
      "staff/W-9 forms.pdf",
      "SSN list.csv",
      "medical/x.pdf",
    ]) {
      assert.ok(sensitiveNameReason(p), p);
    }
    for (const p of ["mission.pdf", "past-applications/awarded/x.pdf", "financials/990.pdf"]) {
      assert.equal(sensitiveNameReason(p), null, p);
    }
  });

  it("detects SSN-shaped numbers but not EINs or phone numbers", () => {
    assert.ok(containsSsnPattern("name,ssn\nJane,123-45-6789\n"));
    assert.equal(containsSsnPattern("EIN 85-0123456, call 505-722-3456"), false);
    assert.equal(containsSsnPattern("000-12-3456 666-12-3456 123-00-4567"), false);
  });
});

describe("planImport", () => {
  const files = [
    { path: "past-applications/awarded/nmcf.pdf", size: 1000 },
    { path: "mission.docx", size: 500 },
    { path: "big.pdf", size: MAX_UPLOAD_BYTES + 1 },
    { path: "slides.pptx", size: 100 },
    { path: "Client Roster.xlsx", size: 100 },
    { path: "notes.txt", size: 100, ssnHit: true },
    { path: "old.pdf", size: 100 },
  ];

  it("infers kinds and validates without a manifest", () => {
    const { items, errors } = planImport(files);
    assert.deepEqual(errors, []);
    const by = Object.fromEntries(items.map((i) => [i.path, i]));
    assert.equal(by["past-applications/awarded/nmcf.pdf"].action, "upload");
    assert.equal(by["past-applications/awarded/nmcf.pdf"].pastOutcome, "awarded");
    assert.equal(by["mission.docx"].kind, "mission_statement");
    assert.equal(by["big.pdf"].action, "invalid");
    assert.equal(by["slides.pptx"].action, "invalid");
    assert.equal(by["Client Roster.xlsx"].action, "blocked");
    assert.equal(by["notes.txt"].action, "blocked");
    assert.match(by["notes.txt"].reason, /SSN/);
    assert.equal(by["old.pdf"].kind, "other");
    assert.ok(by["old.pdf"].warnings.some((w) => /no folder\/filename rule/.test(w)));
  });

  it("applies manifest overrides, skip, explicit unblock, and flags unknown paths", () => {
    const { entries } = parseManifest(
      [
        "path,kind,pastOutcome,pastFunder,notes",
        "past-applications/awarded/nmcf.pdf,,declined,NMCF,",
        "old.pdf,skip,,,",
        "Client Roster.xlsx,program_description,,,REVIEW: name contains clients",
        "missing.pdf,other,,,",
      ].join("\n"),
    );
    const { items, errors } = planImport(files, entries);
    const by = Object.fromEntries(items.map((i) => [i.path, i]));
    const nmcf = by["past-applications/awarded/nmcf.pdf"];
    assert.equal(nmcf.kind, "past_application");
    assert.equal(nmcf.kindSource, "folder");
    assert.equal(nmcf.pastOutcome, "declined");
    assert.equal(nmcf.pastFunder, "NMCF");
    assert.equal(by["old.pdf"].action, "excluded");
    assert.equal(by["Client Roster.xlsx"].action, "upload");
    assert.equal(
      by["Client Roster.xlsx"].notes,
      undefined,
      "template markers are not sent as notes",
    );
    assert.ok(by["mission.docx"].warnings.includes("not in manifest; kind inferred"));
    assert.deepEqual(errors, ['Manifest line 5: "missing.pdf" matches no file in the folder']);
  });

  it("writes a template where flagged and invalid files start as skip", () => {
    const rows = manifestTemplateRows(files);
    assert.deepEqual(rows[0], MANIFEST_COLUMNS);
    const by = Object.fromEntries(rows.slice(1).map((r) => [r[0], r]));
    assert.equal(by["mission.docx"][1], "mission_statement");
    assert.equal(by["past-applications/awarded/nmcf.pdf"][3], "awarded");
    assert.equal(by["Client Roster.xlsx"][1], "skip");
    assert.match(by["Client Roster.xlsx"][7], /^REVIEW:/);
    assert.equal(by["big.pdf"][1], "skip");
    // The template parses back cleanly.
    const { errors } = parseManifest(toCsv(rows));
    assert.deepEqual(errors, []);
  });
});

describe("markLocalDuplicates", () => {
  it("keeps the best-classified copy of identical files", () => {
    const items = [
      { path: "misc/copy.txt", kind: "other", kindSource: "folder", action: "upload", sha256: "a" },
      {
        path: "Mission Statement.txt",
        kind: "mission_statement",
        kindSource: "filename",
        action: "upload",
        sha256: "a",
      },
      { path: "b.pdf", kind: "budget", kindSource: "folder", action: "upload", sha256: "b" },
      { path: "c.pdf", kind: "budget", kindSource: "folder", action: "invalid", sha256: "b" },
    ];
    markLocalDuplicates(items);
    assert.deepEqual(
      items.map((i) => i.action),
      ["duplicate", "upload", "upload", "invalid"],
    );
    assert.equal(items[0].reason, "identical to Mission Statement.txt");
  });
});

describe("uploadFields", () => {
  it("always sends consent=true and only the fields that are set", () => {
    assert.deepEqual(uploadFields({ kind: "budget" }), { kind: "budget", consent: "true" });
    assert.deepEqual(
      uploadFields({
        kind: "past_application",
        pastOutcome: "awarded",
        pastAmountCents: 0,
        pastYear: 2023,
        title: "T",
      }),
      {
        kind: "past_application",
        consent: "true",
        title: "T",
        pastOutcome: "awarded",
        pastAmountCents: "0",
        pastYear: "2023",
      },
    );
  });
});

describe("parseInviteList", () => {
  it("parses email:role pairs", () => {
    const r = parseInviteList(" A@x.org:Reviewer, b@y.org:editor ,c@z.org ");
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.invites, [
      { email: "a@x.org", role: "reviewer" },
      { email: "b@y.org", role: "editor" },
      { email: "c@z.org", role: "viewer" },
    ]);
  });
  it("rejects owner, unknown roles, bad emails and repeats", () => {
    const r = parseInviteList(
      "a@x.org:owner,b@y.org:boss,nope:editor,c@z.org:admin,c@z.org:viewer",
    );
    assert.equal(r.errors.length, 4);
    assert.deepEqual(r.invites, [{ email: "c@z.org", role: "admin" }]);
  });
});

describe("retryDelayMs", () => {
  it("honours Retry-After seconds and HTTP dates", () => {
    assert.equal(retryDelayMs(0, "7"), 7250);
    assert.equal(retryDelayMs(0, "9999"), 120_000);
    const now = () => Date.parse("2026-11-19T00:00:00Z");
    assert.equal(retryDelayMs(0, "Thu, 19 Nov 2026 00:00:30 GMT", { now }), 30_000);
  });
  it("backs off exponentially with jitter otherwise", () => {
    assert.equal(retryDelayMs(0, null, { random: () => 0 }), 500);
    assert.equal(retryDelayMs(3, null, { random: () => 1 }), 8000);
    assert.equal(retryDelayMs(20, null, { random: () => 1 }), 60_000);
  });
});

describe("createApiClient", () => {
  it("requires https except for localhost", () => {
    assert.equal(parseBaseUrl("https://grants.example/some/path"), "https://grants.example");
    assert.equal(parseBaseUrl("http://localhost:5173"), "http://localhost:5173");
    assert.throws(() => parseBaseUrl("http://grants.example"), /https/);
    assert.throws(() => parseBaseUrl("grants.example"), /not a URL/);
  });

  it("signs in, replays the session cookie with Origin, and retries 429 with Retry-After", async () => {
    const calls = [];
    const sleeps = [];
    let uploads = 0;
    const fetchImpl = async (url, init) => {
      calls.push({ url: String(url), method: init.method, headers: init.headers, body: init.body });
      const u = new URL(url);
      if (u.pathname === "/api/auth/sign-in/email") {
        return new Response(JSON.stringify({ user: { id: "u1" } }), {
          status: 200,
          headers: [
            ["Set-Cookie", "__Secure-better-auth.session_token=abc.def; Path=/; HttpOnly; Secure"],
            ["Set-Cookie", "__Secure-better-auth.session_data=xyz; Path=/"],
          ],
        });
      }
      if (u.pathname === "/api/orgs/org_1/documents") {
        uploads++;
        if (uploads === 1)
          return new Response("{}", { status: 429, headers: { "Retry-After": "3" } });
        return new Response(JSON.stringify({ id: "doc_1", status: "uploaded" }), { status: 201 });
      }
      return new Response("{}", { status: 404 });
    };
    const client = createApiClient({
      base: "https://grants.example",
      fetchImpl,
      sleep: async (ms) => sleeps.push(ms),
    });
    await client.signIn("me@x.org", "pw-1234567890");
    assert.equal(JSON.parse(calls[0].body).password, "pw-1234567890");
    assert.equal(calls[0].headers.Origin, "https://grants.example");

    let built = 0;
    const r = await client.request("POST", "/api/orgs/org_1/documents", {
      body: () => {
        built++;
        const f = new FormData();
        f.append("kind", "other");
        return f;
      },
    });
    assert.equal(r.status, 201);
    assert.equal(r.data.id, "doc_1");
    assert.deepEqual(sleeps, [3250]);
    assert.equal(built, 2, "multipart body is rebuilt for the retry");
    for (const c of calls.slice(1)) {
      assert.equal(c.headers.Origin, "https://grants.example");
      assert.equal(
        c.headers.Cookie,
        "__Secure-better-auth.session_token=abc.def; __Secure-better-auth.session_data=xyz",
      );
    }
  });

  it("reports sign-in failures without a session", async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({ code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" }),
        { status: 401 },
      );
    const client = createApiClient({
      base: "https://grants.example",
      fetchImpl,
      sleep: async () => {},
    });
    await assert.rejects(
      client.signIn("me@x.org", "wrong"),
      /Sign-in failed: Invalid email or password/,
    );
    assert.equal(client.hasSession(), false);
  });
});
