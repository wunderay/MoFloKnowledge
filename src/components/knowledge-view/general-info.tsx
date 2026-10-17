import { Icon } from "../icons";
import { addressText, employeeText, textOrNull, type ViewProfile } from "./data";
import { addHref, Banner, Chips, EmptyBox, KnowledgeCard, StatAdd, Stats } from "./parts";

export function GeneralInfo({ companyId, name, profile }: { companyId: string; name: string; profile: ViewProfile }) {
  const { foundation, positioning } = profile;
  const foundationHref = addHref(companyId, "company_foundation");
  const main = foundation.main_address ? addressText(foundation.main_address) : null;
  const others = foundation.other_locations
    .map((address) => ({ id: address.id, label: textOrNull(address.label), text: addressText(address) }))
    .filter((address) => address.text);
  const overview = textOrNull(foundation.overview);
  const story = textOrNull(positioning.founding_story);
  const employees = employeeText(foundation.employee_count);
  const legal = textOrNull(foundation.legal_entity_type);
  const alternates = foundation.alternative_company_names
    .map((item) => ({ id: item.id, label: item.text.trim() }))
    .filter((item) => item.label);
  return (
    <>
      <Banner label="Company" title={name}>
        <Stats
          stats={[
            {
              label: "Founded",
              icon: "calendar",
              value: foundation.year_founded ?? <StatAdd href={foundationHref}>+ year</StatAdd>,
            },
            { label: "Employees", icon: "users", value: employees ?? <StatAdd href={foundationHref}>+ count</StatAdd> },
            { label: "Legal entity", icon: "building", value: legal ?? <StatAdd href={foundationHref}>+ LLC, Inc…</StatAdd> },
          ]}
        />
      </Banner>
      <div className="knowledge-view__grid knowledge-view__grid--2">
        <KnowledgeCard title="Headquarters" subtitle="Main address and other locations.">
          {main || others.length > 0 ? (
            <>
              {main && (
                <div className="knowledge-view__location">
                  <span className="knowledge-view__location-icon" aria-hidden="true"><Icon name="pin" size={16} /></span>
                  <div>
                    <p className="knowledge-view__mini-label">Main</p>
                    <p>{main}</p>
                  </div>
                </div>
              )}
              {others.length > 0 && (
                <>
                  <p className="knowledge-view__mini-label">Other locations</p>
                  <ul className="knowledge-view__list">
                    {others.map((address) => (
                      <li key={address.id}>
                        {address.label && <strong>{address.label}</strong>}
                        <span>{address.text}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : (
            <EmptyBox title="No headquarters yet" hint="Add the main address and any other locations." href={foundationHref} />
          )}
        </KnowledgeCard>
        <KnowledgeCard title="Alternate names" subtitle="Other ways the company is known.">
          <Chips items={alternates} href={foundationHref} noun="alternate name" />
        </KnowledgeCard>
        <KnowledgeCard title="Overview" subtitle="The elevator pitch.">
          {overview ? (
            <p className="knowledge-view__text">{overview}</p>
          ) : (
            <EmptyBox title="No overview yet" hint="Summarize what the company does in a few sentences." href={foundationHref} />
          )}
        </KnowledgeCard>
        <KnowledgeCard title="Founding story" subtitle="How it all started.">
          {story ? (
            <p className="knowledge-view__text">{story}</p>
          ) : (
            <EmptyBox title="No founding story yet" hint="Capture how and why the company began." href={addHref(companyId, "positioning")} />
          )}
        </KnowledgeCard>
      </div>
    </>
  );
}
