import Link from "next/link";
import { safeHref } from "../citation-popover";
import { textOrNull, type ViewProfile } from "./data";
import { addHref, Banner, CoverageNote, EmptyBox, ItemSource, KnowledgeCard, Source, StatAdd, Stats } from "./parts";

const SAMPLE = "The quick brown fox jumps over the lazy dog";
const HEX = /^#[0-9A-Fa-f]{6}$/;
const POSITIONS = ["Primary", "Secondary", "Tertiary"];

export function BrandIdentity({ companyId, name, profile }: { companyId: string; name: string; profile: ViewProfile }) {
  const { branding } = profile;
  const ev = profile.evidence.branding;
  const href = addHref(companyId, "branding_and_style");
  const p = {
    logos: "/branding_and_style/logos",
    colors: "/branding_and_style/brand_colors",
    fonts: "/branding_and_style/fonts",
  };
  const company = textOrNull(name);
  // Labels count positions in the entry's own lists, so "Logo 3" is the third logo whatever is shown.
  const logos = branding.logos.map((logo, index) => ({
    id: logo.id,
    label: index === 0 ? "Primary" : (textOrNull(logo.variant) ?? `Logo ${index + 1}`),
    // Only http(s) addresses become images.
    src: safeHref(logo.url),
  }));
  // A colour reaches a style attribute only when it is exactly #rrggbb.
  const colors = branding.brand_colors
    .map((color, index) => ({
      id: color.id,
      hex: color.hex,
      label: textOrNull(color.apparent_role) ?? POSITIONS[index] ?? `Color ${index + 1}`,
    }))
    .filter((color) => typeof color.hex === "string" && HEX.test(color.hex));
  const fonts = branding.fonts
    .map((font, index) => ({ id: font.id, family: textOrNull(font.family), label: index === 0 ? "Primary" : `Font ${index + 1}` }))
    .filter((font): font is { id: string; family: string; label: string } => font.family !== null);
  const logoAlt = (label: string) => `${company ?? "Company"} logo (${label})`;
  const primaryLogo = logos[0];
  const primaryFont = fonts[0];
  return (
    <>
      <Banner label="Brand Identity" title={company ?? "Your company"} placeholder={!company} caption="Display name">
        <Stats
          stats={[
            {
              label: "Logo",
              icon: "companies",
              value: (
                <>
                  {primaryLogo ? (
                    primaryLogo.src ? (
                      <img className="knowledge-view__banner-logo" src={primaryLogo.src} alt={logoAlt(primaryLogo.label)} />
                    ) : (
                      primaryLogo.label
                    )
                  ) : (
                    <StatAdd href={href}>+ logo</StatAdd>
                  )}
                  <Source
                    evidence={ev}
                    path={primaryLogo ? `${p.logos}/@${primaryLogo.id}` : p.logos}
                    filled={primaryLogo !== undefined}
                    name={primaryLogo ? `${primaryLogo.label} logo` : undefined}
                  />
                  <CoverageNote evidence={ev} path={p.logos} empty={!primaryLogo} />
                </>
              ),
            },
            {
              label: "Palette",
              icon: "layers",
              value: (
                <>
                  {colors.length > 0 ? (
                    <span className="knowledge-view__palette">
                      {colors.slice(0, 3).map((color) => (
                        <span
                          className="knowledge-view__palette-swatch"
                          key={color.id}
                          style={{ backgroundColor: color.hex }}
                          role="img"
                          aria-label={`${color.label} ${color.hex}`}
                        />
                      ))}
                    </span>
                  ) : (
                    <StatAdd href={href}>+ colors</StatAdd>
                  )}
                  <Source evidence={ev} path={p.colors} filled={colors.length > 0} />
                  <CoverageNote evidence={ev} path={p.colors} empty={colors.length === 0} />
                </>
              ),
            },
            {
              label: "Font",
              icon: "profile",
              value: (
                <>
                  {primaryFont ? (
                    <span className="knowledge-view__font-badge">
                      <span className="knowledge-view__font-tile" aria-hidden="true">Aa</span>
                      <span>{primaryFont.family}</span>
                    </span>
                  ) : (
                    <StatAdd href={href}>+ font</StatAdd>
                  )}
                  <Source
                    evidence={ev}
                    path={primaryFont ? `${p.fonts}/@${primaryFont.id}` : p.fonts}
                    filled={primaryFont !== undefined}
                    name={primaryFont?.family}
                  />
                  <CoverageNote evidence={ev} path={p.fonts} empty={!primaryFont} />
                </>
              ),
            },
          ]}
        />
      </Banner>
      <div className="knowledge-view__grid knowledge-view__grid--2">
        <KnowledgeCard
          title="Logos"
          subtitle="Marks used across content."
          source={<Source evidence={ev} path={p.logos} filled={logos.length > 0} />}
        >
          {logos.length > 0 ? (
            <>
              <ul className="knowledge-view__tiles">
                {logos.map((logo) => (
                  <li className="knowledge-view__tile" key={logo.id}>
                    <span className="knowledge-view__logo-frame">
                      {logo.src ? <img src={logo.src} alt={logoAlt(logo.label)} /> : <small>Image unavailable</small>}
                    </span>
                    <span className="knowledge-view__tile-caption">
                      <strong>{logo.label}</strong>
                      <ItemSource evidence={ev} path={`${p.logos}/@${logo.id}`} name={logo.label} />
                    </span>
                  </li>
                ))}
                <li className="knowledge-view__tile">
                  <Link className="knowledge-view__tile-add knowledge-view__tile-add--logo" href={href}>+ Add Logo</Link>
                </li>
              </ul>
              <CoverageNote evidence={ev} path={p.logos} empty={false} />
            </>
          ) : (
            <EmptyBox
              title="No logos yet"
              hint="Add the marks your brand uses."
              href={href}
              note={<CoverageNote evidence={ev} path={p.logos} empty />}
            />
          )}
        </KnowledgeCard>
        <KnowledgeCard
          title="Colors"
          subtitle="Brand colors used across content."
          source={<Source evidence={ev} path={p.colors} filled={colors.length > 0} />}
        >
          {colors.length > 0 ? (
            <>
              <ul className="knowledge-view__tiles">
                {colors.map((color) => (
                  <li className="knowledge-view__tile" key={color.id}>
                    <span className="knowledge-view__swatch" style={{ backgroundColor: color.hex }}>
                      <span className="knowledge-view__swatch-hex" aria-hidden="true">{color.hex}</span>
                    </span>
                    <span className="knowledge-view__tile-caption">
                      <strong>{color.label}</strong>
                      <ItemSource evidence={ev} path={`${p.colors}/@${color.id}`} name={`${color.label} ${color.hex}`} />
                    </span>
                    <small>{color.hex}</small>
                  </li>
                ))}
                <li className="knowledge-view__tile">
                  <Link className="knowledge-view__tile-add" href={href}>+ Add Color</Link>
                </li>
              </ul>
              <CoverageNote evidence={ev} path={p.colors} empty={false} />
            </>
          ) : (
            <EmptyBox
              title="No colors yet"
              hint="Add the brand colors."
              href={href}
              note={<CoverageNote evidence={ev} path={p.colors} empty />}
            />
          )}
        </KnowledgeCard>
      </div>
      <div className="knowledge-view__grid knowledge-view__grid--1">
        <KnowledgeCard
          title="Fonts"
          subtitle="Type families used across content."
          source={<Source evidence={ev} path={p.fonts} filled={fonts.length > 0} />}
        >
          {fonts.length > 0 ? (
            <>
              <ul className="knowledge-view__fonts">
                {fonts.map((font) => (
                  <li className="knowledge-view__font-row" key={font.id}>
                    <div className="knowledge-view__font-name">
                      <p className="knowledge-view__mini-label">{font.label}</p>
                      <strong>{font.family}</strong>
                      <ItemSource evidence={ev} path={`${p.fonts}/@${font.id}`} name={font.family} />
                    </div>
                    <p className="knowledge-view__font-sample">{SAMPLE}</p>
                  </li>
                ))}
              </ul>
              <Link className="knowledge-view__tile-add knowledge-view__tile-add--row" href={href}>+ Add Font</Link>
              <CoverageNote evidence={ev} path={p.fonts} empty={false} />
            </>
          ) : (
            <EmptyBox
              title="No fonts yet"
              hint="Add the type families the brand uses."
              href={href}
              note={<CoverageNote evidence={ev} path={p.fonts} empty />}
            />
          )}
        </KnowledgeCard>
      </div>
    </>
  );
}
