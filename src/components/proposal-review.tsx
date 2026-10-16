"use client";
import { useEffect, useState } from "react";
import { api, companyPath, write } from "./api-client";
import { CitationPopover } from "./citation-popover";
import { Notice } from "./ui";
import type { EntryProvenance } from "@/contracts";
type Candidate = { id: string; value: unknown; evidence_ids?: string[] };
type ProposalItem = {
  id: string;
  kind: string;
  target_entry_id: string | null;
  base_revision: number | null;
  content: Record<string, unknown>;
  provenance: EntryProvenance;
  conflicts: { id: string; target: string; candidates: Candidate[] }[];
};
export function ProposalReview({
  companyId,
  entries,
  canEdit,
  onApplied,
}: {
  companyId: string;
  entries: {
    id: string;
    current_revision: number;
    content: unknown;
    provenance: EntryProvenance;
  }[];
  canEdit: boolean;
  onApplied: () => void;
}) {
  const [proposals, setProposals] = useState<ProposalItem[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const job = new URLSearchParams(window.location.search).get("jobId");
    setJobId(job);
    if (!job) return;
    api<{
      proposals: {
        candidates?: ProposalItem[];
        decisions?: { proposal_id: string; action: string }[];
      };
    }>(companyPath(companyId, `/scrapes/${job}`))
      .then((data) => {
        const decided = new Set(
          (data.proposals.decisions ?? []).map(
            (decision) => decision.proposal_id,
          ),
        );
        setProposals(
          (data.proposals.candidates ?? []).filter(
            (proposal) => !decided.has(proposal.id),
          ),
        );
      })
      .catch((error) => setError(error.message));
  }, [companyId, entries]);
  async function act(proposal: ProposalItem, dismiss = false) {
    setBusy(true);
    setError("");
    try {
      const entry = entries.find((e) => e.id === proposal.target_entry_id);
      await api(
        companyPath(
          companyId,
          `/proposals/${proposal.id}/${dismiss ? "dismiss" : "apply"}`,
        ),
        write(
          "POST",
          dismiss
            ? { jobId, reason: "Reviewer dismissed this proposal." }
            : {
                jobId,
                entryId: entry?.id,
                expectedRevision: entry?.current_revision,
                selectedCandidateIds: selected[proposal.id] ?? [],
                requestId: crypto.randomUUID(),
              },
        ),
      );
      setProposals(proposals.filter((p) => p.id !== proposal.id));
      onApplied();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!proposals.length && !error) return null;
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Re-scrape proposals</h2>
        <small>{proposals.length} pending</small>
      </div>
      <p className="field__hint">
        A fresh scrape never overwrites your draft. Compare the evidence and
        apply selected changes explicitly.
      </p>
      {error && <Notice error>{error}</Notice>}
      {proposals.map((proposal) => {
        const current = entries.find((e) => e.id === proposal.target_entry_id);
        return (
          <article className="knowledge-editor__group" key={proposal.id}>
            <h3>{proposal.kind.replaceAll("_", " ")}</h3>
            <div className="proposal__comparison">
              <div>
                <p className="eyebrow">Current draft</p>
                {current ? (
                  Object.entries(current.content as Record<string, unknown>)
                    .filter(([key]) => key !== "id")
                    .map(([key, value]) => (
                      <div className="entry-value" key={key}>
                        <span className="entry-value__label">
                          {key.replaceAll("_", " ")}
                          <CitationPopover
                            path={`/${proposal.kind}/${key}`}
                            provenance={current.provenance}
                          />
                        </span>
                        <span>
                          {typeof value === "string"
                            ? value
                            : value === null
                              ? "Unknown"
                              : JSON.stringify(value)}
                        </span>
                      </div>
                    ))
                ) : (
                  <p className="field__hint">New entry</p>
                )}
              </div>
              <div>
                <p className="eyebrow">Proposed</p>
                {Object.entries(proposal.content ?? {})
                  .filter(([key]) => key !== "id")
                  .map(([key, value]) => (
                    <div className="entry-value" key={key}>
                      <span className="entry-value__label">
                        {key.replaceAll("_", " ")}
                        <CitationPopover
                          path={`/${proposal.kind}/${key}`}
                          provenance={proposal.provenance}
                        />
                      </span>
                      <span>
                        {typeof value === "string"
                          ? value
                          : value === null
                            ? "Unknown"
                            : JSON.stringify(value)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
            {proposal.conflicts?.map((conflict) => (
              <fieldset className="knowledge-editor__group" key={conflict.id}>
                <legend>{conflict.target}</legend>
                {conflict.candidates.map((candidate) => (
                  <label className="field" key={candidate.id}>
                    <span>
                      <input
                        type="radio"
                        name={`candidate-${conflict.id}`}
                        disabled={!canEdit || busy}
                        checked={(selected[proposal.id] ?? []).includes(
                          candidate.id,
                        )}
                        onChange={() =>
                          setSelected({
                            ...selected,
                            [proposal.id]: [
                              ...(selected[proposal.id] ?? []).filter(
                                (id) =>
                                  !conflict.candidates.some((c) => c.id === id),
                              ),
                              candidate.id,
                            ],
                          })
                        }
                      />{" "}
                      {typeof candidate.value === "string"
                        ? candidate.value
                        : JSON.stringify(candidate.value)}
                    </span>
                  </label>
                ))}
              </fieldset>
            ))}
            <div className="actions">
              <button
                className="button button--primary"
                disabled={!canEdit || busy}
                onClick={() => act(proposal)}
              >
                Apply selected changes to draft
              </button>
              <button
                className="button"
                disabled={!canEdit || busy}
                onClick={() => act(proposal, true)}
              >
                Dismiss proposal
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
