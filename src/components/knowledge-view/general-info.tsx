import type { ReactNode } from "react";
import { Icon } from "../shared/icons";
import { addressText, employeeText, textOrNull, type ViewProfile } from "./data";
import { FIELDS, InlineArea, InlineChips, InlineLine, LISTS, useEdit } from "./inline-edit";
import { addHref, Banner, Chips, CoverageNote, EmptyBox, ItemSource, KnowledgeCard, Source, StatAdd, Stats } from "./parts";

export function GeneralInfo({ companyId, name, profile }: { companyId: string; name: string; profile: ViewProfile }) {
  const { foundation, positioning } = profile;
  // An editable draft edits these values in place; a saved version and a viewer see text and "+ Add" links.
  const edit = useEdit() !== null;
  const ev = profile.evidence.foundation;
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
    .map((item) => ({
      id: item.id,
      label: item.text.trim(),
      mark: <ItemSource evidence={ev} path={`/company_foundation/alternative_company_names/@${item.id}`} name={item.text.trim()} />,
    }))
    .filter((item) => item.label);
  const mainPath = "/company_foundation/main_address";
  const othersPath = "/company_foundation/other_locations";
  const namesPath = "/company_foundation/alternative_company_names";
  const overviewPath = "/company_foundation/overview";
  const storyPath = "/positioning/founding_story";
  const withSource = (value: ReactNode, path: string, filled: boolean) => (
    <>
      {value}
      <Source evidence={ev} path={path} filled={filled} />
      <CoverageNote evidence={ev} path={path} empty={!filled} />
    </>
  );
  return (
    <>
      <Banner label="Company" title={name}>
        <Stats
          stats={[
            {
              label: "Founded",
              icon: "calendar",
              value: withSource(
                edit ? (
                  <InlineLine spec={FIELDS.founded} shown={foundation.year_founded} placeholder="+ year" />
                ) : (
                  (foundation.year_founded ?? <StatAdd href={foundationHref}>+ year</StatAdd>)
                ),
                "/company_foundation/year_founded",
                foundation.year_founded !== null,
              ),
            },
            {
              label: "Employees",
              icon: "users",
              value: withSource(
                edit ? (
                  <InlineLine spec={FIELDS.employees} shown={employees} placeholder="+ count" />
                ) : (
                  (employees ?? <StatAdd href={foundationHref}>+ count</StatAdd>)
                ),
                "/company_foundation/employee_count",
                employees !== null,
              ),
            },
            {
              label: "Legal entity",
              icon: "building",
              value: withSource(
                edit ? (
                  <InlineLine spec={FIELDS.legal} shown={legal} placeholder="+ LLC, Inc…" />
                ) : (
                  (legal ?? <StatAdd href={foundationHref}>+ LLC, Inc…</StatAdd>)
                ),
                "/company_foundation/legal_entity_type",
                legal !== null,
              ),
            },
          ]}
        />
      </Banner>
      <div className="knowledge-view__grid knowledge-view__grid--2">
        <KnowledgeCard title="Headquarters" subtitle="Main address and other locations.">
          {main || others.length > 0 ? (
            <>
              {main ? (
                <div className="knowledge-view__location">
                  <span className="knowledge-view__location-icon" aria-hidden="true"><Icon name="pin" size={16} /></span>
                  <div>
                    <p className="knowledge-view__mini-label">Main <Source evidence={ev} path={mainPath} filled /></p>
                    <p>{main}</p>
                  </div>
                </div>
              ) : (
                <CoverageNote evidence={ev} path={mainPath} empty label="Main address" />
              )}
              {main && <CoverageNote evidence={ev} path={mainPath} empty={false} />}
              {others.length > 0 ? (
                <>
                  <p className="knowledge-view__mini-label">Other locations <Source evidence={ev} path={othersPath} filled /></p>
                  <ul className="knowledge-view__list">
                    {others.map((address) => (
                      <li key={address.id}>
                        {address.label && <strong>{address.label}</strong>}
                        <span>{address.text}</span>
                        <ItemSource evidence={ev} path={`${othersPath}/@${address.id}`} name={address.label ?? address.text ?? "location"} />
                      </li>
                    ))}
                  </ul>
                  <CoverageNote evidence={ev} path={othersPath} empty={false} />
                </>
              ) : (
                <CoverageNote evidence={ev} path={othersPath} empty label="Other locations" />
              )}
            </>
          ) : (
            <EmptyBox
              title="No headquarters yet"
              hint="Add the main address and any other locations."
              href={foundationHref}
              note={
                <>
                  <CoverageNote evidence={ev} path={mainPath} empty label="Main address" />
                  <CoverageNote evidence={ev} path={othersPath} empty label="Other locations" />
                </>
              }
            />
          )}
        </KnowledgeCard>
        <KnowledgeCard
          title="Alternate names"
          subtitle="Other ways the company is known."
          source={<Source evidence={ev} path={namesPath} filled={alternates.length > 0} />}
        >
          {edit ? (
            <InlineChips list={LISTS.names} items={alternates} />
          ) : (
            <Chips items={alternates} href={foundationHref} noun="alternate name" />
          )}
          <CoverageNote evidence={ev} path={namesPath} empty={alternates.length === 0} />
        </KnowledgeCard>
        <KnowledgeCard
          title="Overview"
          subtitle="The elevator pitch."
          source={<Source evidence={ev} path={overviewPath} filled={overview !== null} />}
        >
          {edit ? (
            <InlineArea
              spec={FIELDS.overview}
              value={overview}
              empty={{ title: "No overview yet", hint: "Summarize what the company does in a few sentences." }}
              note={<CoverageNote evidence={ev} path={overviewPath} empty={overview === null} />}
            />
          ) : overview ? (
            <>
              <p className="knowledge-view__text">{overview}</p>
              <CoverageNote evidence={ev} path={overviewPath} empty={false} />
            </>
          ) : (
            <EmptyBox
              title="No overview yet"
              hint="Summarize what the company does in a few sentences."
              href={foundationHref}
              note={<CoverageNote evidence={ev} path={overviewPath} empty />}
            />
          )}
        </KnowledgeCard>
        <KnowledgeCard
          title="Founding story"
          subtitle="How it all started."
          source={<Source evidence={profile.evidence.positioning} path={storyPath} filled={story !== null} />}
        >
          {edit ? (
            <InlineArea
              spec={FIELDS.story}
              value={story}
              empty={{ title: "No founding story yet", hint: "Capture how and why the company began." }}
              note={<CoverageNote evidence={profile.evidence.positioning} path={storyPath} empty={story === null} />}
            />
          ) : story ? (
            <>
              <p className="knowledge-view__text">{story}</p>
              <CoverageNote evidence={profile.evidence.positioning} path={storyPath} empty={false} />
            </>
          ) : (
            <EmptyBox
              title="No founding story yet"
              hint="Capture how and why the company began."
              href={addHref(companyId, "positioning")}
              note={<CoverageNote evidence={profile.evidence.positioning} path={storyPath} empty />}
            />
          )}
        </KnowledgeCard>
      </div>
    </>
  );
}
