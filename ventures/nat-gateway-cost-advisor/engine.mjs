// Zero-dependency, deterministic NAT gateway cost advisor. One row per
// (NAT gateway, destination, GB per month) in; what the NAT gateway costs, which
// destinations should bypass it through a VPC endpoint, the net monthly saving
// after the endpoint's own hourly fee, and the `aws ec2 create-vpc-endpoint`
// commands out.
//
// What is arithmetic and what is a model: prices are list prices times the
// rows. What is NOT known: the GB per month per destination is a number you
// read from VPC Flow Logs or Cost Explorer, so traffic you did not label is
// counted as internet and never recommended for an endpoint.

// ILLUSTRATIVE and dated; AWS reprices by region. Overridable.
export const PRICES_AS_OF = "us-east-1 list prices (NAT gateway $0.045/hour and $0.045 per GB processed; public IPv4 address $0.005/hour; interface endpoint $0.01/hour per AZ and $0.01 per GB; gateway endpoints for S3 and DynamoDB free); no free tier, no volume discounts; verify against the VPC pricing page";
export const DEFAULT_PRICES = { natHour: 0.045, natGb: 0.045, eipHour: 0.005, ifaceHour: 0.01, ifaceGb: 0.01, hours: 730 };
export const DEFAULTS = { azs: 2, region: "us-east-1", minMonthlySaving: 5, errorSaving: 50, idleGb: 10 };

// Services reachable without leaving the AWS network. `gateway` endpoints are
// free; `interface` endpoints bill per AZ per hour, and some services need
// several (ECR needs api + dkr, SSM needs ssm + ssmmessages + ec2messages, ECS
// needs ecs + ecs-agent + ecs-telemetry).
export const SERVICES = {
  s3: { kind: "gateway", names: ["s3"], label: "Amazon S3" },
  dynamodb: { kind: "gateway", names: ["dynamodb"], label: "Amazon DynamoDB" },
  ecr: { kind: "interface", names: ["ecr.api", "ecr.dkr"], label: "Amazon ECR", note: "ECR image layers are stored in S3, so also add the free S3 gateway endpoint or pulls still cross the NAT." },
  logs: { kind: "interface", names: ["logs"], label: "CloudWatch Logs" },
  monitoring: { kind: "interface", names: ["monitoring"], label: "CloudWatch metrics" },
  sts: { kind: "interface", names: ["sts"], label: "AWS STS" },
  secretsmanager: { kind: "interface", names: ["secretsmanager"], label: "Secrets Manager" },
  ssm: { kind: "interface", names: ["ssm", "ssmmessages", "ec2messages"], label: "Systems Manager" },
  kms: { kind: "interface", names: ["kms"], label: "AWS KMS" },
  sqs: { kind: "interface", names: ["sqs"], label: "Amazon SQS" },
  sns: { kind: "interface", names: ["sns"], label: "Amazon SNS" },
  kinesis: { kind: "interface", names: ["kinesis-streams"], label: "Kinesis Data Streams" },
  lambda: { kind: "interface", names: ["lambda"], label: "AWS Lambda API" },
  ecs: { kind: "interface", names: ["ecs", "ecs-agent", "ecs-telemetry"], label: "Amazon ECS" },
};
const ALIASES = {
  "amazon-s3": "s3", "ddb": "dynamodb", "dynamo": "dynamodb", "cloudwatch-logs": "logs", "cloudwatchlogs": "logs",
  "cloudwatch": "monitoring", "secrets-manager": "secretsmanager", "secrets": "secretsmanager", "kinesis-streams": "kinesis",
  "ecr.api": "ecr", "ecr.dkr": "ecr",
};

const toNum = (s) => {
  const n = Number(String(s ?? "").trim().replace(/,/g, ""));
  return String(s ?? "").trim() !== "" && Number.isFinite(n) && n >= 0 ? n : NaN;
};
export const normalizeDestination = (raw) => {
  const d = String(raw ?? "").trim().toLowerCase();
  if (SERVICES[d]) return d;
  if (ALIASES[d]) return ALIASES[d];
  return "internet";
};

/** Parses `gateway,destination,gb_per_month[,vpc]`; header names remap columns. */
export function parseTraffic(text) {
  const rows = [];
  let skipped = 0;
  let col = { gateway: 0, dest: 1, gb: 2, vpc: 3 };
  let sawHeader = false;
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const cells = line.split(/\s*[,\t]\s*/);
    if (!sawHeader && rows.length === 0 && /dest|service/i.test(line) && /gb|bytes|traffic/i.test(line)) {
      sawHeader = true;
      const find = (re) => cells.findIndex((c) => re.test(c));
      const m = { gateway: find(/gate|^nat|^name|^id/i), dest: find(/dest|service/i), gb: find(/gb|traffic/i), vpc: find(/vpc/i) };
      for (const k of Object.keys(m)) if (m[k] >= 0) col[k] = m[k];
      continue;
    }
    const gb = toNum(cells[col.gb]);
    const gateway = String(cells[col.gateway] ?? "").trim();
    if (!gateway || String(cells[col.dest] ?? "").trim() === "" || Number.isNaN(gb)) { skipped += 1; continue; }
    const raw_dest = String(cells[col.dest]).trim();
    const vpc = col.vpc < cells.length && cells[col.vpc] ? cells[col.vpc].trim() : "";
    rows.push({ gateway, destination: normalizeDestination(raw_dest), label: raw_dest, gb, vpc });
  }
  return { rows, skipped };
}

const usd = (n) => `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;
const svcName = (region, n) => `com.amazonaws.${region}.${n}`;

/** Commands to create the endpoint(s) for a service in a VPC. */
export function endpointCommands(service, region, vpc = "<vpc-id>") {
  const s = SERVICES[service];
  return s.names.map((n) => s.kind === "gateway"
    ? `aws ec2 create-vpc-endpoint --vpc-id ${vpc} --vpc-endpoint-type Gateway --service-name ${svcName(region, n)} --route-table-ids <private-route-table-ids>`
    : `aws ec2 create-vpc-endpoint --vpc-id ${vpc} --vpc-endpoint-type Interface --service-name ${svcName(region, n)} --subnet-ids <one-private-subnet-per-az> --security-group-ids <sg-allowing-443-from-the-vpc> --private-dns-enabled`);
}

/** Net monthly saving from moving `gb` of `service` traffic off the NAT gateway. */
export function endpointEconomics(service, gb, o, prices = DEFAULT_PRICES) {
  const s = SERVICES[service];
  const natCost = gb * prices.natGb;
  if (s.kind === "gateway") return { natCost, endpointCost: 0, net: natCost, breakEvenGb: 0, fixed: 0 };
  const fixed = s.names.length * o.azs * prices.ifaceHour * prices.hours;
  const endpointCost = fixed + gb * prices.ifaceGb;
  return { natCost, endpointCost, net: natCost - endpointCost, breakEvenGb: fixed / (prices.natGb - prices.ifaceGb), fixed };
}

export function analyze(parsed, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const prices = { ...DEFAULT_PRICES, ...(options.prices ?? {}) };
  const rows = parsed.rows;
  if (!rows.length) return { count: 0, findings: [], skipped: parsed.skipped ?? 0 };
  const findings = [];
  const add = (rule, severity, row, message) => findings.push({ rule, severity, row, message });

  // Per-gateway fixed cost + processing, aggregated.
  const gateways = new Map();
  for (const r of rows) {
    const g = gateways.get(r.gateway) ?? { name: r.gateway, gb: 0, vpc: r.vpc };
    g.gb += r.gb;
    gateways.set(r.gateway, g);
  }
  const natFixed = (prices.natHour + prices.eipHour) * prices.hours;
  const gwList = [...gateways.values()].map((g) => ({ name: g.name, gb: g.gb, fixed: natFixed, processing: g.gb * prices.natGb, total: natFixed + g.gb * prices.natGb }));

  // An endpoint serves its whole VPC, so aggregate per (vpc, service) across gateways.
  const groups = new Map();
  for (const r of rows) {
    if (r.destination === "internet") continue;
    const k = `${r.vpc}\u0000${r.destination}`;
    const g = groups.get(k) ?? { vpc: r.vpc, service: r.destination, gb: 0, gateways: new Set() };
    g.gb += r.gb;
    g.gateways.add(r.gateway);
    groups.set(k, g);
  }
  const plans = [];
  for (const g of groups.values()) {
    const e = endpointEconomics(g.service, g.gb, o, prices);
    const worth = e.net >= o.minMonthlySaving;
    plans.push({ ...g, gateways: [...g.gateways], ...e, worth, commands: worth ? endpointCommands(g.service, o.region, g.vpc || "<vpc-id>") : [] });
  }
  plans.sort((a, b) => b.net - a.net);

  for (const p of plans) {
    const s = SERVICES[p.service];
    const where = p.vpc ? ` in ${p.vpc}` : "";
    if (p.worth && s.kind === "gateway") {
      add("gateway-endpoint-free", p.net >= o.errorSaving ? "error" : "warn", p.service, `${s.label}${where}: ${p.gb.toLocaleString("en-US")} GB/month goes through the NAT gateway at ${usd(p.natCost)}. A gateway endpoint is free and removes that charge entirely (net ${usd(p.net)}/month). It is a route-table entry, so no hourly fee and no data processing fee.`);
    } else if (p.worth) {
      add("interface-endpoint-saves", p.net >= o.errorSaving ? "error" : "warn", p.service, `${s.label}${where}: ${p.gb.toLocaleString("en-US")} GB/month costs ${usd(p.natCost)} through the NAT gateway against ${usd(p.endpointCost)} through ${s.names.length} interface endpoint${s.names.length > 1 ? "s" : ""} across ${o.azs} AZ${o.azs > 1 ? "s" : ""} (${usd(p.fixed)} hourly fees + $${prices.ifaceGb}/GB): about ${usd(p.net)}/month cheaper.${s.note ? ` ${s.note}` : ""}`);
    } else if (s.kind === "interface") {
      const n = s.names.length;
      const why = p.gb < p.breakEvenGb ? `is below the ${Math.ceil(p.breakEvenGb).toLocaleString("en-US")} GB/month break-even for ${n} interface endpoint${n > 1 ? "s" : ""} across ${o.azs} AZ${o.azs > 1 ? "s" : ""}` : `beats the NAT gateway by only ${usd(p.net)}/month, under the ${usd(o.minMonthlySaving)} threshold`;
      add("interface-endpoint-not-worth", "info", p.service, `${s.label}${where}: ${p.gb.toLocaleString("en-US")} GB/month ${why}; leaving it on the NAT gateway is ${p.net < 0 ? "cheaper" : "about as cheap"} (endpoint net ${usd(p.net)}). Endpoints can still be worth it for private-only subnets.`);
    }
  }
  for (const g of gwList) {
    if (g.gb < o.idleGb) add("nat-gateway-idle", "warn", g.name, `${g.name}: only ${g.gb.toLocaleString("en-US")} GB/month but ${usd(g.fixed)}/month in hourly and public IPv4 charges. If nothing needs outbound internet from those subnets, delete it; if a few subnets do, share one NAT gateway across AZs for dev and test.`);
  }
  const internetGb = rows.filter((r) => r.destination === "internet").reduce((a, r) => a + r.gb, 0);
  const totalGb = rows.reduce((a, r) => a + r.gb, 0);
  if (internetGb > 0 && internetGb / totalGb >= 0.5 && internetGb * prices.natGb >= o.minMonthlySaving) {
    add("internet-dominant", "info", "", `${Math.round((internetGb / totalGb) * 100)}% of NAT traffic (${internetGb.toLocaleString("en-US")} GB, ${usd(internetGb * prices.natGb)}/month processing) is labelled internet or unrecognised. Endpoints cannot help; options are IPv6 through an egress-only internet gateway (no per-GB processing fee), caching or mirroring package and image downloads, and checking that unlabelled rows are not really AWS services.`);
  }

  const nat = gwList.reduce((a, g) => a + g.total, 0);
  const saving = plans.filter((p) => p.worth).reduce((a, p) => a + p.net, 0);
  const idleSaving = gwList.filter((g) => g.gb < o.idleGb).reduce((a, g) => a + g.fixed, 0);
  if (!findings.some((f) => f.severity !== "info")) add("nat-fine", "info", "", `No AWS-bound destination is large enough to beat the NAT gateway by ${usd(o.minMonthlySaving)}/month.`);
  return {
    count: rows.length, skipped: parsed.skipped ?? 0, gateways: gwList, plans,
    totals: { nat, saving, idleSaving, after: nat - saving, annual: saving * 12, internetGb, totalGb },
    prices, options: o, findings,
  };
}

export function summarize(report) {
  if (!report.count) return { status: "none", errors: 0, warns: 0, text: "No usable rows found. Expected lines like: nat-0a1,s3,4200 (NAT gateway, destination, GB per month)." };
  const errors = report.findings.filter((f) => f.severity === "error").length;
  const warns = report.findings.filter((f) => f.severity === "warn").length;
  const status = errors ? "error" : warns ? "warn" : "ok";
  const t = report.totals;
  return { status, errors, warns, text: `${report.gateways.length} NAT gateway(s), ${t.totalGb.toLocaleString("en-US")} GB/month. Modelled NAT cost $${t.nat.toFixed(2)}/month; ${t.saving > 0.005 ? `endpoints would save about $${t.saving.toFixed(2)}/month ($${t.annual.toFixed(0)}/year)` : "no endpoint beats the NAT gateway"}${t.idleSaving > 0 ? `; idle gateways add $${t.idleSaving.toFixed(2)}/month more if removed` : ""}.` };
}

export const INPUT_NOTES = [
  { what: "gateway,destination,gb_per_month", detail: "One row per NAT gateway and destination. Destination is s3, dynamodb, ecr, logs, monitoring, sts, secretsmanager, ssm, kms, sqs, sns, kinesis, lambda, ecs or anything else (counted as internet). GB per month from VPC Flow Logs or Cost Explorer's NatGateway-Bytes usage." },
  { what: "vpc (optional 4th column)", detail: "VPC id. An endpoint serves a whole VPC, so rows with the same vpc and destination are combined across NAT gateways. Without it all rows are treated as one VPC." },
  { what: "header row", detail: "One optional header; column names (gateway, destination, gb, vpc) remap the fields in any order." },
  { what: "# comment / blank lines", detail: "Ignored." },
  { what: "other lines", detail: "Counted as skipped, never guessed at." },
];
