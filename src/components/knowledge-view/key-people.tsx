import { addHref, EmptyBox } from "./parts";

/**
 * Key People: the people who represent the company. The list itself is built in a later
 * Quest; until then the section says there is nobody yet and links to the editor's People category.
 * `titled` is false when the caller (All sections) already shows the section heading.
 */
export function KeyPeople({ companyId, titled = true }: { companyId: string; titled?: boolean }) {
  return (
    <section className="knowledge-view__card knowledge-view__people">
      {titled && (
        <div className="knowledge-view__card-head">
          <h2 className="knowledge-view__card-title">Key People</h2>
        </div>
      )}
      <p className="knowledge-view__card-subtitle">The people who represent your company, such as founders, leaders and spokespeople.</p>
      <EmptyBox title="No key people yet" hint="Add the people your content should name or quote." href={addHref(companyId, "key_person")} />
    </section>
  );
}
