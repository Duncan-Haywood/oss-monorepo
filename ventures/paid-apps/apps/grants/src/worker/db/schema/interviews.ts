// AI (or human) interviews that capture knowledge not found in documents.
import type {
  InputMode,
  InterviewKind,
  InterviewMode,
  InterviewStatus,
  TurnRole,
} from "@shared/enums";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, json, ts, updatedAt } from "./_columns";
import { organization, user } from "./auth";
import { documents, projects } from "./knowledge";

/** One planned question area of an interview (agenda keys stay in `agenda` for compatibility). */
export interface InterviewAgendaItem {
  key: string;
  label: string;
  /** Suggested wording (canned or from an application flag's suggestedQuestion). */
  question: string;
  /** Gap-fill: the application flag this item came from. */
  flagId?: string;
}

export const interviews = sqliteTable(
  "interviews",
  {
    id: text("id").primaryKey(), // int_...
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: text("kind").$type<InterviewKind>().notNull(),
    mode: text("mode").$type<InterviewMode>().notNull().default("ai_chat"),
    status: text("status").$type<InterviewStatus>().notNull().default("active"),
    title: text("title").notNull(),
    focusProjectId: text("focus_project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    /** Gap-fill interviews are opened for a specific application's missing info. */
    focusApplicationId: text("focus_application_id"),
    /** Checklist keys still to cover, e.g. ["mission","programs","outcomes"]. */
    agenda: json<string[]>("agenda").notNull().default([]),
    coveredTopics: json<string[]>("covered_topics").notNull().default([]),
    /** Agenda with labels + suggested questions (gap-fill questions live here). */
    agendaItems: json<InterviewAgendaItem[]>("agenda_items").notNull().default([]),
    /** For transcript uploads: the document holding the raw transcript. */
    transcriptDocumentId: text("transcript_document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    summary: text("summary"),
    factCount: integer("fact_count").notNull().default(0),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    completedAt: ts("completed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("interviews_org_idx").on(t.orgId, t.createdAt),
    // FK SET NULL from documents / projects; knowledge/jobs.ts transcript lookup
    index("interviews_transcript_doc_idx").on(t.transcriptDocumentId),
    index("interviews_focus_project_idx").on(t.focusProjectId),
  ],
);

export const interviewTurns = sqliteTable(
  "interview_turns",
  {
    id: text("id").primaryKey(), // trn_...
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    interviewId: text("interview_id")
      .notNull()
      .references(() => interviews.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    role: text("role").$type<TurnRole>().notNull(),
    content: text("content").notNull(),
    inputMode: text("input_mode").$type<InputMode>().notNull().default("text"),
    /** Only kept when org_settings.store_voice_recordings is on. */
    audioR2Key: text("audio_r2_key"),
    topicKey: text("topic_key"),
    /** Speaker label from an uploaded transcript ("Maria", "Q"); null for AI interviews. */
    speakerName: text("speaker_name"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("turns_interview_idx").on(t.interviewId, t.ordinal),
    // Retention sweep (org_id, created_at < cutoff); privacy export/delete
    index("turns_org_created_idx").on(t.orgId, t.createdAt),
  ],
);
