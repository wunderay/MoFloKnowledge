import type { BusinessEntry, EntryProvenance, EntryKind } from "./index";
export type CompanySummary = {
  id: string;
  name: string;
  website_url: string;
  draft_generation: number;
  archived_at: string | null;
  role: "owner" | "editor" | "viewer";
  latestJob: Record<string, unknown> | null;
  latestVersion: Record<string, unknown> | null;
};
export type DraftEntry = {
  id: string;
  company_id: string;
  kind: EntryKind;
  current_revision: number;
  created_at: string;
  content: BusinessEntry;
  provenance: EntryProvenance;
  review_status: "unreviewed" | "approved" | "rejected";
  author_id: string;
  change_reason: string | null;
};
export type DraftResponse = {
  actorId: string;
  company: CompanySummary;
  draftGeneration: number;
  entries: DraftEntry[];
  sources: Record<string, unknown>[];
};
