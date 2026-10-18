import Link from "next/link";
import { safeHref } from "../shared/citation-popover";
import { AddItem, ColorHex, RemoveItem, useDisplayName } from "./brand-edit";
import { textOrNull, type ViewProfile } from "./data";
import { useEdit } from "./inline-edit";
import { addHref, Banner, CoverageNote, EmptyBox, ItemSource, KnowledgeCard, Source, StatAdd, Stats } from "./parts";

const SAMPLE = "The quick brown fox jumps over the lazy dog";
const HEX = /^#[0-9A-Fa-f]{6}$/;
const POSITIONS = ["Primary", "Secondary", "Tertiary"];
// Website observations are not brand guidance unless marked confirmed (docs/no-ai-redesign.md).
const OBSERVED_COLOR = "Observed website color";
const OBSERVED_FONT = "Observed, not confirmed as brand guidance";
const METHODS: Record<string, string> = {
  css_declared: "declared CSS",
  resource_loaded: "loaded resources",
  computed_family: "computed font family",
};

const UNAVAILABLE_LOGO = "Image unavailable: the address is not an http or https link.";

export function BrandIdentity({
  companyId,
  name,
  profile,
  rename,
}: {
  companyId: string;
  name: string;
  profile: ViewProfile;
  /** An editable draft renames the company here: the draft's generation, whether the view is stale, and the reload after a save. */
  rename?: { generation: number; blocked: boolean; onRenamed: () => Promise<void> };
}) {
  const { branding } = profile;
  // An editable draft edits colors, fonts and logos in place; a saved version and a viewer see text and "+ Add" links.
  const edit = useEdit() !== null;
  const displayName = useDisplayName(companyId, name, rename);
  const ev = profile.evidence.branding;
  const href = addHref(companyId, "branding_and_style");
  const p = {
    logos: "/branding_and_style/logos",
    colors: "/branding_and_style/brand_colors",
    fonts: "/branding_and_style/fonts",
  };
  const company = textOrNull(name);
  // Controls count positions in the entry's own lists ("Remove Logo 3" is the third logo whatever is shown).
  // Only a confirmed color takes the Primary/Secondary/Tertiary position wording; an observed one is "Color N".
  const logos = branding.logos.map((logo, index) => ({
    id: logo.id,
    label: index === 0 ? "Primary" : (textOrNull(logo.variant) ?? "Logo"),
    // Only http(s) addresses become images.
    src: safeHref(logo.url),
  }));
  // A colour reaches a style attribute only when it is exactly #rrggbb; one that is not stays listed as unavailable.
  const colors = branding.brand_colors
    .map((color, index) => ({
      id: color.id,
      hex: color.hex,
      valid: typeof color.hex === "string" && HEX.test(color.hex),
      observed: color.classification !== "brand_guide_confirmed",
      label:
        textOrNull(color.apparent_role) ??
        (color.classification === "brand_guide_confirmed" ? POSITIONS[index] : undefined) ??
        `Color ${index + 1}`,
    }));
  const validColors = colors.filter((color) => color.valid);
  const fonts = branding.fonts
    .map((font, index) => {
      const confirmed = font.brand_confirmed;
      const methods = (font.observations ?? []).map((method) => METHODS[method] ?? method).join(", ");
      return {
        id: font.id,
        family: textOrNull(font.family),
        label: index === 0 && confirmed && textOrNull(font.family) ? "Primary" : `Font ${index + 1}`,
        // Shown on every font that is only an observation, with how it was observed.
        qualifier: confirmed ? null : methods ? `${OBSERVED_FONT} (${methods})` : OBSERVED_FONT,
      };
    });
  // A font without a family stays listed as unavailable, but is never the banner's font.
  const usableFonts = fonts.filter((font): font is typeof font & { family: string } => font.family !== null);
  const logoAlt = (label: string) => `${company ?? "Company"} logo (${label})`;
  const primaryLogo = logos[0];
  const primaryFont = usableFonts[0];
  const shownColors = validColors.slice(0, 3);
  return (
    <>
      <Banner
        label="Brand Identity"
        title={displayName ? displayName.control : (company ?? "Your company")}
        titleFeedback={displayName ? displayName.feedback : undefined}
        placeholder={!company && !displayName}
        caption="Display name"
      >
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
                  {validColors.length > 0 ? (
                    <span className="knowledge-view__palette">
                      {shownColors.map((color) => (
                        <span
                          className="knowledge-view__palette-swatch"
                          key={color.id}
                          style={{ backgroundColor: color.hex }}
                          role="img"
                          aria-label={`${color.label} ${color.hex}${color.observed ? `, ${OBSERVED_COLOR.toLowerCase()}` : ""}`}
                        />
                      ))}
                    </span>
                  ) : (
                    <StatAdd href={href}>+ colors</StatAdd>
                  )}
                  {shownColors.some((color) => color.observed) && (
                    <small className="knowledge-view__qualifier">
                      {shownColors.every((color) => color.observed) ? "Observed website colors" : "Includes observed website colors"}
                    </small>
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
                  {primaryFont?.qualifier && <small className="knowledge-view__qualifier">{primaryFont.qualifier}</small>}
                  <Source
                    evidence={ev}
                    path={primaryFont ? `${p.fonts}/@${primaryFont.id}` : p.fonts}
                    filled={primaryFont !== undefined}
                    name={primaryFont ? (primaryFont.qualifier ? `${primaryFont.family}, ${primaryFont.qualifier.toLowerCase()}` : primaryFont.family) : undefined}
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
          subtitle="Logos recorded for the brand."
          source={<Source evidence={ev} path={p.logos} filled={logos.length > 0} />}
        >
          {logos.length > 0 ? (
            <>
              <ul className="knowledge-view__tiles">
                {logos.map((logo, index) => (
                  <li className="knowledge-view__tile" key={logo.id}>
                    <span className="knowledge-view__logo-frame">
                      {logo.src ? <img src={logo.src} alt={logoAlt(logo.label)} /> : <small>{UNAVAILABLE_LOGO}</small>}
                    </span>
                    <span className="knowledge-view__tile-caption">
                      <strong>{logo.label}</strong>
                      <ItemSource evidence={ev} path={`${p.logos}/@${logo.id}`} name={logo.label} />
                      {edit && <RemoveItem list="logos" id={logo.id} noun="Logo" position={index + 1} />}
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
          subtitle="Colors recorded for the brand."
          source={<Source evidence={ev} path={p.colors} filled={colors.length > 0} />}
        >
          {colors.length > 0 || edit ? (
            <>
              <ul className="knowledge-view__tiles">
                {colors.map((color, index) => (
                  <li className="knowledge-view__tile" key={color.id}>
                    {color.valid ? (
                      <span className="knowledge-view__swatch" style={{ backgroundColor: color.hex }}>
                        <span className="knowledge-view__swatch-hex" aria-hidden="true">{color.hex}</span>
                      </span>
                    ) : (
                      <span className="knowledge-view__swatch knowledge-view__swatch--unavailable" />
                    )}
                    <span className="knowledge-view__tile-caption">
                      <strong>{color.label}</strong>
                      <ItemSource
                        evidence={ev}
                        path={`${p.colors}/@${color.id}`}
                        name={color.valid ? `${color.label} ${color.hex}${color.observed ? `, ${OBSERVED_COLOR.toLowerCase()}` : ""}` : color.label}
                      />
                      {edit && <RemoveItem list="brand_colors" id={color.id} noun="Color" position={index + 1} />}
                    </span>
                    {color.valid && color.observed && <small className="knowledge-view__qualifier">{OBSERVED_COLOR}</small>}
                    {!color.valid && <small>Color unavailable: it is not a valid #RRGGBB value.</small>}
                    {edit ? <ColorHex id={color.id} position={index + 1} hex={String(color.hex)} /> : color.valid && <small>{color.hex}</small>}
                  </li>
                ))}
                <li className="knowledge-view__tile">
                  {edit ? (
                    <AddItem noun="color" className="knowledge-view__tile-add" />
                  ) : (
                    <Link className="knowledge-view__tile-add" href={href}>+ Add Color</Link>
                  )}
                </li>
              </ul>
              <CoverageNote evidence={ev} path={p.colors} empty={colors.length === 0} />
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
          subtitle="Type families recorded for the brand."
          source={<Source evidence={ev} path={p.fonts} filled={fonts.length > 0} />}
        >
          {fonts.length > 0 || edit ? (
            <>
              <ul className="knowledge-view__fonts">
                {fonts.map((font, index) => (
                  <li className="knowledge-view__font-row" key={font.id}>
                    <div className="knowledge-view__font-name">
                      <p className="knowledge-view__mini-label">{font.label}</p>
                      <strong>{font.family ?? "Font unavailable: it has no family name."}</strong>
                      {font.family !== null && font.qualifier && <small className="knowledge-view__qualifier">{font.qualifier}</small>}
                      <ItemSource
                        evidence={ev}
                        path={`${p.fonts}/@${font.id}`}
                        name={font.family === null ? font.label : font.qualifier ? `${font.family}, ${font.qualifier.toLowerCase()}` : font.family}
                      />
                      {edit && <RemoveItem list="fonts" id={font.id} noun="Font" position={index + 1} />}
                    </div>
                    {font.family !== null && <p className="knowledge-view__font-sample">{SAMPLE}</p>}
                  </li>
                ))}
              </ul>
              {edit ? (
                <AddItem noun="font" className="knowledge-view__tile-add knowledge-view__tile-add--row" />
              ) : (
                <Link className="knowledge-view__tile-add knowledge-view__tile-add--row" href={href}>+ Add Font</Link>
              )}
              <CoverageNote evidence={ev} path={p.fonts} empty={fonts.length === 0} />
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
