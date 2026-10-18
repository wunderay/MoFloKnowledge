import type { CapturedExtras } from "@/server/captured-extras";
import type { CapturedHooks } from "@/server/captured-hooks";

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
export function CapturedExtrasSection({ extras, hooks }: { extras: CapturedExtras; hooks?: CapturedHooks }) {
  const empty =
    extras.faqs.length === 0 && extras.contacts.length === 0 &&
    !hooks?.headlines.length && !hooks?.ctas.length && !hooks?.leadMagnets.length && !hooks?.hours.length;
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
      {hooks?.headlines.length ? (
        <>
          <h3>Headlines</h3>
          <ul>
            {hooks.headlines.map((item) => (
              <li key={item.text}>{item.text} <Sources sources={item.sources} /></li>
            ))}
          </ul>
        </>
      ) : null}
      {hooks?.ctas.length ? (
        <>
          <h3>Calls to action</h3>
          <ul>
            {hooks.ctas.map((item) => (
              <li key={`${item.text}|${item.href ?? ""}`}>{item.text} <Sources sources={item.sources} /></li>
            ))}
          </ul>
        </>
      ) : null}
      {hooks?.leadMagnets.length ? (
        <>
          <h3>Lead magnets</h3>
          <ul>
            {hooks.leadMagnets.map((item) => (
              <li key={item.text}>{item.text} <Sources sources={item.sources} /></li>
            ))}
          </ul>
        </>
      ) : null}
      {hooks?.hours.length ? (
        <>
          <h3>Opening hours</h3>
          <ul>
            {hooks.hours.map((item) => (
              <li key={item.value}>{item.value} <Sources sources={item.sources} /></li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
