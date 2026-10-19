import { safeHref } from "../shared/citation-popover";
import { socialHandle, textOrNull, type ViewProfile } from "./data";
import { FIELDS, InlineArea, InlineChips, LISTS, useEdit } from "./inline-edit";
import { addHref, Banner, Chips, CoverageNote, EmptyBox, ItemSource, KnowledgeCard, Source, useEvidenceShown, StatAdd, Stats } from "./parts";

export function SalesMarketing({ companyId, name, profile }: { companyId: string; name: string; profile: ViewProfile }) {
  const { positioning, market, presence } = profile;
  // An editable draft edits these values in place; a saved version and a viewer see text and "+ Add" links.
  const edit = useEdit() !== null;
  // Lists are edited in place in the hub; the saved-version view keeps its evidence markers and links there.
  const evidenceShown = useEvidenceShown();
  const inPlace = edit && !evidenceShown;
  const mev = profile.evidence.market;
  const pev = profile.evidence.positioning;
  const oev = profile.evidence.presence;
  const marketHref = addHref(companyId, "market_and_customers");
  const p = {
    pitch: "/positioning/company_pitch",
    personas: "/market_and_customers/ideal_customer_personas",
    needs: "/market_and_customers/customer_needs",
    channels: "/market_and_customers/channels",
    ctas: "/market_and_customers/ctas",
    funnels: "/market_and_customers/funnels",
    socials: "/online_presence/social_media_links",
  };
  const pitch = textOrNull(positioning.company_pitch);
  // A persona counts as filled when any of its fields has content; name and role may both be null.
  const personas = market.ideal_customer_personas
    .map((persona) => {
      const goals = persona.goals.map((g) => g.text.trim()).filter(Boolean);
      const painPoints = persona.pain_points.map((g) => g.text.trim()).filter(Boolean);
      const personaName = textOrNull(persona.name);
      const role = textOrNull(persona.role);
      const organization = textOrNull(persona.organization_type);
      // Never invent a name: fall back to what the data says, then to a numbered label.
      return {
        id: persona.id,
        personaName,
        role,
        organization,
        goals,
        painPoints,
        filled: Boolean(personaName || role || organization || goals.length || painPoints.length),
      };
    })
    .filter((persona) => persona.filled)
    // Number after dropping blanks, so labels read Persona 1, 2, 3 for what is shown.
    .map((persona, index) => {
      const heading = persona.personaName ?? persona.role ?? persona.organization ?? `Persona ${index + 1}`;
      return {
        ...persona,
        heading,
        role: persona.role !== heading ? persona.role : null,
        organization: persona.organization !== heading ? persona.organization : null,
      };
    });
  const needs = market.customer_needs.filter((item) => item.text.trim());
  const channels = market.channels
    .map((item) => ({ ...item, url: textOrNull(item.url) }))
    .map((item) => ({
      id: item.id,
      label: textOrNull(item.label) ?? item.url ?? textOrNull(item.channel_type) ?? "",
      detail: textOrNull(item.label) || item.url ? textOrNull(item.channel_type) : null,
      mark: (
        <ItemSource
          evidence={mev}
          path={`${p.channels}/@${item.id}`}
          name={textOrNull(item.label) ?? item.url ?? textOrNull(item.channel_type) ?? "channel"}
        />
      ),
    }))
    .filter((item) => item.label);
  const ctas = market.ctas
    .map((item) => ({
      id: item.id,
      label: item.label.trim(),
      detail: textOrNull(item.purpose),
      mark: <ItemSource evidence={mev} path={`${p.ctas}/@${item.id}`} name={item.label.trim()} />,
    }))
    .filter((item) => item.label);
  const funnels = market.funnels.filter((funnel) => textOrNull(funnel.name) || funnel.steps.length > 0);
  return (
    <>
      <Banner
        label="Sales & Marketing"
        title={name}
        note={<CoverageNote evidence={oev} path={p.socials} empty={presence.social_media_links.length === 0} label="Social links" />}
      >
        {inPlace ? (
          <div className="knowledge-view__socials">
            <p className="knowledge-view__mini-label">Social links</p>
            <InlineChips
              list={LISTS.socials}
              items={presence.social_media_links.map((link) => ({ id: link.id, label: socialHandle(link), detail: link.platform }))}
            />
          </div>
        ) : (
        <Stats
          stats={
            presence.social_media_links.length > 0
              ? presence.social_media_links.map((link) => {
                  const href = safeHref(link.profile_url);
                  const handle = socialHandle(link);
                  return {
                    label: link.platform,
                    icon: "link" as const,
                    value: (
                      <>
                        {href ? <a href={href} rel="noreferrer">{handle}</a> : handle}
                        <Source evidence={oev} path={`${p.socials}/@${link.id}`} filled name={link.platform} />
                      </>
                    ),
                  };
                })
              : [
                  {
                    label: "Social links",
                    icon: "link" as const,
                    value: (
                      <>
                        <StatAdd href={addHref(companyId, "online_presence")}>+ profile link</StatAdd>
                        <Source evidence={oev} path={p.socials} filled={false} />
                      </>
                    ),
                  },
                ]
          }
        />
        )}
      </Banner>
      <div className="knowledge-view__grid knowledge-view__grid--3">
        <KnowledgeCard
          title="Pitch"
          subtitle="The one-paragraph version."
          source={<Source evidence={pev} path={p.pitch} filled={pitch !== null} />}
        >
          {edit ? (
            <InlineArea
              spec={FIELDS.pitch}
              value={pitch}
              empty={{ title: "No pitch yet", hint: "A short statement that can be repeated verbatim." }}
              note={<CoverageNote evidence={pev} path={p.pitch} empty={pitch === null} />}
            />
          ) : pitch ? (
            <>
              <p className="knowledge-view__text">{pitch}</p>
              <CoverageNote evidence={pev} path={p.pitch} empty={false} />
            </>
          ) : (
            <EmptyBox
              title="No pitch yet"
              hint="A short statement that can be repeated verbatim."
              href={addHref(companyId, "positioning")}
              note={<CoverageNote evidence={pev} path={p.pitch} empty />}
            />
          )}
        </KnowledgeCard>
        <KnowledgeCard
          title="Ideal persona"
          subtitle="The person you sell to."
          source={<Source evidence={mev} path={p.personas} filled={personas.length > 0} />}
        >
          {inPlace ? (
            <InlineChips
              list={LISTS.personas}
              items={personas.map((persona) => ({
                id: persona.id,
                label: persona.heading,
                detail: [persona.role, persona.organization].filter(Boolean).join(" · ") || null,
              }))}
            />
          ) : personas.length > 0 ? (
            <>
              <ul className="knowledge-view__list">
                {personas.map((persona) => (
                  <li key={persona.id}>
                    <strong>{persona.heading}</strong>
                    {persona.role && <span>{persona.role}</span>}
                    {persona.organization && <small>{persona.organization}</small>}
                    {persona.goals.length > 0 && <small>Goals: {persona.goals.join("; ")}</small>}
                    {persona.painPoints.length > 0 && <small>Pain points: {persona.painPoints.join("; ")}</small>}
                    <ItemSource evidence={mev} path={`${p.personas}/@${persona.id}`} name={persona.heading} />
                  </li>
                ))}
              </ul>
              <CoverageNote evidence={mev} path={p.personas} empty={false} />
            </>
          ) : (
            <EmptyBox
              title="No ideal persona yet"
              hint="Capture who to picture when speaking."
              href={marketHref}
              note={<CoverageNote evidence={mev} path={p.personas} empty />}
            />
          )}
        </KnowledgeCard>
        <KnowledgeCard
          title="Customer needs"
          subtitle="The pains and jobs to be done."
          source={<Source evidence={mev} path={p.needs} filled={needs.length > 0} />}
        >
          {edit ? (
            <>
              <InlineChips
                list={LISTS.needs}
                items={needs.map((need) => ({
                  id: need.id,
                  label: need.text.trim(),
                  mark: <ItemSource evidence={mev} path={`${p.needs}/@${need.id}`} name={need.text.trim()} />,
                }))}
              />
              <CoverageNote evidence={mev} path={p.needs} empty={needs.length === 0} />
            </>
          ) : needs.length > 0 ? (
            <>
              <ul className="knowledge-view__list">
                {needs.map((need) => (
                  <li key={need.id}>
                    <span>{need.text}</span>
                    <ItemSource evidence={mev} path={`${p.needs}/@${need.id}`} name={need.text.trim()} />
                  </li>
                ))}
              </ul>
              <CoverageNote evidence={mev} path={p.needs} empty={false} />
            </>
          ) : (
            <EmptyBox
              title="No needs captured"
              hint="List the underlying problems to speak to."
              href={marketHref}
              note={<CoverageNote evidence={mev} path={p.needs} empty />}
            />
          )}
        </KnowledgeCard>
      </div>
      <div className="knowledge-view__grid knowledge-view__grid--3">
        <KnowledgeCard
          title="Channels"
          subtitle="Where your story lives."
          source={<Source evidence={mev} path={p.channels} filled={channels.length > 0} />}
        >
          {inPlace ? <InlineChips list={LISTS.channels} items={channels} /> : <Chips items={channels} href={marketHref} noun="channel" />}
          <CoverageNote evidence={mev} path={p.channels} empty={channels.length === 0} />
        </KnowledgeCard>
        <KnowledgeCard
          title="Calls to action"
          subtitle="The prompts you point people to."
          source={<Source evidence={mev} path={p.ctas} filled={ctas.length > 0} />}
        >
          {inPlace ? <InlineChips list={LISTS.ctas} items={ctas} /> : <Chips items={ctas} href={marketHref} noun="call to action" />}
          <CoverageNote evidence={mev} path={p.ctas} empty={ctas.length === 0} />
        </KnowledgeCard>
        <KnowledgeCard
          title="Funnels"
          subtitle="The journeys you run."
          source={<Source evidence={mev} path={p.funnels} filled={funnels.length > 0} />}
        >
          {inPlace ? (
            <InlineChips
              list={LISTS.funnels}
              items={funnels.map((funnel) => ({
                id: funnel.id,
                label: textOrNull(funnel.name) ?? "Funnel",
                detail: funnel.steps.map((step) => step.label).join(" → ") || null,
              }))}
            />
          ) : funnels.length > 0 ? (
            <ul className="knowledge-view__list">
              {funnels.map((funnel) => (
                <li key={funnel.id}>
                  <strong>{textOrNull(funnel.name) ?? "Funnel"}</strong>
                  {funnel.steps.length > 0 && (
                    <ol className="knowledge-view__steps">
                      {funnel.steps.map((step) => <li key={step.id}>{step.label}</li>)}
                    </ol>
                  )}
                  <ItemSource evidence={mev} path={`${p.funnels}/@${funnel.id}`} name={textOrNull(funnel.name) ?? "funnel"} />
                </li>
              ))}
            </ul>
          ) : (
            <Chips items={[]} href={marketHref} noun="funnel" />
          )}
          <CoverageNote evidence={mev} path={p.funnels} empty={funnels.length === 0} />
        </KnowledgeCard>
      </div>
    </>
  );
}
