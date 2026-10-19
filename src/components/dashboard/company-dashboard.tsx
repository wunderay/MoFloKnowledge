"use client";
import { ArrowUpRight, Icon } from "../shared/icons";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, write } from "../shared/api-client";
import { Dialog, EmptyState, Notice, StatusBadge, useHydrated } from "../shared/ui";
import type { CompanySummary } from "@/contracts/api-types";
type Company = CompanySummary;
/** A company card's link: an archived company opens its latest saved version, any other its workspace with its latest scrape job. */
export function companyHref(c: Pick<Company, "id" | "archived_at" | "latestJob" | "latestVersion">): string {
  if (c.archived_at) {
    return `/knowledge/view?companyId=${c.id}${c.latestVersion ? `&versionId=${c.latestVersion.id}` : ""}`;
  }
  return `/knowledge/view?companyId=${c.id}${c.latestJob ? `&jobId=${c.latestJob.id}` : ""}`;
}
export function CompanyDashboard({
  initialData,
}: {
  initialData?: { companies: Company[]; nextCursor: string | null };
}) {
  const hydrated = useHydrated();
  const [companies, setCompanies] = useState<Company[]>(
    initialData?.companies ?? [],
  );
  const [loading, setLoading] = useState(!initialData);
  const firstLoad = useRef(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(
    initialData?.nextCursor ?? null,
  );
  const requestIds = useRef(new Map<string, string>());
  useEffect(() => {
    if (firstLoad.current && initialData) {
      firstLoad.current = false;
      return;
    }
    firstLoad.current = false;
    const abort = new AbortController();
    setLoading(true);
    setError("");
    api<{ companies: Company[]; nextCursor: string | null }>(
      `/api/companies${archived ? "?archived=true" : ""}`,
      { signal: abort.signal },
    )
      .then((data) => {
        if (abort.signal.aborted) {
          return;
        }
        setCompanies((previous) => [
          ...previous.filter(
            (company) => Boolean(company.archived_at) !== archived,
          ),
          ...data.companies,
        ]);
        setNextCursor(data.nextCursor);
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted) {
          setError((error as Error).message);
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) {
          setLoading(false);
        }
      });
    return () => { abort.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- initialData only seeds the first render; the list refetches when the archived filter flips
  }, [archived]);
  async function loadMore() {
    if (!nextCursor) {
      return;
    }
    setLoading(true);
    try {
      const data = await api<{
        companies: Company[];
        nextCursor: string | null;
      }>(
        `/api/companies?cursor=${nextCursor}${archived ? "&archived=true" : ""}`,
      );
      setCompanies((previous) => [...previous, ...data.companies]);
      setNextCursor(data.nextCursor);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function create(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const key = JSON.stringify([form.get("name"), form.get("website")]);
    if (!requestIds.current.has(key)) {
      requestIds.current.set(key, crypto.randomUUID());
    }
    try {
      const data = await api<{ companyId: string; jobId: string | null }>(
        "/api/companies",
        write("POST", {
          name: form.get("name"),
          website: form.get("website"),
          requestId: requestIds.current.get(key),
        }),
      );
      window.location.assign(
        `/knowledge/view?companyId=${data.companyId}${data.jobId ? `&jobId=${data.jobId}` : ""}`,
      );
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  const visible = companies.filter(
    (c) =>
      Boolean(c.archived_at) === archived &&
      `${c.name} ${c.website_url}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="company-dashboard">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Your knowledge workspace</p>
          <h1>Companies</h1>
          <p>
            A clearer picture of every company. Built from sources, shaped by
            your team.
          </p>
        </div>
        <button
          className="button button--primary"
          disabled={!hydrated}
          onClick={() => { setAdding(true); }}
        >
          <Icon name="plus" size={16} /> Add company
        </button>
      </div>
      <div className="summary-grid">
        <div className="summary-card">
          <div>
            <p>Active companies</p>
            <strong>{companies.filter((c) => !c.archived_at).length}</strong>
          </div>
          <span className="summary-card__icon"><Icon name="companies" size={22} /></span>
        </div>
        <div className="summary-card">
          <div>
            <p>Companies with versions</p>
            <strong>{companies.filter((c) => c.latestVersion).length}</strong>
          </div>
          <span className="summary-card__icon"><Icon name="profile" size={22} /></span>
        </div>
        <div className="summary-card">
          <div>
            <p>Scrapes in progress</p>
            <strong>
              {
                companies.filter((c) =>
                  ["queued", "validating", "crawling", "extracting"].includes(
                    c.latestJob?.status ?? "",
                  ),
                ).length
              }
            </strong>
          </div>
          <span className="summary-card__icon"><Icon name="refresh" size={22} /></span>
        </div>
      </div>
      <div className="section-heading">
        <div className="actions">
          <h2>{archived ? "Archived companies" : "Your companies"}</h2>
          <small>{visible.length} total</small>
        </div>
        <div className="actions">
          <button
            className="button button--quiet"
            disabled={!hydrated}
            onClick={() => { setArchived(!archived); }}
          >
            {archived ? "Show active" : "View archive"}
          </button>
          <input
            disabled={!hydrated}
            aria-label="Search companies"
            className="filter-input"
            placeholder="Search companies…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); }}
          />
        </div>
      </div>
      {error && <Notice error>{error}</Notice>}
      {loading ? (
        <Notice>Loading your companies…</Notice>
      ) : visible.length === 0 ? (
        <div className="panel">
          <EmptyState
            title={query ? "No matching companies" : "Start with a company"}
          >
            <p>
              Add a company website to collect, review, and save its knowledge.
            </p>
            <button
              className="button button--primary"
              disabled={!hydrated}
              onClick={() => { setAdding(true); }}
            >
              <Icon name="plus" size={16} /> Add company
            </button>
          </EmptyState>
        </div>
      ) : (
        <div className="company-dashboard__grid">
          {visible.map((c) => (
            <article className="company-card" key={c.id}>
              <div className="company-card__identity">
                <span className="company-card__logo">
                  {c.name.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <h3>{c.name}</h3>
                  <span className="company-card__website">
                    {c.website_url
                      .replace(/^https?:\/\//, "")
                      .replace(/\/$/, "")}
                  </span>
                </div>
              </div>
              <div className="company-card__metrics">
                <div>
                  Latest scrape
                  <strong>
                    {c.latestJob ? (
                      <StatusBadge value={c.latestJob.status} />
                    ) : (
                      "No scrape yet"
                    )}
                  </strong>
                </div>
                <div>
                  Knowledge version
                  <strong>
                    {c.latestVersion
                      ? `Version ${c.latestVersion.version_number}`
                      : "No saved version"}
                  </strong>
                </div>
              </div>
              <div className="company-card__footer">
                <StatusBadge value={c.role ?? "member"} />
                <Link
                  href={companyHref(c)}
                  className="button button--quiet"
                >
                  {c.archived_at ? "View history" : "Open workspace"}{" "}
                  <ArrowUpRight />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
      {nextCursor && (
        <button className="button" disabled={loading} onClick={loadMore}>
          Load more companies
        </button>
      )}
      {adding && (
        <Dialog title="Add a company" onClose={() => { setAdding(false); }}>
          <p className="muted">
            Create a private workspace for a company and its website.
          </p>
          <form onSubmit={create}>
            <label className="field">
              <span className="field__label">Company name</span>
              <input
                name="name"
                required
                maxLength={200}
                placeholder="e.g. Lumen Ledger"
                autoFocus
              />
            </label>
            <label className="field">
              <span className="field__label">Company website</span>
              <input
                name="website"
                type="url"
                required
                placeholder="https://company.com"
              />
              <span className="field__hint">
                We collect public pages from this company's website only.
              </span>
            </label>
            <div className="actions">
              <button className="button button--primary" disabled={busy}>
                {busy ? "Creating…" : "Create company"}
              </button>
              <button
                type="button"
                className="button"
                onClick={() => { setAdding(false); }}
              >
                Cancel
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
