// Job type -> handler. Each module implements its handlers in services/<module>/jobs.ts.
import type { AppContext } from "../context";
import * as demo from "../services/demo/jobs";
import * as digest from "../services/digest/jobs";
import * as discovery from "../services/discovery/jobs";
import { runDueNextSteps } from "../services/funders-crm/reminders";
import * as imports from "../services/imports/jobs";
import * as ingestion from "../services/ingestion/jobs";
import * as integrations from "../services/integrations/jobs";
import * as knowledge from "../services/knowledge/jobs";
import * as matching from "../services/matching/jobs";
import * as privacy from "../services/privacy/jobs";
import * as prospecting from "../services/prospecting/jobs";
import * as submission from "../services/submission/jobs";
import type { JobOf, JobType } from "./messages";

type Handlers = { [T in JobType]: (ctx: AppContext, job: JobOf<T>) => Promise<void> };

export const jobHandlers: Handlers = {
  "document.process": ingestion.processDocument,
  "facts.extract_document": knowledge.extractDocumentFacts,
  "facts.extract_interview": knowledge.extractInterviewFacts,
  "website.crawl": imports.crawlWebsite,
  "opportunity.import_url": imports.importOpportunityUrl,
  "opportunity.parse_requirements": discovery.parseRequirements,
  "discovery.run": discovery.runDiscovery,
  "matching.score_org": matching.scoreOrg,
  "followups.run_due": async (ctx, job) => {
    await submission.runDueFollowups(ctx, job);
    // Funder next-step reminders ride the same */30 sweep; a failure here must not retry follow-ups.
    try {
      await runDueNextSteps(ctx);
    } catch (err) {
      ctx.logger.error("funders.next_steps_failed", { error: String(err) });
    }
  },
  "privacy.export_org": privacy.exportOrg,
  "privacy.delete_org": privacy.deleteOrg,
  "privacy.retention_sweep": privacy.retentionSweep,
  "prospecting.build": prospecting.buildOrgProspects,
  "digest.weekly": digest.runWeeklyDigest,
  "digest.deadlines": digest.runDeadlineNudges,
  "demo.cleanup_expired": demo.cleanupExpiredSessions,
  "integrations.deliver": integrations.deliverIntegration,
  "integrations.slack_followup": integrations.slackUpdateFollowup,
};
