// Regression: a persona whose name and role are null but which carries an
// organization type, goals or pain points is real data, not an empty card.
import { describe, expect, it } from "vitest";
import {
  SNAPSHOT_ID,
  buildBusiness,
  draftFrom,
  snapshotFrom,
} from "../helpers/knowledge-view-fixtures";
import { card, cardText, norm } from "../helpers/knowledge-view-dom";
import { openSection, titlesOf } from "../helpers/knowledge-view-spec";

const PERSONA_ID = "00000000-0000-4000-8000-0000000f2001";
const GOAL_ID = "00000000-0000-4000-8000-0000000f2002";
const PAIN_ID = "00000000-0000-4000-8000-0000000f2003";

function businessWith(personas: unknown[]) {
  const b = buildBusiness();
  b.market_and_customers.ideal_customer_personas = personas as never;
  return b;
}
const unnamed = {
  id: PERSONA_ID,
  name: null,
  role: null,
  organization_type: "Independent veterinary clinics",
  goals: [{ id: GOAL_ID, text: "Reduce appointment administration" }],
  pain_points: [],
};

const sources = {
  draft: (b: ReturnType<typeof buildBusiness>) => openSection("Sales & Marketing", { draft: draftFrom(b) }),
  snapshot: (b: ReturnType<typeof buildBusiness>) =>
    openSection("Sales & Marketing", {
      snapshot: { payload: snapshotFrom(draftFrom(b)), versionId: SNAPSHOT_ID },
    }),
};

describe.each(["draft", "snapshot"] as const)("Ideal persona without a name or role (%s)", (source) => {
  const personaCard = async (personas: unknown[]) => {
    const page = await sources[source](businessWith(personas));
    return cardText(page, card(page, "Ideal persona", titlesOf("Sales & Marketing"))!);
  };

  // behavioural
  it("shows the organization type and goal, not the empty state", async () => {
    const text = await personaCard([unnamed]);
    expect(text).toContain("Independent veterinary clinics");
    expect(text).toContain("Reduce appointment administration");
    expect(text).not.toMatch(/No ideal persona yet/i);
  });

  // behavioural
  it("Edge case: pain points alone are enough, under a numbered neutral heading", async () => {
    const text = await personaCard([
      { ...unnamed, organization_type: null, goals: [], pain_points: [{ id: PAIN_ID, text: "Paper intake forms" }] },
    ]);
    expect(text).toContain("Paper intake forms");
    expect(text).toContain("Persona 1");
    expect(text).not.toMatch(/No ideal persona yet/i);
  });

  // behavioural
  it("Edge case: a persona with nothing in it is skipped, and numbering follows the stored order", async () => {
    const text = await personaCard([
      { id: "00000000-0000-4000-8000-0000000f2004", name: null, role: null, organization_type: null, goals: [], pain_points: [] },
      { ...unnamed, organization_type: null, goals: [{ id: GOAL_ID, text: "Reduce appointment administration" }] },
    ]);
    expect(norm(text)).toContain("Persona 2");
    expect(text).not.toContain("Persona 1");
  });

  // behavioural
  it("Edge case: all personas blank still shows the empty state with its + Add link", async () => {
    const text = await personaCard([
      { id: PERSONA_ID, name: null, role: null, organization_type: null, goals: [], pain_points: [] },
    ]);
    expect(text).toMatch(/No ideal persona yet/i);
  });
});
