// Approximate monthly cost delta for a Terraform *structured* plan (the JSON
// `terraform show -json <planfile>` prints). One question: "roughly what does
// this apply add to, or take off, the monthly AWS bill?"
//
// **This is an estimate from a small bundled price table, not a quote.** The
// table below is rounded us-east-1 on-demand list prices for the most common
// AWS resources, as best known when it was last edited (PRICE_TABLE_DATE). It
// was not fetched live and not verified line by line against AWS's price list.
// Anything it cannot price is listed as unpriced rather than counted as zero,
// and usage-based charges (S3, Lambda, data transfer, log ingestion...) are
// named but never guessed. No network call lives here: the engine only reads
// the plan JSON it is given, in the browser and in the Node CLI alike.

export const PRICE_TABLE_DATE = "2026-10-03";
export const BASE_REGION = "us-east-1";
export const HOURS_PER_MONTH = 730;

/**
 * Rough blended multipliers relative to us-east-1. Real regional differences
 * vary per service and per instance family; one number per region is a coarse
 * approximation and the report says so. Unknown regions are refused rather
 * than silently priced as us-east-1.
 */
export const REGION_MULTIPLIERS = {
  "us-east-1": 1.0,
  "us-east-2": 1.0,
  "us-west-2": 1.0,
  "us-west-1": 1.12,
  "ca-central-1": 1.07,
  "eu-west-1": 1.1,
  "eu-west-2": 1.14,
  "eu-west-3": 1.16,
  "eu-central-1": 1.15,
  "eu-north-1": 1.05,
  "ap-south-1": 1.07,
  "ap-southeast-1": 1.18,
  "ap-southeast-2": 1.2,
  "ap-northeast-1": 1.25,
  "ap-northeast-2": 1.2,
  "sa-east-1": 1.55,
};

// Size ladder shared by EC2, RDS and ElastiCache: price scales with size
// within a family, so one "large" price per family plus this ladder covers
// the table. Cross-checked against the well-known t3 and m5 ladders.
function sizeMultiplier(size) {
  const fixed = { nano: 0.0625, micro: 0.125, small: 0.25, medium: 0.5, large: 1, xlarge: 2 };
  if (Object.hasOwn(fixed, size)) return fixed[size];
  const m = /^(\d+)xlarge$/.exec(size);
  return m ? Number(m[1]) * 2 : null;
}

// Hourly USD for the `large` size of each family (Linux, shared tenancy).
export const EC2_LARGE_HOURLY = {
  t3: 0.0832, t3a: 0.0752, t4g: 0.0672,
  m5: 0.096, m6i: 0.096, m6g: 0.077, m7i: 0.1008, m7g: 0.0816,
  c5: 0.085, c6i: 0.085, c6g: 0.068, c7i: 0.0893, c7g: 0.0725,
  r5: 0.126, r6i: 0.126, r6g: 0.1008, r7i: 0.1323, r7g: 0.1071,
};
// RDS single-AZ, MySQL/PostgreSQL/MariaDB license-free engines.
export const RDS_LARGE_HOURLY = {
  t3: 0.136, t4g: 0.129, m5: 0.171, m6i: 0.171, m6g: 0.152, r5: 0.24, r6i: 0.24, r6g: 0.216,
};
// Aurora instance (compute only; storage and I/O are usage-based).
export const AURORA_LARGE_HOURLY = {
  t3: 0.164, t4g: 0.146, r5: 0.29, r6i: 0.29, r6g: 0.26,
};
export const ELASTICACHE_LARGE_HOURLY = {
  t3: 0.136, t4g: 0.13, m5: 0.156, m6g: 0.149, r5: 0.216, r6g: 0.206,
};

export const EBS_GB_MONTH = { gp3: 0.08, gp2: 0.1, io1: 0.125, io2: 0.125, st1: 0.045, sc1: 0.015, standard: 0.05 };
export const RDS_GB_MONTH = { gp2: 0.115, gp3: 0.115, io1: 0.125, io2: 0.125, standard: 0.1 };

export const FLAT_PRICES = {
  natGatewayHourly: 0.045,
  albHourly: 0.0225,
  nlbHourly: 0.0225,
  gwlbHourly: 0.0125,
  classicElbHourly: 0.025,
  eipHourly: 0.005,
  eksClusterHourly: 0.1,
  dynamoWcuHourly: 0.00065,
  dynamoRcuHourly: 0.00013,
  alarmMonthly: 0.1,
  highResAlarmMonthly: 0.3,
  dashboardMonthly: 3.0,
  ebsIopsMonthly: 0.065,
  gp3ExtraIopsMonthly: 0.005,
  gp3ExtraThroughputMonthly: 0.04,
  rdsIopsMonthly: 0.1,
};

/** Resource types with no direct charge of their own. Listed, not hidden. */
const NO_CHARGE_PREFIXES = [
  "aws_iam_", "aws_security_group", "aws_vpc", "aws_subnet", "aws_route", "aws_internet_gateway",
  "aws_network_acl", "aws_lb_listener", "aws_lb_target_group", "aws_alb_listener", "aws_alb_target_group",
  "aws_db_subnet_group", "aws_db_parameter_group", "aws_db_option_group", "aws_elasticache_subnet_group",
  "aws_elasticache_parameter_group", "aws_cloudwatch_log_stream", "aws_launch_template", "aws_key_pair",
  "aws_eip_association", "aws_ebs_volume_attachment", "aws_volume_attachment", "aws_s3_bucket_policy",
  "aws_s3_bucket_versioning", "aws_s3_bucket_public_access_block", "aws_s3_bucket_ownership_controls",
  "aws_s3_bucket_acl", "aws_lambda_permission", "aws_eks_addon", "aws_ssm_parameter", "aws_route53_zone_association",
  "aws_vpc_endpoint_subnet_association", "random_", "null_resource", "time_", "tls_", "local_file", "terraform_data",
];

/** Types known to bill mostly by usage; named in the report, never estimated. */
const USAGE_ONLY = {
  aws_s3_bucket: "S3 bills by GB stored, requests and transfer (about $0.023/GB-month for standard storage); none of that is in a plan.",
  aws_lambda_function: "Lambda bills by requests and GB-seconds; free tier applies. Provisioned concurrency is not in this table.",
  aws_cloudwatch_log_group: "CloudWatch Logs bills per GB ingested (about $0.50/GB) and stored; volume is not in a plan.",
  aws_sqs_queue: "SQS bills per request; volume is not in a plan.",
  aws_sns_topic: "SNS bills per publish and delivery; volume is not in a plan.",
  aws_kinesis_stream: "Kinesis bills per shard-hour and per PUT payload unit; shard count is not priced here.",
  aws_api_gateway_rest_api: "API Gateway bills per request.",
  aws_apigatewayv2_api: "API Gateway bills per request.",
  aws_cloudfront_distribution: "CloudFront bills per GB transferred and per request.",
  aws_secretsmanager_secret: "Secrets Manager bills about $0.40 per secret-month plus API calls; not in this table.",
  aws_kms_key: "KMS bills about $1 per key-month plus API calls; not in this table.",
  aws_route53_zone: "Route 53 bills about $0.50 per hosted zone-month plus queries; not in this table.",
};

const UNKNOWN = Symbol("unknown-until-apply");

// --- plan parsing --------------------------------------------------------

export function parsePlan(text) {
  let plan;
  try {
    plan = typeof text === "string" ? JSON.parse(text) : text;
  } catch {
    throw new Error("That is not valid JSON. Use the structured plan from: terraform show -json tfplan > plan.json");
  }
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    throw new Error("Expected a JSON object (the output of terraform show -json).");
  }
  if (!Array.isArray(plan.resource_changes)) {
    throw new Error(
      "This JSON has no resource_changes array, so it is not a structured plan. " +
        "Use terraform show -json tfplan (not terraform plan -json, and not the text output).",
    );
  }
  return plan;
}

/** Region named in the plan's provider configuration, if it is a literal. */
export function detectRegion(plan) {
  const cfg = plan?.configuration?.provider_config;
  if (!cfg || typeof cfg !== "object") return null;
  for (const p of Object.values(cfg)) {
    const region = p?.expressions?.region?.constant_value;
    if (typeof region === "string" && region) return region;
  }
  return null;
}

// Replace every value the plan says is unknown-until-apply with a sentinel so
// a pricer can tell "not set" from "cannot be known yet".
function markUnknown(value, unknown) {
  if (unknown === true) return UNKNOWN;
  if (Array.isArray(value) && Array.isArray(unknown)) return value.map((v, i) => markUnknown(v, unknown[i]));
  if (value && typeof value === "object" && unknown && typeof unknown === "object" && !Array.isArray(unknown)) {
    const out = { ...value };
    for (const [k, u] of Object.entries(unknown)) {
      if (u === true) out[k] = UNKNOWN;
      else if (k in out) out[k] = markUnknown(out[k], u);
    }
    return out;
  }
  return value;
}

// --- pricers -------------------------------------------------------------
//
// A pricer takes the resource's attribute object and a context ({mult}) and
// returns one of:
//   {status:"priced", components:[{label, monthly}], usage:[notes]}
//   {status:"usage", usage:[notes]}      (bills by usage only; $0 fixed)
//   {status:"free"}                       (no direct charge)
//   {status:"unpriced", reason}

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const hourly = (rate, ctx) => round2(rate * HOURS_PER_MONTH * ctx.mult);
const known = (v) => v !== undefined && v !== null && v !== UNKNOWN;
const num = (v) => (known(v) && Number.isFinite(Number(v)) ? Number(v) : null);

function unpriced(reason) {
  return { status: "unpriced", reason };
}
function priced(components, usage = []) {
  return { status: "priced", components: components.filter((c) => c.monthly !== 0 || c.keepZero), usage };
}

function splitClass(cls, prefix) {
  const s = String(cls);
  if (!s.startsWith(prefix)) return null;
  const [family, size] = s.slice(prefix.length).split(".");
  return family && size ? { family, size } : null;
}

function instanceHourly(table, cls, prefix) {
  if (!known(cls)) return { error: "instance type is not known until apply" };
  const parts = splitClass(cls, prefix);
  if (!parts) return { error: `"${cls}" is not a recognised instance type` };
  const base = table[parts.family];
  const mult = sizeMultiplier(parts.size);
  if (base === undefined || mult === null) {
    return { error: `${cls} is not in the bundled price table (families: ${Object.keys(table).join(", ")})` };
  }
  return { hourly: base * mult };
}

function ebsVolumeComponents(label, v, ctx) {
  const size = num(v.size ?? v.volume_size);
  if (size === null) return { error: `${label}: size is not set or not known until apply` };
  const type = known(v.type ?? v.volume_type) ? String(v.type ?? v.volume_type) : "gp3";
  const gbPrice = EBS_GB_MONTH[type];
  if (gbPrice === undefined) return { error: `${label}: volume type "${type}" is not in the price table` };
  const parts = [{ label: `${label} ${type} ${size} GB`, monthly: round2(size * gbPrice * ctx.mult) }];
  const iops = num(v.iops);
  const tput = num(v.throughput);
  if (type === "gp3") {
    if (iops !== null && iops > 3000) {
      parts.push({ label: `${label} extra IOPS`, monthly: round2((iops - 3000) * FLAT_PRICES.gp3ExtraIopsMonthly * ctx.mult) });
    }
    if (tput !== null && tput > 125) {
      parts.push({ label: `${label} extra throughput`, monthly: round2((tput - 125) * FLAT_PRICES.gp3ExtraThroughputMonthly * ctx.mult) });
    }
  } else if ((type === "io1" || type === "io2") && iops !== null) {
    parts.push({ label: `${label} provisioned IOPS`, monthly: round2(iops * FLAT_PRICES.ebsIopsMonthly * ctx.mult) });
  }
  return { parts };
}

const first = (v) => (Array.isArray(v) ? v[0] : v);

const PRICERS = {
  aws_instance(v, ctx) {
    const r = instanceHourly(EC2_LARGE_HOURLY, v.instance_type, "");
    if (r.error) return unpriced(r.error);
    const parts = [{ label: `${v.instance_type} on-demand Linux`, monthly: hourly(r.hourly, ctx) }];
    const notes = ["Assumes Linux, shared tenancy, on-demand; Windows, spot, dedicated hosts and savings plans are not modelled."];
    for (const [key, label] of [["root_block_device", "root volume"], ["ebs_block_device", "extra volume"]]) {
      const list = Array.isArray(v[key]) ? v[key] : [];
      for (const dev of list) {
        const e = ebsVolumeComponents(label, dev ?? {}, ctx);
        if (e.error) notes.push(`${e.error} -- left out of the estimate.`);
        else parts.push(...e.parts);
      }
    }
    return priced(parts, notes);
  },

  aws_ebs_volume(v, ctx) {
    const e = ebsVolumeComponents("volume", v, ctx);
    if (e.error) return unpriced(e.error);
    return priced(e.parts, ["Snapshots are billed separately by stored GB."]);
  },

  aws_db_instance(v, ctx) {
    const r = instanceHourly(RDS_LARGE_HOURLY, v.instance_class, "db.");
    if (r.error) return unpriced(r.error);
    const multiAz = v.multi_az === true;
    const parts = [{ label: `${v.instance_class}${multiAz ? " Multi-AZ" : ""}`, monthly: hourly(r.hourly * (multiAz ? 2 : 1), ctx) }];
    const notes = [];
    const engine = known(v.engine) ? String(v.engine) : "";
    if (/oracle|sqlserver|sql-server/.test(engine)) {
      notes.push(`Engine "${engine}" is license-included and costs more than this MySQL/PostgreSQL-class rate.`);
    }
    const gb = num(v.allocated_storage);
    if (gb === null) notes.push("allocated_storage is not set or not known until apply -- storage left out.");
    else {
      const type = known(v.storage_type) ? String(v.storage_type) : "gp2";
      const price = RDS_GB_MONTH[type];
      if (price === undefined) notes.push(`storage_type "${type}" is not in the table -- storage left out.`);
      else {
        parts.push({ label: `${gb} GB ${type} storage${multiAz ? " (Multi-AZ)" : ""}`, monthly: round2(gb * price * (multiAz ? 2 : 1) * ctx.mult) });
        const iops = num(v.iops);
        if ((type === "io1" || type === "io2") && iops !== null) {
          parts.push({ label: "provisioned IOPS", monthly: round2(iops * FLAT_PRICES.rdsIopsMonthly * (multiAz ? 2 : 1) * ctx.mult) });
        }
      }
    }
    notes.push("Backup storage beyond the free allocation, I/O and data transfer are not estimated.");
    return priced(parts, notes);
  },

  aws_rds_cluster_instance(v, ctx) {
    const r = instanceHourly(AURORA_LARGE_HOURLY, v.instance_class, "db.");
    if (r.error) return unpriced(r.error);
    return priced(
      [{ label: `Aurora ${v.instance_class}`, monthly: hourly(r.hourly, ctx) }],
      ["Aurora storage and I/O bill by usage and are not estimated. Serverless v2 ACUs are not priced here."],
    );
  },

  aws_nat_gateway(_v, ctx) {
    return priced(
      [{ label: "NAT gateway hours", monthly: hourly(FLAT_PRICES.natGatewayHourly, ctx) }],
      ["Data processing (about $0.045/GB) is usage-based and not estimated; it often dominates."],
    );
  },

  aws_lb(v, ctx) {
    const type = known(v.load_balancer_type) ? String(v.load_balancer_type) : "application";
    const rate = { application: FLAT_PRICES.albHourly, network: FLAT_PRICES.nlbHourly, gateway: FLAT_PRICES.gwlbHourly }[type];
    if (rate === undefined) return unpriced(`load_balancer_type "${type}" is not in the table`);
    return priced(
      [{ label: `${type} load balancer hours`, monthly: hourly(rate, ctx) }],
      ["LCU/NLCU charges are usage-based and not estimated."],
    );
  },

  aws_elb(_v, ctx) {
    return priced(
      [{ label: "classic load balancer hours", monthly: hourly(FLAT_PRICES.classicElbHourly, ctx) }],
      ["Data processed is usage-based and not estimated."],
    );
  },

  aws_eip(_v, ctx) {
    return priced(
      [{ label: "public IPv4 address", monthly: hourly(FLAT_PRICES.eipHourly, ctx) }],
      ["Billed whether or not it is attached (public IPv4 pricing)."],
    );
  },

  aws_eks_cluster(_v, ctx) {
    return priced([{ label: "EKS control plane", monthly: hourly(FLAT_PRICES.eksClusterHourly, ctx) }], [
      "Worker nodes are separate resources (node groups, Fargate, Karpenter) and priced on their own.",
    ]);
  },

  aws_eks_node_group(v, ctx) {
    const types = Array.isArray(v.instance_types) && v.instance_types.length ? v.instance_types : ["t3.medium"];
    const t = types[0];
    const r = instanceHourly(EC2_LARGE_HOURLY, t, "");
    if (r.error) return unpriced(r.error);
    const sc = first(v.scaling_config) ?? {};
    const n = num(sc.desired_size);
    if (n === null) return unpriced("scaling_config.desired_size is not set or not known until apply");
    const notes = ["Priced at desired_size; autoscaling can move this up or down."];
    if (types.length > 1) notes.push(`Several instance types listed; priced as the first (${t}).`);
    return priced([{ label: `${n} x ${t} nodes`, monthly: round2(n * hourly(r.hourly, ctx)) }], notes);
  },

  aws_elasticache_cluster(v, ctx) {
    const r = instanceHourly(ELASTICACHE_LARGE_HOURLY, v.node_type, "cache.");
    if (r.error) return unpriced(r.error);
    const n = num(v.num_cache_nodes) ?? 1;
    return priced([{ label: `${n} x ${v.node_type}`, monthly: round2(n * hourly(r.hourly, ctx)) }], ["Backup storage and data transfer are not estimated."]);
  },

  aws_elasticache_replication_group(v, ctx) {
    const r = instanceHourly(ELASTICACHE_LARGE_HOURLY, v.node_type, "cache.");
    if (r.error) return unpriced(r.error);
    let n = num(v.num_cache_clusters);
    if (n === null) {
      const groups = num(v.num_node_groups);
      const replicas = num(v.replicas_per_node_group);
      if (groups !== null) n = groups * (1 + (replicas ?? 0));
    }
    if (n === null) return unpriced("node count (num_cache_clusters or num_node_groups) is not set or not known until apply");
    return priced([{ label: `${n} x ${v.node_type}`, monthly: round2(n * hourly(r.hourly, ctx)) }], ["Backup storage and data transfer are not estimated."]);
  },

  aws_dynamodb_table(v, ctx) {
    const mode = known(v.billing_mode) ? String(v.billing_mode) : "PROVISIONED";
    if (mode === "PAY_PER_REQUEST") {
      return { status: "usage", usage: ["On-demand DynamoDB bills per request and by GB stored; none of that is in a plan."] };
    }
    const wcu = num(v.write_capacity);
    const rcu = num(v.read_capacity);
    if (wcu === null || rcu === null) return unpriced("read_capacity / write_capacity are not set or not known until apply");
    return priced(
      [
        { label: `${wcu} write capacity units`, monthly: hourly(FLAT_PRICES.dynamoWcuHourly * wcu, ctx) },
        { label: `${rcu} read capacity units`, monthly: hourly(FLAT_PRICES.dynamoRcuHourly * rcu, ctx) },
      ],
      ["Storage (first 25 GB free), GSIs, backups and streams are not estimated; auto scaling can change capacity."],
    );
  },

  aws_cloudwatch_metric_alarm(v, ctx) {
    const period = num(v.period);
    const high = period !== null && period < 60;
    return priced([{ label: high ? "high-resolution alarm" : "standard alarm", monthly: round2((high ? FLAT_PRICES.highResAlarmMonthly : FLAT_PRICES.alarmMonthly) * ctx.mult) }]);
  },

  aws_cloudwatch_dashboard(_v, ctx) {
    return priced([{ label: "dashboard", monthly: round2(FLAT_PRICES.dashboardMonthly * ctx.mult) }], ["The first three dashboards in an account are free."]);
  },

  aws_autoscaling_group() {
    return unpriced("cost depends on its launch template or launch configuration and on how many instances it runs; price those separately");
  },
};
PRICERS.aws_alb = PRICERS.aws_lb;

/** Classifies and prices one side (before or after) of a resource change. */
export function priceValues(type, values, ctx) {
  const pricer = PRICERS[type];
  if (pricer) return pricer(values ?? {}, ctx);
  if (Object.hasOwn(USAGE_ONLY, type)) return { status: "usage", usage: [USAGE_ONLY[type]] };
  if (NO_CHARGE_PREFIXES.some((p) => type.startsWith(p))) return { status: "free" };
  return unpriced(`no price for ${type} in the bundled table`);
}

export const PRICED_TYPES = Object.keys(PRICERS).sort();
export const USAGE_ONLY_TYPES = Object.keys(USAGE_ONLY).sort();

// --- the estimate --------------------------------------------------------

function classify(actions) {
  const list = Array.isArray(actions) ? actions.map(String) : [];
  const c = list.includes("create");
  const d = list.includes("delete");
  if (c && d) return "replace";
  if (d) return "delete";
  if (c) return "create";
  if (list.includes("update")) return "update";
  return "no-op";
}

const sideCost = (res) => round2((res.components ?? []).reduce((s, c) => s + c.monthly, 0));

/**
 * @param {object} plan  a parsed structured plan
 * @param {{region?: string}} [options]
 */
export function estimatePlan(plan, { region = BASE_REGION } = {}) {
  if (!Object.hasOwn(REGION_MULTIPLIERS, region)) {
    throw new Error(`Unknown region "${region}". Known: ${Object.keys(REGION_MULTIPLIERS).join(", ")}`);
  }
  const ctx = { mult: REGION_MULTIPLIERS[region] };
  const items = [];
  const unpricedItems = [];
  const usageItems = [];
  let noCharge = 0;
  let skipped = 0;

  for (const rc of plan.resource_changes ?? []) {
    if (!rc || rc.mode === "data") continue;
    const action = classify(rc.change?.actions);
    if (action === "no-op") {
      skipped += 1;
      continue;
    }
    const type = String(rc.type ?? "");
    const base = { address: String(rc.address ?? `${type}.${rc.name ?? "?"}`), type, action };
    const change = rc.change ?? {};
    const beforeRes = action === "create" ? null : priceValues(type, change.before, ctx);
    const afterRes =
      action === "delete" ? null : priceValues(type, markUnknown(change.after, change.after_unknown), ctx);
    const sides = [beforeRes, afterRes].filter(Boolean);

    const bad = sides.find((s) => s.status === "unpriced");
    if (bad) {
      unpricedItems.push({ ...base, reason: bad.reason });
      continue;
    }
    if (sides.every((s) => s.status === "free")) {
      noCharge += 1;
      continue;
    }
    if (sides.every((s) => s.status === "usage" || s.status === "free")) {
      usageItems.push({ ...base, usage: [...new Set(sides.flatMap((s) => s.usage ?? []))] });
      continue;
    }
    const before = beforeRes ? sideCost(beforeRes) : 0;
    const after = afterRes ? sideCost(afterRes) : 0;
    const shown = afterRes ?? beforeRes;
    items.push({
      ...base,
      before,
      after,
      delta: round2(after - before),
      components: shown.components ?? [],
      usage: [...new Set(sides.flatMap((s) => s.usage ?? []))],
    });
  }

  const sum = (xs) => round2(xs.reduce((s, x) => s + x, 0));
  const added = sum(items.filter((i) => i.delta > 0).map((i) => i.delta));
  const removed = sum(items.filter((i) => i.delta < 0).map((i) => i.delta));
  const byType = {};
  for (const i of items) {
    byType[i.type] ??= { type: i.type, count: 0, delta: 0 };
    byType[i.type].count += 1;
    byType[i.type].delta = round2(byType[i.type].delta + i.delta);
  }
  const drivers = [...items]
    .filter((i) => i.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.address.localeCompare(b.address))
    .slice(0, 5);

  return {
    region,
    regionMultiplier: ctx.mult,
    detectedRegion: detectRegion(plan),
    priceTableDate: PRICE_TABLE_DATE,
    totals: {
      before: sum(items.map((i) => i.before)),
      after: sum(items.map((i) => i.after)),
      delta: round2(added + removed),
      added,
      removed,
    },
    items: items.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.address.localeCompare(b.address)),
    drivers,
    byType: Object.values(byType).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.type.localeCompare(b.type)),
    usageBased: usageItems,
    unpriced: unpricedItems,
    noChargeCount: noCharge,
    unchangedCount: skipped,
    partial: unpricedItems.length > 0,
  };
}

// --- budget --------------------------------------------------------------

/** Pass/fail against a monthly delta ceiling. Exceeds only when strictly above. */
export function checkBudget(report, maxDelta) {
  const max = Number(maxDelta);
  if (!Number.isFinite(max)) throw new Error(`Budget "${maxDelta}" is not a number.`);
  return { max, delta: report.totals.delta, exceeded: report.totals.delta > max };
}

export function formatUsd(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? "-" : ""}$${abs}`;
}

export function formatDelta(n) {
  return `${n > 0 ? "+" : ""}${formatUsd(n)}`;
}

export function summarize(report) {
  const t = report.totals;
  const head = `Estimated monthly change: ${formatDelta(t.delta)}/month (${formatUsd(t.before)} -> ${formatUsd(t.after)}) in ${report.region}.`;
  if (!report.partial) return head;
  return `${head} ${report.unpriced.length} changed resource(s) are unpriced, so this is not the full change.`;
}
