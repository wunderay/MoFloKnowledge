"use client";
import { useEffect, useState } from "react";
import { api, companyPath, write } from "./api-client";
import { CitationPopover } from "./citation-popover";
import { Notice } from "./ui";
import {
  entryRoot,
  type EntryKind,
  type EntryProvenance,
  type Proposal,
  entryBusiness,
  resolveStablePointer,
} from "@/contracts";
import { ValueView } from "./entry-value";
import { labelOf, summarizeValue } from "./business-fields";
type ProposalItem = Proposal & { changes?: { id: string; target: string }[] };
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
        initialized_entry_ids?: string[];
      };
    }>(companyPath(companyId, `/scrapes/${job}`))
      .then((data) => {
        if (data.proposals.initialized_entry_ids?.length) {
          setProposals([]);
          return;
        }
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
                  <ValueView
                    value={current.content}
                    path={entryRoot(proposal.kind as EntryKind, current.id)}
                    provenance={current.provenance}
                    approved={false}
                  />
                ) : (
                  <p className="field__hint">New entry</p>
                )}
              </div>
              <div>
                <p className="eyebrow">Proposed</p>
                <ValueView
                  value={proposal.content}
                  path={entryRoot(
                    proposal.kind as EntryKind,
                    "id" in proposal.content
                      ? proposal.content.id
                      : (proposal.target_entry_id ?? ""),
                  )}
                  provenance={proposal.provenance}
                  approved={false}
                />
              </div>
            </div>
            {(proposal.changes?.length ?? 0) > 0 && (
              <fieldset className="knowledge-editor__group">
                <legend>Choose proposed fields</legend>
                <p className="field__hint">
                  Only selected fields change. Other values and their evidence
                  remain as saved.
                </p>
                {proposal.changes
                  ?.filter(
                    (change) =>
                      !proposal.conflicts.some(
                        (conflict) => conflict.target === change.target,
                      ),
                  )
                  .map((change) => (
                    <div className="field" key={change.id}>
                      <div className="field__label">
                        <label>
                          <input
                            type="checkbox"
                            disabled={!canEdit || busy}
                            checked={(selected[proposal.id] ?? []).includes(
                              change.id,
                            )}
                            onChange={(event) =>
                              setSelected((previous) => ({
                                ...previous,
                                [proposal.id]: event.target.checked
                                  ? [
                                      ...(previous[proposal.id] ?? []),
                                      change.id,
                                    ]
                                  : (previous[proposal.id] ?? []).filter(
                                      (id) => id !== change.id,
                                    ),
                              }))
                            }
                          />{" "}
                          Use proposed{" "}
                          {labelOf(change.target.split("/").at(-1) ?? "field")}
                        </label>
                        <CitationPopover
                          path={change.target}
                          provenance={proposal.provenance}
                        />
                      </div>
                      <span className="field__hint">
                        {summarizeValue(
                          resolveStablePointer(
                            entryBusiness(proposal.kind, proposal.content),
                            change.target,
                          ),
                        )}
                      </span>
                    </div>
                  ))}
              </fieldset>
            )}
            {proposal.conflicts?.map((conflict) => (
              <fieldset className="knowledge-editor__group" key={conflict.id}>
                <legend>
                  {labelOf(conflict.target.split("/").at(-1) ?? "Field")}
                </legend>
                <label className="field">
                  <span>
                    <input
                      type="radio"
                      name={`candidate-${conflict.id}`}
                      disabled={!canEdit || busy}
                      checked={
                        !conflict.candidates.some((candidate) =>
                          (selected[proposal.id] ?? []).includes(candidate.id),
                        )
                      }
                      onChange={() =>
                        setSelected((previous) => ({
                          ...previous,
                          [proposal.id]: (previous[proposal.id] ?? []).filter(
                            (id) =>
                              !conflict.candidates.some(
                                (candidate) => candidate.id === id,
                              ),
                          ),
                        }))
                      }
                    />{" "}
                    Keep this field unchanged
                  </span>
                </label>
                {conflict.candidates.map((candidate) => (
                  <div key={candidate.id}>
                    <label className="field">
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
                                    !conflict.candidates.some(
                                      (c) => c.id === id,
                                    ),
                                ),
                                candidate.id,
                              ],
                            })
                          }
                        />{" "}
                        {summarizeValue(candidate.value)}
                      </span>
                    </label>
                    <CitationPopover
                      path={conflict.target}
                      provenance={proposal.provenance}
                      candidate={candidate}
                    />
                  </div>
                ))}
              </fieldset>
            ))}
            <div className="actions">
              <button
                className="button button--primary"
                disabled={!canEdit || busy || !selected[proposal.id]?.length}
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
