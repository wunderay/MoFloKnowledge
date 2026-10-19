import type {
  BusinessEntry,
  EntryProvenance,
  EntryKind,
  CitationContext,
} from "./index";
export interface CompanySummary {
  id: string;
  name: string;
  website_url: string;
  draft_generation: number;
  archived_at: string | null;
  role: "owner" | "editor" | "viewer";
  latestJob: {
    id: string;
    status: string;
    progress: Record<string, unknown>;
    created_at: string;
  } | null;
  latestVersion: {
    id: string;
    version_number: number;
    created_at: string;
  } | null;
}
export interface DraftEntry {
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
}
export interface DraftResponse {
  actorId: string;
  company: Omit<CompanySummary, "latestJob" | "latestVersion"> & { latestJob?: { status: string } | null };
  draftGeneration: number;
  entries: DraftEntry[];
  sources: Record<string, unknown>[];
  citationContext: CitationContext;
}
