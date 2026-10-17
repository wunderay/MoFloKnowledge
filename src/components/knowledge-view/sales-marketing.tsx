import { safeHref } from "../citation-popover";
import { socialHandle, textOrNull, type ViewProfile } from "./data";
import { addHref, Banner, Chips, CoverageNote, EmptyBox, KnowledgeCard, Source, StatAdd, Stats } from "./parts";

export function SalesMarketing({ companyId, name, profile }: { companyId: string; name: string; profile: ViewProfile }) {
  const { positioning, market, presence } = profile;
  const mev = profile.evidence.market;
  const pev = profile.evidence.positioning;
  const oev = profile.evidence.presence;
  const marketHref = addHref(companyId, "market_and_customers");
  const pitch = textOrNull(positioning.company_pitch);
  // A persona counts as filled when any of its fields has content; name and role may both be null.
  const personas = market.ideal_customer_personas
    .map((persona, index) => {
      const goals = persona.goals.map((g) => g.text.trim()).filter(Boolean);
      const painPoints = persona.pain_points.map((g) => g.text.trim()).filter(Boolean);
      const personaName = textOrNull(persona.name);
      const role = textOrNull(persona.role);
      const organization = textOrNull(persona.organization_type);
      // Never invent a name: fall back to what the data says, then to a numbered label.
      const heading = personaName ?? role ?? organization ?? `Persona ${index + 1}`;
      return {
        id: persona.id,
        heading,
        role: role !== heading ? role : null,
        organization: organization !== heading ? organization : null,
        goals,
        painPoints,
        filled: Boolean(personaName || role || organization || goals.length || painPoints.length),
      };
    })
    .filter((persona) => persona.filled);
  const needs = market.customer_needs.filter((item) => item.text.trim());
  const channels = market.channels
    .map((item) => ({
      id: item.id,
      label: textOrNull(item.label) ?? item.url ?? textOrNull(item.channel_type) ?? "",
      detail: textOrNull(item.label) || item.url ? textOrNull(item.channel_type) : null,
    }))
    .filter((item) => item.label);
  const ctas = market.ctas
    .map((item) => ({ id: item.id, label: item.label.trim(), detail: textOrNull(item.purpose) }))
    .filter((item) => item.label);
  const funnels = market.funnels.filter((funnel) => textOrNull(funnel.name) || funnel.steps.length > 0);
  const p = {
    pitch: "/positioning/company_pitch",
    personas: "/market_and_customers/ideal_customer_personas",
    needs: "/market_and_customers/customer_needs",
    channels: "/market_and_customers/channels",
    ctas: "/market_and_customers/ctas",
    funnels: "/market_and_customers/funnels",
    socials: "/online_presence/social_media_links",
  };
  return (
    <>
      <Banner label="Sales & Marketing" title={name}>
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
                        <Source evidence={oev} path={`${p.socials}/@${link.id}`} filled />
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
      </Banner>
      <div className="knowledge-view__grid knowledge-view__grid--3">
        <KnowledgeCard
          title="Pitch"
          subtitle="The one-paragraph version."
          source={<Source evidence={pev} path={p.pitch} filled={pitch !== null} />}
        >
          {pitch ? (
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
          {personas.length > 0 ? (
            <>
              <ul className="knowledge-view__list">
                {personas.map((persona) => (
                  <li key={persona.id}>
                    <strong>{persona.heading}</strong>
                    {persona.role && <span>{persona.role}</span>}
                    {persona.organization && <small>{persona.organization}</small>}
                    {persona.goals.length > 0 && <small>Goals: {persona.goals.join("; ")}</small>}
                    {persona.painPoints.length > 0 && <small>Pain points: {persona.painPoints.join("; ")}</small>}
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
          {needs.length > 0 ? (
            <>
              <ul className="knowledge-view__list">
                {needs.map((need) => <li key={need.id}><span>{need.text}</span></li>)}
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
          <Chips items={channels} href={marketHref} noun="channel" />
          <CoverageNote evidence={mev} path={p.channels} empty={channels.length === 0} />
        </KnowledgeCard>
        <KnowledgeCard
          title="Calls to action"
          subtitle="The prompts you point people to."
          source={<Source evidence={mev} path={p.ctas} filled={ctas.length > 0} />}
        >
          <Chips items={ctas} href={marketHref} noun="call to action" />
          <CoverageNote evidence={mev} path={p.ctas} empty={ctas.length === 0} />
        </KnowledgeCard>
        <KnowledgeCard
          title="Funnels"
          subtitle="The journeys you run."
          source={<Source evidence={mev} path={p.funnels} filled={funnels.length > 0} />}
        >
          {funnels.length > 0 ? (
            <ul className="knowledge-view__list">
              {funnels.map((funnel) => (
                <li key={funnel.id}>
                  <strong>{textOrNull(funnel.name) ?? "Funnel"}</strong>
                  {funnel.steps.length > 0 && (
                    <ol className="knowledge-view__steps">
                      {funnel.steps.map((step) => <li key={step.id}>{step.label}</li>)}
                    </ol>
                  )}
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
