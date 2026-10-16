"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, write } from "./api-client";
import { Dialog, EmptyState, Notice, StatusBadge } from "./ui";
type Company = {
  id: string;
  name: string;
  website_url: string;
  role?: string;
  archived_at?: string | null;
  latestJob?: { status: string } | null;
  latestVersion?: { version_number: number; created_at: string } | null;
};
export function CompanyDashboard() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  useEffect(() => {
    api<Company[] | { companies: Company[] }>("/api/companies")
      .then((data) => setCompanies(Array.isArray(data) ? data : data.companies))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const data = await api<{ companyId: string }>(
        "/api/companies",
        write("POST", {
          name: form.get("name"),
          website: form.get("website"),
          requestId: crypto.randomUUID(),
        }),
      );
      window.location.assign(`/knowledge?companyId=${data.companyId}`);
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
          onClick={() => setAdding(true)}
        >
          ＋ Add company
        </button>
      </div>
      <div className="summary-grid">
        <div className="summary-card">
          <div>
            <p>Active companies</p>
            <strong>{companies.filter((c) => !c.archived_at).length}</strong>
          </div>
          <span className="summary-card__icon">▦</span>
        </div>
        <div className="summary-card">
          <div>
            <p>Saved versions</p>
            <strong>{companies.filter((c) => c.latestVersion).length}</strong>
          </div>
          <span className="summary-card__icon">▤</span>
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
          <span className="summary-card__icon">↻</span>
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
            onClick={() => setArchived(!archived)}
          >
            {archived ? "Show active" : "View archive"}
          </button>
          <input
            aria-label="Search companies"
            className="filter-input"
            placeholder="Search companies…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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
              onClick={() => setAdding(true)}
            >
              ＋ Add company
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
                  href={`/knowledge${c.archived_at ? "/view" : ""}?companyId=${c.id}`}
                  className="button button--quiet"
                >
                  {c.archived_at ? "View history" : "Open workspace"}{" "}
                  <span aria-hidden>↗</span>
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
      {adding && (
        <Dialog title="Add a company" onClose={() => setAdding(false)}>
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
                onClick={() => setAdding(false)}
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
