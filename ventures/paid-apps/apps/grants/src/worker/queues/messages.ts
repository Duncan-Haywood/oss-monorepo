// Background job contract. Producers: ctx.env.JOBS.send(msg). Consumer: queues/consumer.ts.
// Keep messages small (ids only) — never put document contents or PII in a message.
export type JobMessage =
  | { type: "document.process"; orgId: string; documentId: string } // ingestion: convert, chunk, embed
  | { type: "facts.extract_document"; orgId: string; documentId: string } // knowledge
  | { type: "facts.extract_interview"; orgId: string; interviewId: string } // knowledge
  | { type: "website.crawl"; orgId: string; url: string; maxPages: number } // import
  | { type: "opportunity.import_url"; orgId: string; opportunityId: string; url: string } // import
  | { type: "opportunity.parse_requirements"; opportunityId: string; orgId: string | null } // discovery
  | { type: "discovery.run"; source: "grants_gov" | "simpler_grants"; trigger: "cron" | "manual" } // discovery
  | { type: "matching.score_org"; orgId: string; opportunityIds?: string[] } // matching
  | { type: "followups.run_due" } // submission
  | { type: "privacy.export_org"; orgId: string; exportId: string } // privacy
  | { type: "privacy.delete_org"; orgId: string; requestedBy: string } // privacy
  | { type: "privacy.retention_sweep" } // privacy
  | { type: "prospecting.build"; orgId: string; runId: string } // prospecting
  | { type: "digest.weekly" } // digest: Monday weekly digest for every org
  | { type: "digest.deadlines" } // digest: daily deadline nudges (14/7/3/1 days out)
  | { type: "demo.cleanup_expired" } // demo: hourly (demo deployment only), deletes expired demo sessions
  | { type: "integrations.deliver"; orgId: string; deliveryId: string } // integrations: one chat delivery
  | { type: "integrations.slack_followup"; orgId: string; receiptId: string }; // integrations: fact count to Slack

export type JobType = JobMessage["type"];
export type JobOf<T extends JobType> = Extract<JobMessage, { type: T }>;
