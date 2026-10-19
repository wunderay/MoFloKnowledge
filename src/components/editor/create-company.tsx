"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { ArrowUpRight } from "../shared/icons";
import { api, companyPath, errorMessage, write } from "../shared/api-client";
import { Notice } from "../shared/ui";
import type { CaptureLimits } from "./scrape-progress";

const MAX_NAME = 200;

/** Why the name cannot be used, or null. Names are compared trimmed and without case, as people read them. */
export function nameProblem(name: string, existing: { id: string; name: string }[]): { message: string; id?: string } | null {
  const value = name.trim();
  if (!value) {
    return { message: "Enter the company name." };
  }
  if (value.length > MAX_NAME) {
    return { message: `Keep the company name to ${MAX_NAME} characters or fewer.` };
  }
  const same = existing.find((company) => company.name.trim().toLowerCase() === value.toLowerCase());
  return same ? { message: `You already have a company named “${same.name}”.`, id: same.id } : null;
}

/** Why the website cannot be crawled, or null: it must be a public http(s) address (the server checks it again). */
export function websiteProblem(website: string): string | null {
  const value = website.trim();
  if (!value) {
    return "Enter the company website.";
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "Enter the full website address, for example https://company.com.";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "The website must start with http:// or https://.";
  }
  if (url.username || url.password) {
    return "Remove the user name or password from the website address.";
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    return "Use the website's public address, without a port number.";
  }
  return null;
}

/**
 * The first step of the Scrape & Build hub: name a company and give its website. Creating the company starts the crawl of
 * that website (the companies API enqueues it); the page then opens the company with the crawl's progress.
 */
export function CreateCompany({ limits }: { limits?: CaptureLimits }) {
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [problems, setProblems] = useState<{ name?: { message: string; id?: string }; website?: string }>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState<{ id: string; name: string }[]>([]);
  // The same name and website send the same request id, so a retry after a lost answer never creates a second company.
  const requestIds = useRef(new Map<string, string>());
  useEffect(() => {
    api<{ companies: { id: string; name: string }[] }>("/api/companies?fields=min")
      .then((data) => { setExisting(data.companies); })
      .catch(() => undefined);
  }, []);

  async function create(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = { name: nameProblem(name, existing) ?? undefined, website: websiteProblem(website) ?? undefined };
    setProblems(found);
    setError("");
    if (found.name || found.website) {
      return;
    }
    const body = { name: name.trim(), website: website.trim() };
    const key = JSON.stringify(body);
    if (!requestIds.current.has(key)) {
      requestIds.current.set(key, crypto.randomUUID());
    }
    setBusy(true);
    try {
      const data = await api<{ companyId: string; jobId: string | null }>(
        "/api/companies",
        write("POST", { ...body, requestId: requestIds.current.get(key) }),
      );
      // The company exists; when its first crawl could not be enqueued, start it here with the same website.
      const jobId = data.jobId ?? (await startCrawl(data.companyId, body.website, limits));
      window.location.assign(`/knowledge?companyId=${data.companyId}${jobId ? `&jobId=${jobId}` : ""}`);
    } catch (failure) {
      setError(errorMessage(failure, "The company could not be created. Please try again."));
      setBusy(false);
    }
  }

  return (
    <section className="hub-create" aria-labelledby="hub-create-title">
      <p className="eyebrow">Scrape &amp; Build</p>
      <h1 id="hub-create-title">Build a company&apos;s knowledge</h1>
      <p className="muted">
        Name the company and give its website. We crawl its public pages, then you review and edit what was found, section by
        section, and save it as a knowledge version.
      </p>
      <form className="hub-create__form" onSubmit={(event) => void create(event)} noValidate>
        <label className="field">
          <span className="field__label">Company name</span>
          <input
            name="name"
            value={name}
            maxLength={MAX_NAME}
            placeholder="e.g. Lumen Ledger"
            autoComplete="organization"
            aria-invalid={problems.name ? true : undefined}
            aria-describedby={problems.name ? "hub-create-name-problem" : undefined}
            disabled={busy}
            onChange={(event) => {
              setName(event.target.value);
              setProblems((previous) => ({ ...previous, name: undefined }));
            }}
          />
          {problems.name && (
            <span className="field__error" id="hub-create-name-problem" role="alert">
              {problems.name.message}
              {problems.name.id && (
                <>
                  {" "}
                  <Link href={`/knowledge?companyId=${problems.name.id}`}>Open it</Link> or choose another name.
                </>
              )}
            </span>
          )}
        </label>
        <label className="field">
          <span className="field__label">Company website</span>
          <input
            name="website"
            type="url"
            inputMode="url"
            value={website}
            placeholder="https://company.com"
            aria-invalid={problems.website ? true : undefined}
            aria-describedby={problems.website ? "hub-create-website-problem" : "hub-create-website-hint"}
            disabled={busy}
            onChange={(event) => {
              setWebsite(event.target.value);
              setProblems((previous) => ({ ...previous, website: undefined }));
            }}
          />
          {problems.website ? (
            <span className="field__error" id="hub-create-website-problem" role="alert">{problems.website}</span>
          ) : (
            <span className="field__hint" id="hub-create-website-hint">We collect public pages from this company&apos;s website only.</span>
          )}
        </label>
        <button className="button button--primary" disabled={busy}>
          {busy ? "Creating…" : "Create company and start crawl"} <ArrowUpRight />
        </button>
      </form>
      {error && <Notice error>{error}</Notice>}
    </section>
  );
}

/** Starts a crawl of `url`; null when it could not be started (the company page still offers "Start scrape"). */
async function startCrawl(companyId: string, url: string, limits?: CaptureLimits): Promise<string | null> {
  try {
    const result = await api<{ jobId: string }>(
      companyPath(companyId, "/scrapes"),
      write("POST", {
        url,
        options: { documentLimit: limits?.defaultPages ?? 15, depthLimit: limits?.defaultDepth ?? 2 },
        requestId: crypto.randomUUID(),
      }),
    );
    return result.jobId;
  } catch {
    return null;
  }
}
