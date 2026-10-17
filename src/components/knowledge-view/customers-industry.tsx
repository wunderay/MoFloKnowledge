import { textOrNull, type ViewProfile } from "./data";
import type { Evidence } from "./data";
import { FIELDS, InlineArea, InlineChips, LISTS, useEdit, useTextField } from "./inline-edit";
import { addHref, Banner, Chips, Count, CoverageNote, EmptyBox, ItemSource, KnowledgeCard, Source, Stats } from "./parts";

export function CustomersIndustry({ companyId, profile }: { companyId: string; profile: ViewProfile }) {
  const { foundation, market } = profile;
  // An editable draft edits these values in place; a saved version and a viewer see text and "+ Add" links.
  const edit = useEdit() !== null;
  const industryField = useTextField(FIELDS.industry);
  const fev = profile.evidence.foundation;
  const mev = profile.evidence.market;
  const foundationHref = addHref(companyId, "company_foundation");
  const marketHref = addHref(companyId, "market_and_customers");
  const industry = textOrNull(foundation.industry);
  const businessModel = textOrNull(foundation.business_model);
  const p = {
    industry: "/company_foundation/industry",
    model: "/company_foundation/business_model",
    role: "/company_foundation/company_role",
    outlook: "/market_and_customers/industry_outlook",
    groupings: "/market_and_customers/industry_groupings",
    locations: "/company_foundation/service_locations",
    buyers: "/market_and_customers/target_buyers",
    suppliers: "/market_and_customers/suppliers_and_partners",
  };
  const texts = (items: { id: string; text: string }[], evidence: Evidence, field: string) =>
    items
      .map((item) => ({
        id: item.id,
        label: item.text.trim(),
        mark: <ItemSource evidence={evidence} path={`${field}/@${item.id}`} name={item.text.trim()} />,
      }))
      .filter((item) => item.label);
  const roles = texts(foundation.company_role, fev, p.role);
  const groupings = texts(market.industry_groupings, mev, p.groupings);
  const locations = texts(foundation.service_locations, fev, p.locations);
  const buyers = texts(market.target_buyers, mev, p.buyers);
  const outlook = market.industry_outlook.filter((item) => item.text.trim());
  const suppliers = market.suppliers_and_partners
    .map((partner) => {
      const name = textOrNull(partner.name);
      const label = name ?? textOrNull(partner.relationship_text) ?? textOrNull(partner.relationship_type) ?? partner.url ?? "";
      return {
        id: partner.id,
        label,
        detail: name ? textOrNull(partner.relationship_type) : null,
        mark: <ItemSource evidence={mev} path={`${p.suppliers}/@${partner.id}`} name={label} />,
      };
    })
    .filter((item) => item.label);
  return (
    <>
      <Banner
        label="Industry"
        title={
          industryField
            ? industryField.control({ shown: industry, placeholder: "Your industry", heading: true })
            : (industry ?? "Your industry")
        }
        titleFeedback={industryField?.feedback}
        placeholder={!industry}
        icon="target"
        source={<Source evidence={fev} path={p.industry} filled={industry !== null} />}
      >
        <Stats
          counts
          stats={[
            { label: "Groupings", icon: "layers", value: <Count n={market.industry_groupings.length} one="Grouping" many="Groupings" /> },
            { label: "Locations", icon: "pin", value: <Count n={foundation.service_locations.length} one="Location" many="Locations" /> },
            { label: "Buyers", icon: "users", value: <Count n={market.target_buyers.length} one="Buyer" many="Buyers" /> },
            { label: "Suppliers", icon: "truck", value: <Count n={market.suppliers_and_partners.length} one="Supplier" many="Suppliers" /> },
          ]}
        />
      </Banner>
      <CoverageNote evidence={fev} path={p.industry} empty={industry === null} />
      <div className="knowledge-view__grid knowledge-view__grid--3">
        <KnowledgeCard
          title="Business model"
          subtitle="How you make money."
          source={<Source evidence={fev} path={p.model} filled={businessModel !== null} />}
        >
          {edit ? (
            <InlineArea
              spec={FIELDS.model}
              value={businessModel}
              empty={{ title: "No business model yet", hint: "Capture how revenue actually flows in." }}
              note={<CoverageNote evidence={fev} path={p.model} empty={businessModel === null} />}
            />
          ) : businessModel ? (
            <>
              <p className="knowledge-view__text">{businessModel}</p>
              <CoverageNote evidence={fev} path={p.model} empty={false} />
            </>
          ) : (
            <EmptyBox
              title="No business model yet"
              hint="Capture how revenue actually flows in."
              href={foundationHref}
              note={<CoverageNote evidence={fev} path={p.model} empty />}
            />
          )}
        </KnowledgeCard>
        <KnowledgeCard
          title="Company role"
          subtitle="How you sit in the value chain."
          source={<Source evidence={fev} path={p.role} filled={roles.length > 0} />}
        >
          {edit ? (
            <>
              <InlineChips list={LISTS.roles} items={roles} />
              <CoverageNote evidence={fev} path={p.role} empty={roles.length === 0} />
            </>
          ) : roles.length > 0 ? (
            <>
              <Chips items={roles} href={foundationHref} noun="company role" />
              <CoverageNote evidence={fev} path={p.role} empty={false} />
            </>
          ) : (
            <EmptyBox
              title="No company role yet"
              hint="Where do you fit between supplier and buyer?"
              href={foundationHref}
              note={<CoverageNote evidence={fev} path={p.role} empty />}
            />
          )}
        </KnowledgeCard>
        <KnowledgeCard
          title="Industry outlook"
          subtitle="Where the market is heading."
          source={<Source evidence={mev} path={p.outlook} filled={outlook.length > 0} />}
        >
          {outlook.length > 0 ? (
            <>
              <ul className="knowledge-view__list">
                {outlook.map((item) => (
                  <li key={item.id}>
                    <span>{item.text}</span>
                    {(item.publisher || item.published_on) && (
                      <small>{[item.publisher, item.published_on].filter(Boolean).join(" · ")}</small>
                    )}
                    <ItemSource evidence={mev} path={`${p.outlook}/@${item.id}`} name={item.text.trim()} />
                  </li>
                ))}
              </ul>
              <CoverageNote evidence={mev} path={p.outlook} empty={false} />
            </>
          ) : (
            <EmptyBox
              title="No outlook yet"
              hint="Add the macro context shaping the market."
              href={marketHref}
              note={<CoverageNote evidence={mev} path={p.outlook} empty />}
            />
          )}
        </KnowledgeCard>
      </div>
      <div className="knowledge-view__grid knowledge-view__grid--4">
        <KnowledgeCard
          title="Industry groupings"
          subtitle="Sub-segments you operate in."
          source={<Source evidence={mev} path={p.groupings} filled={groupings.length > 0} />}
        >
          {edit ? <InlineChips list={LISTS.groupings} items={groupings} /> : <Chips items={groupings} href={marketHref} noun="industry grouping" />}
          <CoverageNote evidence={mev} path={p.groupings} empty={groupings.length === 0} />
        </KnowledgeCard>
        <KnowledgeCard
          title="Service locations"
          subtitle="Where you operate."
          source={<Source evidence={fev} path={p.locations} filled={locations.length > 0} />}
        >
          {edit ? <InlineChips list={LISTS.locations} items={locations} /> : <Chips items={locations} href={foundationHref} noun="service location" />}
          <CoverageNote evidence={fev} path={p.locations} empty={locations.length === 0} />
        </KnowledgeCard>
        <KnowledgeCard
          title="Buyers"
          subtitle="Who actually purchases."
          source={<Source evidence={mev} path={p.buyers} filled={buyers.length > 0} />}
        >
          {edit ? <InlineChips list={LISTS.buyers} items={buyers} /> : <Chips items={buyers} href={marketHref} noun="buyer" />}
          <CoverageNote evidence={mev} path={p.buyers} empty={buyers.length === 0} />
        </KnowledgeCard>
        <KnowledgeCard
          title="Suppliers"
          subtitle="Who you depend on."
          source={<Source evidence={mev} path={p.suppliers} filled={suppliers.length > 0} />}
        >
          <Chips items={suppliers} href={marketHref} noun="supplier" />
          <CoverageNote evidence={mev} path={p.suppliers} empty={suppliers.length === 0} />
        </KnowledgeCard>
      </div>
    </>
  );
}
