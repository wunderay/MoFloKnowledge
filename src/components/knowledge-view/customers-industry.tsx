import { textOrNull, type ViewProfile } from "./data";
import { addHref, Banner, Chips, EmptyBox, KnowledgeCard, Stats } from "./parts";

export function CustomersIndustry({ companyId, profile }: { companyId: string; profile: ViewProfile }) {
  const { foundation, market } = profile;
  const foundationHref = addHref(companyId, "company_foundation");
  const marketHref = addHref(companyId, "market_and_customers");
  const industry = textOrNull(foundation.industry);
  const businessModel = textOrNull(foundation.business_model);
  const texts = (items: { id: string; text: string }[]) =>
    items.map((item) => ({ id: item.id, label: item.text.trim() })).filter((item) => item.label);
  const roles = texts(foundation.company_role);
  const outlook = market.industry_outlook.filter((item) => item.text.trim());
  const suppliers = market.suppliers_and_partners
    .map((partner) => ({
      id: partner.id,
      label: textOrNull(partner.name) ?? textOrNull(partner.relationship_text) ?? partner.url ?? "",
      detail: textOrNull(partner.name) ? textOrNull(partner.relationship_type) : null,
    }))
    .filter((item) => item.label);
  return (
    <>
      <Banner label="Industry" title={industry ?? "Your industry"} placeholder={!industry} icon="target">
        <Stats
          counts
          stats={[
            { label: "Groupings", icon: "layers", value: market.industry_groupings.length },
            { label: "Locations", icon: "pin", value: foundation.service_locations.length },
            { label: "Buyers", icon: "users", value: market.target_buyers.length },
            { label: "Suppliers", icon: "truck", value: market.suppliers_and_partners.length },
          ]}
        />
      </Banner>
      <div className="knowledge-view__grid knowledge-view__grid--3">
        <KnowledgeCard title="Business model" subtitle="How you make money.">
          {businessModel ? (
            <p className="knowledge-view__text">{businessModel}</p>
          ) : (
            <EmptyBox title="No business model yet" hint="Capture how revenue actually flows in." href={foundationHref} />
          )}
        </KnowledgeCard>
        <KnowledgeCard title="Company role" subtitle="How you sit in the value chain.">
          {roles.length > 0 ? (
            <Chips items={roles} href={foundationHref} noun="company role" />
          ) : (
            <EmptyBox title="No company role yet" hint="Where do you fit between supplier and buyer?" href={foundationHref} />
          )}
        </KnowledgeCard>
        <KnowledgeCard title="Industry outlook" subtitle="Where the market is heading.">
          {outlook.length > 0 ? (
            <ul className="knowledge-view__list">
              {outlook.map((item) => (
                <li key={item.id}>
                  <span>{item.text}</span>
                  {(item.publisher || item.published_on) && (
                    <small>{[item.publisher, item.published_on].filter(Boolean).join(" · ")}</small>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyBox title="No outlook yet" hint="Add the macro context shaping the market." href={marketHref} />
          )}
        </KnowledgeCard>
      </div>
      <div className="knowledge-view__grid knowledge-view__grid--4">
        <KnowledgeCard title="Industry groupings" subtitle="Sub-segments you operate in.">
          <Chips items={texts(market.industry_groupings)} href={marketHref} noun="industry grouping" />
        </KnowledgeCard>
        <KnowledgeCard title="Service locations" subtitle="Where you operate.">
          <Chips items={texts(foundation.service_locations)} href={foundationHref} noun="service location" />
        </KnowledgeCard>
        <KnowledgeCard title="Buyers" subtitle="Who actually purchases.">
          <Chips items={texts(market.target_buyers)} href={marketHref} noun="buyer" />
        </KnowledgeCard>
        <KnowledgeCard title="Suppliers" subtitle="Who you depend on.">
          <Chips items={suppliers} href={marketHref} noun="supplier" />
        </KnowledgeCard>
      </div>
    </>
  );
}
