"use client";
import { useEffect, useState } from "react";
import { api, companyPath, write } from "./api-client";
import { Dialog, Notice, StatusBadge } from "./ui";
export function CompanySettings({
  companyId,
  company,
  generation,
  onClose,
  onChanged,
}: {
  companyId: string;
  company: {
    name: string;
    website_url: string;
    archived_at: string | null;
    role: string;
  };
  generation: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [members, setMembers] = useState<{ user_id: string; role: string }[]>(
    [],
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [archive, setArchive] = useState(false);
  function load() {
    if (company.role !== "owner") return;
    api<
      | { user_id: string; role: string }[]
      | { members: { user_id: string; role: string }[] }
    >(companyPath(companyId, "/members"))
      .then((d) => setMembers(Array.isArray(d) ? d : d.members))
      .catch((e) => setError(e.message));
  }
  useEffect(load, [companyId]);
  async function member(userId: string, body: unknown) {
    setError("");
    setBusy(true);
    try {
      await api(
        companyPath(companyId, `/members/${encodeURIComponent(userId)}`),
        write("PUT", body),
      );
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function metadata(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api(
        companyPath(companyId),
        write("PATCH", {
          name: form.get("name"),
          website: form.get("website"),
          expectedGeneration: generation,
        }),
      );
      onChanged();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function archiveCompany() {
    setBusy(true);
    try {
      await api(
        companyPath(companyId, "/archive"),
        write("POST", { expectedGeneration: generation }),
      );
      window.location.assign("/dashboard");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Dialog title="Company settings" onClose={onClose}>
      {error && <Notice error>{error}</Notice>}
      <form onSubmit={metadata}>
        <label className="field">
          <span className="field__label">Company name</span>
          <input
            name="name"
            defaultValue={company.name}
            required
            maxLength={200}
            disabled={!!company.archived_at}
          />
        </label>
        <label className="field">
          <span className="field__label">Company website</span>
          <input
            name="website"
            type="url"
            defaultValue={company.website_url}
            required
            disabled={!!company.archived_at}
          />
        </label>
        <button className="button" disabled={busy || !!company.archived_at}>
          Save company details
        </button>
      </form>
      {company.role === "owner" && (
        <>
          <hr
            style={{
              border: 0,
              borderTop: "1px solid var(--line)",
              margin: "25px 0",
            }}
          />
          <h3>Company members</h3>
          <p className="field__hint">
            Add an existing registered user's UUID. Invitations are not sent.
          </p>
          {members.map((m) => (
            <div className="section-heading" key={m.user_id}>
              <span
                className="field__hint"
                style={{ overflowWrap: "anywhere" }}
              >
                {m.user_id}
              </span>
              <div className="actions">
                <StatusBadge value={m.role} />
                <select
                  className="company-switcher"
                  aria-label={`Role for ${m.user_id}`}
                  value={m.role}
                  disabled={busy || !!company.archived_at}
                  onChange={(e) => member(m.user_id, { role: e.target.value })}
                >
                  {["owner", "editor", "viewer"].map((role) => (
                    <option key={role}>{role}</option>
                  ))}
                </select>
                <button
                  className="button button--quiet button--danger"
                  disabled={busy || !!company.archived_at}
                  onClick={() => member(m.user_id, { remove: true })}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              void member(String(data.get("userId")), {
                role: data.get("role"),
              });
            }}
          >
            <div className="field-grid">
              <label className="field">
                <span className="field__label">User UUID</span>
                <input
                  name="userId"
                  required
                  pattern="[0-9a-fA-F-]{36}"
                  placeholder="00000000-0000-0000-0000-000000000000"
                />
              </label>
              <label className="field">
                <span className="field__label">Role</span>
                <select name="role" defaultValue="viewer">
                  <option>viewer</option>
                  <option>editor</option>
                  <option>owner</option>
                </select>
              </label>
            </div>
            <button className="button" disabled={busy || !!company.archived_at}>
              Add member
            </button>
          </form>
          <hr
            style={{
              border: 0,
              borderTop: "1px solid var(--line)",
              margin: "25px 0",
            }}
          />
          <h3>Archive company</h3>
          <p className="field__hint">
            Archive stops active work and prevents new changes. Members retain
            access to saved versions and exports.
          </p>
          {archive ? (
            <Notice error>
              Archive {company.name}?
              <div className="actions">
                <button
                  className="button button--danger"
                  disabled={busy}
                  onClick={archiveCompany}
                >
                  Confirm archive
                </button>
                <button className="button" onClick={() => setArchive(false)}>
                  Keep company active
                </button>
              </div>
            </Notice>
          ) : (
            <button
              className="button button--danger"
              disabled={!!company.archived_at}
              onClick={() => setArchive(true)}
            >
              Archive company
            </button>
          )}
        </>
      )}
    </Dialog>
  );
}
