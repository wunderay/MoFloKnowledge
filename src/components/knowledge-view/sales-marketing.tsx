import { safeHref } from "../citation-popover";
import { socialHandle, textOrNull, type ViewProfile } from "./data";
import { addHref, Banner, Chips, EmptyBox, KnowledgeCard, StatAdd, Stats } from "./parts";

export function SalesMarketing({ companyId, name, profile }: { companyId: string; name: string; profile: ViewProfile }) {
  const { positioning, market, presence } = profile;
  const marketHref = addHref(companyId, "market_and_customers");
  const pitch = textOrNull(positioning.company_pitch);
  const personas = market.ideal_customer_personas.filter((p) => textOrNull(p.name) || textOrNull(p.role));
  const needs = market.customer_needs.filter((item) => item.text.trim());
  const channels = market.channels
    .map((item) => ({ id: item.id, label: textOrNull(item.label) ?? item.url ?? "", detail: textOrNull(item.channel_type) }))
    .filter((item) => item.label);
  const ctas = market.ctas
    .map((item) => ({ id: item.id, label: item.label.trim(), detail: textOrNull(item.purpose) }))
    .filter((item) => item.label);
  const funnels = market.funnels.filter((funnel) => textOrNull(funnel.name) || funnel.steps.length > 0);
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
                    value: href ? <a href={href} rel="noreferrer">{handle}</a> : handle,
                  };
                })
              : [
                  {
                    label: "Social links",
                    icon: "link" as const,
                    value: <StatAdd href={addHref(companyId, "online_presence")}>+ profile link</StatAdd>,
                  },
                ]
          }
        />
      </Banner>
      <div className="knowledge-view__grid knowledge-view__grid--3">
        <KnowledgeCard title="Pitch" subtitle="The one-paragraph version.">
          {pitch ? (
            <p className="knowledge-view__text">{pitch}</p>
          ) : (
            <EmptyBox title="No pitch yet" hint="A short statement that can be repeated verbatim." href={addHref(companyId, "positioning")} />
          )}
        </KnowledgeCard>
        <KnowledgeCard title="Ideal persona" subtitle="The person you sell to.">
          {personas.length > 0 ? (
            <ul className="knowledge-view__list">
              {personas.map((persona) => (
                <li key={persona.id}>
                  <strong>{textOrNull(persona.name) ?? textOrNull(persona.role)}</strong>
                  {textOrNull(persona.name) && textOrNull(persona.role) && <span>{persona.role}</span>}
                  {textOrNull(persona.organization_type) && <small>{persona.organization_type}</small>}
                  {persona.goals.length > 0 && <small>Goals: {persona.goals.map((g) => g.text).join("; ")}</small>}
                  {persona.pain_points.length > 0 && (
                    <small>Pain points: {persona.pain_points.map((p) => p.text).join("; ")}</small>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyBox title="No ideal persona yet" hint="Capture who to picture when speaking." href={marketHref} />
          )}
        </KnowledgeCard>
        <KnowledgeCard title="Customer needs" subtitle="The pains and jobs to be done.">
          {needs.length > 0 ? (
            <ul className="knowledge-view__list">
              {needs.map((need) => <li key={need.id}><span>{need.text}</span></li>)}
            </ul>
          ) : (
            <EmptyBox title="No needs captured" hint="List the underlying problems to speak to." href={marketHref} />
          )}
        </KnowledgeCard>
      </div>
      <div className="knowledge-view__grid knowledge-view__grid--3">
        <KnowledgeCard title="Channels" subtitle="Where your story lives.">
          <Chips items={channels} href={marketHref} noun="channel" />
        </KnowledgeCard>
        <KnowledgeCard title="Calls to action" subtitle="The prompts you point people to.">
          <Chips items={ctas} href={marketHref} noun="call to action" />
        </KnowledgeCard>
        <KnowledgeCard title="Funnels" subtitle="The journeys you run.">
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
        </KnowledgeCard>
      </div>
    </>
  );
}
