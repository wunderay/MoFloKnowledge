import type { CapturedExtras } from "@/server/captured-extras";

function Sources({ sources }: { sources: string[] }) {
  return (
    <>
      {sources.map((source, index) => (
        <a key={source} href={source} rel="noreferrer noopener" target="_blank">
          {sources.length > 1 ? `Source ${index + 1}` : "Source"}
        </a>
      ))}
    </>
  );
}

/** Read-only evidence captured from the company's website; nothing here is confirmed knowledge. */
export function CapturedExtrasSection({ extras }: { extras: CapturedExtras }) {
  const empty = extras.faqs.length === 0 && extras.contacts.length === 0;
  return (
    <section className="knowledge-view__panel" aria-labelledby="captured-extras-title" style={{ marginTop: 16 }}>
      <h2 id="captured-extras-title" className="knowledge-view__section-title">Captured from the website</h2>
      <p className="muted">Captured from the website — not reviewed.</p>
      {empty ? <p>Nothing captured yet.</p> : null}
      {extras.faqs.length > 0 ? (
        <>
          <h3>Questions and answers</h3>
          <ul>
            {extras.faqs.map((faq) => (
              <li key={faq.question}>
                <strong>{faq.question}</strong> {faq.answer} <Sources sources={faq.sources} />
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {extras.contacts.length > 0 ? (
        <>
          <h3>Contact details</h3>
          <ul>
            {extras.contacts.map((contact) => (
              <li key={`${contact.kind}:${contact.value}`}>
                {contact.value} <Sources sources={contact.sources} />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
